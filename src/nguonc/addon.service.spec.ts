import { describe, expect, it, vi } from 'vitest';
import { NguoncAddonService } from './addon.service.js';
import { NguoncMovie } from './types.js';

const detail: NguoncMovie = {
  id: '1', name: 'Phim test', slug: 'phim-test', original_name: null,
  poster_url: null, thumb_url: null, description: 'Mô tả', total_episodes: 1,
  current_episode: 'Tập 1', time: null, quality: 'HD', language: 'Vietsub',
  director: null, casts: null,
  category: { format: { group: { name: 'Định dạng' }, list: [{ name: 'Phim bộ' }] } },
  episodes: [
    { server_name: 'Vietsub #1', items: [{ name: '1', slug: 'tap-1', embed: 'https://embed.example/a' }] },
    { server_name: 'Lồng tiếng #1', items: [{ name: '1', slug: 'tap-1', embed: 'https://embed.example/b' }] },
  ],
};

describe('NguoncAddonService', () => {
  it('uses the injected Nest cache manager for catalog values', async () => {
    const client = {
      getMovie: vi.fn(async () => detail),
      listLatest: vi.fn(async () => ({ items: [{ slug: 'phim-test' }], paginate: { current_page: 1 } })),
      search: vi.fn(async () => ({ items: [], paginate: { current_page: 1 } })),
    };
    const entries = new Map<string, unknown>();
    const cache = {
      get: vi.fn(async <T>(key: string): Promise<T | undefined> => entries.get(key) as T | undefined),
      set: vi.fn(async (key: string, value: unknown) => { entries.set(key, value); }),
    };
    const resolver = { resolve: vi.fn() };
    const service = new NguoncAddonService(client, resolver, cache, {
      catalogTtlMs: 60_000,
      detailTtlMs: 120_000,
      streamTtlMs: 180_000,
    });

    await expect(service.catalog('series', undefined)).resolves.toHaveLength(1);
    await expect(service.catalog('series', undefined)).resolves.toHaveLength(1);

    expect(client.listLatest).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledWith('catalog:series::1', expect.any(Array), 60_000);
  });

  it('returns each successfully resolved server for a requested series episode', async () => {
    const client = {
      getMovie: async () => detail,
      listLatest: async () => ({ items: [], paginate: { current_page: 1 } }),
      search: async () => ({ items: [], paginate: { current_page: 1 } }),
    };
    const resolver = { resolve: vi.fn(async (url: string) => url.endsWith('/a') ? 'https://nguonc.taisaovayem.com/hls/session/phim-test-tap-1.m3u8' : undefined) };
    const cache = { get: async () => undefined, set: async () => undefined };
    const service = new NguoncAddonService(client, resolver, cache);

    await expect(service.streams('series', 'nguonc:phim-test:tap-1')).resolves.toEqual([
      expect.objectContaining({ name: 'NguồnC • Vietsub #1', url: 'https://nguonc.taisaovayem.com/hls/session/phim-test-tap-1.m3u8' }),
    ]);
    expect(resolver.resolve).toHaveBeenCalledWith('https://embed.example/a', 'Phim test Tập 1');
  });
});
