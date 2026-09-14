import { describe, expect, it } from 'vitest';
import { EmbedResolver } from './embed-resolver.js';

describe('EmbedResolver', () => {
  it('returns an HLS URL found in a permitted embed response', async () => {
    const resolver = new EmbedResolver({
      allowedHosts: ['embed.example'],
      fetcher: async () => new Response('<video><source src="https://cdn.example/movie.m3u8"></video>'),
    });

    await expect(resolver.resolve('https://embed.example/watch/abc')).resolves.toBe(
      'https://cdn.example/movie.m3u8',
    );
  });

  it('does not fetch an embed URL from an unapproved host', async () => {
    const resolver = new EmbedResolver({ allowedHosts: ['embed.example'] });

    await expect(resolver.resolve('https://untrusted.example/watch/abc')).resolves.toBeUndefined();
  });
});
