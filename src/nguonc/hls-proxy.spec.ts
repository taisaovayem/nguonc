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
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
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
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('range')).toBe('bytes=100-');
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
