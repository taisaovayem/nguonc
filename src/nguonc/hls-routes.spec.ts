import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { HlsProxy } from './hls-proxy.js';
import { registerHlsRoutes } from './hls-routes.js';

describe('HLS routes', () => {
  it('serves a registered root playlist with the HLS media type', async () => {
    const proxy = new HlsProxy({
      publicBaseUrl: 'https://nguonc.taisaovayem.com',
      idGenerator: sequence('session', 'segment'),
    });
    proxy.createSession({
      ...sessionInput('#EXTM3U\n#EXTINF:2,\nsegment.ts\n'),
      playlistName: 'phim-test-tap-1',
    });
    const app = express();
    registerHlsRoutes(app, proxy);

    const response = await request(app).get('/hls/session/phim-test-tap-1.m3u8');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/vnd.apple.mpegurl');
    expect(response.text).toBe('#EXTM3U\n#EXTINF:2,\n/hls/session/resource/segment\n');
  });

  it('returns 404 for an unknown HLS session', async () => {
    const app = express();
    registerHlsRoutes(app, new HlsProxy({ publicBaseUrl: 'https://nguonc.taisaovayem.com' }));

    await request(app).get('/hls/missing/playlist.m3u8').expect(404);
  });

  it('preserves binary byte-range responses from registered resources', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 206,
      headers: {
        'Content-Type': 'video/mp2t',
        'Content-Range': 'bytes 100-102/400',
        'Content-Length': '3',
      },
    }));
    const proxy = new HlsProxy({
      publicBaseUrl: 'https://nguonc.taisaovayem.com',
      fetcher,
      idGenerator: sequence('session', 'segment'),
    });
    proxy.createSession(sessionInput('#EXTM3U\n#EXTINF:2,\nsegment.ts\n'));
    const app = express();
    registerHlsRoutes(app, proxy);

    const response = await request(app)
      .get('/hls/session/resource/segment')
      .set('Range', 'bytes=100-')
      .buffer(true)
      .parse(binaryParser);

    expect(response.status).toBe(206);
    expect(response.headers['content-type']).toContain('video/mp2t');
    expect(response.headers['content-range']).toBe('bytes 100-102/400');
    expect(response.body).toEqual(Buffer.from([1, 2, 3]));
  });
});

function sessionInput(playlist: string) {
  return {
    playlist,
    sourceUrl: 'https://embed15.streamc.xyz/signed-playlist',
    videoHash: 'e98bc48528bc4c91980a653c79e38b16',
    expiresAt: Date.now() + 60_000,
    decryptPlaylist: async (value: string) => value,
  };
}

function sequence(...values: string[]): () => string {
  let index = 0;
  return () => values[index++] ?? `extra-${index}`;
}

function binaryParser(response: NodeJS.ReadableStream, callback: (error: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
  response.on('error', (error: Error) => callback(error, Buffer.alloc(0)));
}
