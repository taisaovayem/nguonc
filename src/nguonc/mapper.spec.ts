import { describe, expect, it } from 'vitest';
import { buildSeriesVideos, mapMovieMeta } from './mapper.js';

const seriesMovie = {
  id: 'source-id',
  name: 'Bộ phim',
  slug: 'bo-phim',
  original_name: 'Series title',
  poster_url: 'https://images.example/poster.jpg',
  thumb_url: 'https://images.example/thumb.jpg',
  description: '<p>Một <strong>mô tả</strong></p>',
  total_episodes: 2,
  current_episode: 'Tập 2',
  time: '45 phút/tập',
  quality: 'HD',
  language: 'Vietsub',
  director: 'Đạo diễn A',
  casts: 'Diễn viên A, Diễn viên B',
  category: {
    format: { group: { name: 'Định dạng' }, list: [{ name: 'Phim bộ' }] },
    genre: { group: { name: 'Thể loại' }, list: [{ name: 'Hành Động' }] },
    year: { group: { name: 'Năm' }, list: [{ name: '2024' }] },
  },
  episodes: [
    {
      server_name: 'Vietsub',
      items: [
        { name: '2', slug: 'tap-2', embed: 'https://embed.example/2' },
        { name: '1', slug: 'tap-1', embed: 'https://embed.example/1' },
      ],
    },
    {
      server_name: 'Lồng tiếng',
      items: [{ name: '1', slug: 'tap-1', embed: 'https://embed.example/dub-1' }],
    },
  ],
};

describe('Nguonc metadata mapping', () => {
  it('maps a series detail response into safe Stremio metadata', () => {
    const meta = mapMovieMeta(seriesMovie);

    expect(meta).toMatchObject({
      id: 'nguonc:bo-phim',
      type: 'series',
      name: 'Bộ phim',
      poster: 'https://images.example/poster.jpg',
      description: 'Một mô tả',
      year: 2024,
      genres: ['Hành Động'],
      director: ['Đạo diễn A'],
      cast: ['Diễn viên A', 'Diễn viên B'],
    });
  });

  it('merges duplicate episodes from servers and orders numeric episodes', () => {
    expect(buildSeriesVideos(seriesMovie)).toEqual([
      { id: 'nguonc:bo-phim:tap-1', title: 'Tập 1', season: 1, episode: 1 },
      { id: 'nguonc:bo-phim:tap-2', title: 'Tập 2', season: 1, episode: 2 },
    ]);
  });
});
