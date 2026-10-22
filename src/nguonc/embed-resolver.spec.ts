import { createHmac, randomBytes, webcrypto } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { EmbedResolver } from './embed-resolver.js';

describe('EmbedResolver', () => {
  it('bootstraps a StreamC embed, decrypts its playlist, and publishes it as HLS', async () => {
    const embedUrl = 'https://embed15.streamc.xyz/embed.php?hash=e98bc48528bc4c91980a653c79e38b16';
    const signedPlaylistUrl = 'https://embed15.streamc.xyz/signed-playlist-token';
    const playlist = '#EXTM3U\n#EXTINF:2,\nsegment0000.png\n#EXT-X-ENDLIST\n';
    const bootstrap = await encryptBootstrap(embedUrl, {
      api: embedUrl,
      video: 'e98bc48528bc4c91980a653c79e38b16',
      bootstrap: 'bootstrap-token',
      nonce: '0123456789abcdef0123456789abcdef',
      preissued: {
        playlist: signedPlaylistUrl,
        playlistFormat: 'aesgcm-v2',
        issuedAt: 1_800_000_000,
        expiresAt: 1_800_003_600,
      },
    });
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(bootstrap), { status: 200 }))
      .mockResolvedValueOnce(new Response(await encryptPlaylist(playlist, 'e98bc48528bc4c91980a653c79e38b16'), { status: 200 }));
    const playlistPublisher = { createSession: vi.fn(() => 'https://nguonc.taisaovayem.com/hls/session/playlist.m3u8') };
    const resolver = new EmbedResolver({ fetcher, playlistPublisher });

    await expect(resolver.resolve(embedUrl)).resolves.toBe(
      'https://nguonc.taisaovayem.com/hls/session/playlist.m3u8',
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toEqual(new URL(embedUrl));
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({
        action: 'bootstrap',
        referrer: 'https://phim.nguonc.com/',
        frame_origins: ['https://phim.nguonc.com'],
        request_grant: true,
        playlist_format: 'aesgcm-v2',
        pretty_url: true,
        path_chunks: true,
        bootstrap_format: 'aesgcm-v1',
      }),
    });
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('content-type')).toBe('application/json');
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('origin')).toBe('https://embed15.streamc.xyz');
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('referer')).toBe(embedUrl);
    expect(playlistPublisher.createSession).toHaveBeenCalledWith(expect.objectContaining({
      playlist,
      sourceUrl: signedPlaylistUrl,
      expiresAt: 1_800_003_600_000,
      videoHash: 'e98bc48528bc4c91980a653c79e38b16',
    }));
  });

  it('does not fetch a malformed embed URL without a video hash', async () => {
    const resolver = new EmbedResolver({});

    await expect(resolver.resolve('https://untrusted.example/watch/abc')).resolves.toBeUndefined();
  });

  it('resolves an HTTP embed and follows its signed playlist on another host', async () => {
    const embedUrl = 'http://embed.other.example/embed.php?hash=e98bc48528bc4c91980a653c79e38b16';
    const signedPlaylistUrl = 'http://playlist.other.example/signed-playlist-token';
    const bootstrap = await encryptBootstrap(embedUrl, {
      api: embedUrl,
      video: 'e98bc48528bc4c91980a653c79e38b16',
      preissued: { playlist: signedPlaylistUrl, issuedAt: 1_800_000_000, expiresAt: 1_800_003_600 },
    });
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(bootstrap), { status: 200 }))
      .mockResolvedValueOnce(new Response(await encryptPlaylist('#EXTM3U\n#EXTINF:2,\nsegment.ts\n', 'e98bc48528bc4c91980a653c79e38b16'), { status: 200 }));
    const playlistPublisher = { createSession: vi.fn(() => 'http://localhost:3000/hls/session/playlist.m3u8') };
    const resolver = new EmbedResolver({ fetcher, playlistPublisher });

    const resolved = await resolver.resolve(embedUrl);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(resolved).toBe('http://localhost:3000/hls/session/playlist.m3u8');
    expect(fetcher.mock.calls[1][0]).toBe(signedPlaylistUrl);
    expect(new Headers(fetcher.mock.calls[1][1]?.headers).get('origin')).toBe('http://embed.other.example');
    expect(new Headers(fetcher.mock.calls[1][1]?.headers).get('referer')).toBe(embedUrl);
  });
});

async function encryptBootstrap(embedUrl: string, payload: object): Promise<{ format: string; iv: string; data: string }> {
  const additionalData = new TextEncoder().encode(`stream-bootstrap-v1\n${embedUrl}`);
  const keyMaterial = await webcrypto.subtle.digest('SHA-256', additionalData);
  return encryptAesGcm(JSON.stringify(payload), keyMaterial, additionalData);
}

async function encryptPlaylist(playlist: string, videoHash: string): Promise<string> {
  const hmac = createHmac('sha256', 'stream-derive-v1').update(videoHash).digest();
  const encrypted = await encryptAesGcm(playlist, hmac);
  return `#EXTM3U\n#ENC-AESGCM;iv=${encrypted.iv}\n#EXT-X-B65:0-138\n${encrypted.data}\n`;
}

async function encryptAesGcm(value: string, keyMaterial: Buffer | ArrayBuffer, additionalData?: Uint8Array): Promise<{ format: string; iv: string; data: string }> {
  const iv = randomBytes(12);
  const key = await webcrypto.subtle.importKey('raw', keyMaterial, 'AES-GCM', false, ['encrypt']);
  const encrypted = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData }, key, new TextEncoder().encode(value));
  return { format: 'aesgcm-v1', iv: iv.toString('hex'), data: Buffer.from(encrypted).toString('base64') };
}
