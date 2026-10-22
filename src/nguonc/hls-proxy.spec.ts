import { describe, expect, it, vi } from 'vitest';
import { HlsProxy } from './hls-proxy.js';

describe('HlsProxy', () => {
  it('publishes a rewritten root playlist at an opaque public URL', () => {
    const proxy = new HlsProxy({
      publicBaseUrl: 'https://nguonc.taisaovayem.com',
      idGenerator: sequence('session', 'init', 'segment'),
    });

    const url = proxy.createSession(sessionInput('#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:2,\nsegment.ts\n'));

    expect(url).toBe('https://nguonc.taisaovayem.com/hls/session/playlist.m3u8');
    expect(proxy.getRootPlaylist('session')).toBe(
      '#EXTM3U\n#EXT-X-MAP:URI="/hls/session/resource/init"\n#EXTINF:2,\n/hls/session/resource/segment\n',
    );
  });

  it('uses a URL-safe movie name for the public playlist filename', () => {
    const proxy = new HlsProxy({
      publicBaseUrl: 'https://nguonc.taisaovayem.com',
      idGenerator: sequence('session', 'segment'),
    });

    const url = proxy.createSession({
      ...sessionInput('#EXTM3U\n#EXTINF:2,\nsegment.ts\n'),
      playlistName: 'Bleach: Huyết Chiến Ngàn Năm – Kiếp Nạn Tập 1',
    });

    expect(url).toBe('https://nguonc.taisaovayem.com/hls/session/bleach-huyet-chien-ngan-nam-kiep-nan-tap-1.m3u8');
  });

  it('keeps a public URL path prefix on playlist resources', () => {
    const proxy = new HlsProxy({
      publicBaseUrl: 'https://nguonc.taisaovayem.com/addon',
      idGenerator: sequence('session', 'segment'),
    });

    const url = proxy.createSession(sessionInput('#EXTM3U\n#EXTINF:2,\nsegment.ts\n'));

    expect(url).toBe('https://nguonc.taisaovayem.com/addon/hls/session/playlist.m3u8');
    expect(proxy.getRootPlaylist('session')).toBe('#EXTM3U\n#EXTINF:2,\n/addon/hls/session/resource/segment\n');
  });

  it('returns no playlist for an expired session or unknown resource without fetching upstream', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const proxy = new HlsProxy({
      publicBaseUrl: 'https://nguonc.taisaovayem.com',
      fetcher,
      now: () => 1_000,
      idGenerator: sequence('expired'),
    });
    proxy.createSession(sessionInput('#EXTM3U\n', { expiresAt: 999 }));

    expect(proxy.getRootPlaylist('expired')).toBeUndefined();
    await expect(proxy.getResource('missing', 'resource')).resolves.toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('forwards a range request for a registered binary segment', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 206,
      headers: { 'Content-Type': 'video/mp2t', 'Content-Range': 'bytes 100-102/400' },
    }));
    const proxy = new HlsProxy({
      publicBaseUrl: 'https://nguonc.taisaovayem.com',
      fetcher,
      idGenerator: sequence('session', 'segment'),
    });
    proxy.createSession(sessionInput('#EXTM3U\n#EXTINF:2,\nsegment.ts\n'));

    const response = await proxy.getResource('session', 'segment', 'bytes=100-');

    expect(response).toMatchObject({ status: 206, contentType: 'video/mp2t', contentRange: 'bytes 100-102/400' });
    expect(response?.body).toEqual(new Uint8Array([1, 2, 3]));
    expect(fetcher.mock.calls.some(([, options]) => new Headers(options?.headers).get('range') === 'bytes=100-')).toBe(true);
  });

  it('uses the embed origin as the referer for CDN-hosted segments', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([1]), {
      headers: { 'Content-Type': 'video/mp2t' },
    }));
    const proxy = new HlsProxy({
      publicBaseUrl: 'https://nguonc.taisaovayem.com',
      fetcher,
      idGenerator: sequence('session', 'segment'),
    });
    proxy.createSession({
      ...sessionInput('#EXTM3U\n#EXTINF:2,\nhttps://cdn.example/segment.ts\n'),
      sourceUrl: 'https://cdn.example/playlist.m3u8',
      refererUrl: 'https://embed15.streamc.xyz/embed.php?hash=e98bc48528bc4c91980a653c79e38b16',
    });

    await proxy.getResource('session', 'segment');

    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('referer')).toBe('https://embed15.streamc.xyz/');
  });

  it('rewrites a nested HLS manifest before returning it', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('#EXTM3U\n#EXTINF:2,\nchunk.ts\n', {
      headers: { 'Content-Type': 'application/vnd.apple.mpegurl' },
    }));
    const proxy = new HlsProxy({
      publicBaseUrl: 'https://nguonc.taisaovayem.com',
      fetcher,
      idGenerator: sequence('session', 'nested', 'chunk'),
    });
    proxy.createSession(sessionInput('#EXTM3U\nvariant.m3u8\n'));

    const response = await proxy.getResource('session', 'nested');

    expect(new TextDecoder().decode(response?.body)).toBe('#EXTM3U\n#EXTINF:2,\n/hls/session/resource/chunk\n');
  });

  it('serves a prefetched segment once before releasing it from RAM', async () => {
    let segmentRequests = 0;
    const fetcher = vi.fn<typeof fetch>(async () => {
      segmentRequests += 1;
      return new Response(new Uint8Array([segmentRequests === 1 ? 1 : 9]), {
        headers: { 'Content-Type': 'video/mp2t' },
      });
    });
    const proxy = new HlsProxy({
      publicBaseUrl: 'https://nguonc.taisaovayem.com',
      fetcher,
      prefetchSegments: 1,
      idGenerator: sequence('session', 'segment'),
    });
    proxy.createSession(sessionInput('#EXTM3U\n#EXTINF:2,\nsegment.ts\n'));

    await vi.waitFor(() => expect(segmentRequests).toBe(1));

    await expect(proxy.getResource('session', 'segment')).resolves.toMatchObject({ body: new Uint8Array([1]) });
    await expect(proxy.getResource('session', 'segment')).resolves.toMatchObject({ body: new Uint8Array([9]) });
  });

  it('releases a prefetched segment when the player requests a byte range', async () => {
    let segmentRequests = 0;
    const fetcher = vi.fn<typeof fetch>(async () => {
      segmentRequests += 1;
      const byte = segmentRequests === 1 ? 1 : segmentRequests === 2 ? 5 : 9;
      return new Response(new Uint8Array([byte]), { headers: { 'Content-Type': 'video/mp2t' } });
    });
    const proxy = new HlsProxy({
      publicBaseUrl: 'https://nguonc.taisaovayem.com',
      fetcher,
      prefetchSegments: 1,
      idGenerator: sequence('session', 'segment'),
    });
    proxy.createSession(sessionInput('#EXTM3U\n#EXTINF:2,\nsegment.ts\n'));

    await vi.waitFor(() => expect(segmentRequests).toBe(1));
    await new Promise<void>((resolve) => setImmediate(resolve));

    await expect(proxy.getResource('session', 'segment', 'bytes=0-')).resolves.toMatchObject({ body: new Uint8Array([5]) });
    await expect(proxy.getResource('session', 'segment')).resolves.toMatchObject({ body: new Uint8Array([9]) });
  });

  it('prefetches segments after the segment the player seeks to', async () => {
    const requests: string[] = [];
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = input instanceof URL ? input.toString() : typeof input === 'string' ? input : input.url;
      requests.push(url);
      const byte = url.includes('four.ts') ? 4 : url.includes('three.ts') ? 3 : 1;
      return new Response(new Uint8Array([byte]), { headers: { 'Content-Type': 'video/mp2t' } });
    });
    const proxy = new HlsProxy({
      publicBaseUrl: 'https://nguonc.taisaovayem.com',
      fetcher,
      prefetchSegments: 1,
      idGenerator: sequence('session', 'one', 'two', 'three', 'four'),
    });
    proxy.createSession(sessionInput('#EXTM3U\n#EXTINF:2,\none.ts\n#EXTINF:2,\ntwo.ts\n#EXTINF:2,\nthree.ts\n#EXTINF:2,\nfour.ts\n'));

    await vi.waitFor(() => expect(requests).toContain('https://embed15.streamc.xyz/one.ts'));
    await expect(proxy.getResource('session', 'three')).resolves.toMatchObject({ body: new Uint8Array([3]) });
    await vi.waitFor(() => expect(requests).toContain('https://embed15.streamc.xyz/four.ts'));

    await expect(proxy.getResource('session', 'four')).resolves.toMatchObject({ body: new Uint8Array([4]) });
  });

  it('discards an unused prefetched segment after its idle TTL', async () => {
    let now = 0;
    let segmentRequests = 0;
    const fetcher = vi.fn<typeof fetch>(async () => {
      segmentRequests += 1;
      return new Response(new Uint8Array([segmentRequests === 1 ? 1 : 9]), {
        headers: { 'Content-Type': 'video/mp2t' },
      });
    });
    const proxy = new HlsProxy({
      publicBaseUrl: 'https://nguonc.taisaovayem.com',
      fetcher,
      now: () => now,
      prefetchSegments: 1,
      cacheIdleTtlMs: 30 * 60_000,
      idGenerator: sequence('session', 'segment'),
    });
    proxy.createSession(sessionInput('#EXTM3U\n#EXTINF:2,\nsegment.ts\n', { expiresAt: 60 * 60_000 }));

    await vi.waitFor(() => expect(segmentRequests).toBe(1));
    await new Promise<void>((resolve) => setImmediate(resolve));
    now = 30 * 60_000 + 1;

    await expect(proxy.getResource('session', 'segment')).resolves.toMatchObject({ body: new Uint8Array([9]) });
  });

  it('does not retain a prefetched segment larger than the shared RAM budget', async () => {
    let segmentRequests = 0;
    const fetcher = vi.fn<typeof fetch>(async () => {
      segmentRequests += 1;
      return new Response(new Uint8Array(segmentRequests === 1 ? [1, 2] : [9, 9]), {
        headers: { 'Content-Type': 'video/mp2t' },
      });
    });
    const proxy = new HlsProxy({
      publicBaseUrl: 'https://nguonc.taisaovayem.com',
      fetcher,
      prefetchSegments: 1,
      cacheMaxBytes: 1,
      idGenerator: sequence('session', 'segment'),
    });
    proxy.createSession(sessionInput('#EXTM3U\n#EXTINF:2,\nsegment.ts\n'));

    await vi.waitFor(() => expect(segmentRequests).toBe(1));
    await new Promise<void>((resolve) => setImmediate(resolve));

    await expect(proxy.getResource('session', 'segment')).resolves.toMatchObject({ body: new Uint8Array([9, 9]) });
  });
});

function sessionInput(playlist: string, overrides: Partial<{ expiresAt: number }> = {}) {
  return {
    playlist,
    sourceUrl: 'https://embed15.streamc.xyz/signed-playlist',
    videoHash: 'e98bc48528bc4c91980a653c79e38b16',
    expiresAt: Date.now() + 60_000,
    decryptPlaylist: async (value: string) => value,
    ...overrides,
  };
}

function sequence(...values: string[]): () => string {
  let index = 0;
  return () => values[index++] ?? `extra-${index}`;
}
