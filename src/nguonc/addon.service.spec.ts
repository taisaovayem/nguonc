import { describe, expect, it } from 'vitest';
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
  it('returns each successfully resolved server for a requested series episode', async () => {
    const client = {
      getMovie: async () => detail,
      listLatest: async () => ({ items: [], paginate: { current_page: 1 } }),
      search: async () => ({ items: [], paginate: { current_page: 1 } }),
    };
    const resolver = { resolve: async (url: string) => url.endsWith('/a') ? 'https://cdn.example/a.m3u8' : undefined };
    const service = new NguoncAddonService(client, resolver);

    await expect(service.streams('series', 'nguonc:phim-test:tap-1')).resolves.toEqual([
      expect.objectContaining({ name: 'NguồnC • Vietsub #1', url: 'https://cdn.example/a.m3u8' }),
    ]);
  });
});
