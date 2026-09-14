import { NguoncMovie, StremioMeta, StremioVideo } from './types.js';

const contentId = (slug: string) => `nguonc:${slug}`;

function categoryValues(movie: NguoncMovie, groupName: string): string[] {
  return Object.values(movie.category ?? {})
    .filter((group) => group.group?.name === groupName)
    .flatMap((group) => group.list?.map((item) => item.name) ?? []);
}

export function isSeries(movie: NguoncMovie): boolean {
  return categoryValues(movie, 'Định dạng').some(
    (value) => value.toLocaleLowerCase('vi-VN') === 'phim bộ',
  );
}

function plainText(value: string | null): string | undefined {
  const text = value?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return text || undefined;
}

function splitPeople(value: string | null): string[] | undefined {
  const people = value?.split(',').map((person) => person.trim()).filter(Boolean);
  return people?.length ? people : undefined;
}

export function buildSeriesVideos(movie: NguoncMovie): StremioVideo[] {
  const unique = new Map<string, { name: string; slug: string }>();
  for (const server of movie.episodes ?? []) {
    for (const episode of server.items ?? []) {
      if (!unique.has(episode.slug)) unique.set(episode.slug, episode);
    }
  }

  return [...unique.values()]
    .sort((left, right) => Number(left.name) - Number(right.name) || left.name.localeCompare(right.name))
    .map((episode, index) => {
      const number = Number(episode.name);
      const episodeNumber = Number.isFinite(number) && number > 0 ? number : index + 1;
      return {
        id: `${contentId(movie.slug)}:${episode.slug}`,
        title: `Tập ${episode.name}`,
        season: 1,
        episode: episodeNumber,
      };
    });
}

export function mapMovieMeta(movie: NguoncMovie): StremioMeta {
  const year = Number(categoryValues(movie, 'Năm')[0]);
  const meta: StremioMeta = {
    id: contentId(movie.slug),
    type: isSeries(movie) ? 'series' : 'movie',
    name: movie.name,
    poster: movie.poster_url ?? movie.thumb_url ?? undefined,
    background: movie.thumb_url ?? undefined,
    description: plainText(movie.description),
    year: Number.isInteger(year) ? year : undefined,
    genres: categoryValues(movie, 'Thể loại'),
    director: splitPeople(movie.director),
    cast: splitPeople(movie.casts),
  };

  if (meta.type === 'series') meta.videos = buildSeriesVideos(movie);
  return meta;
}
