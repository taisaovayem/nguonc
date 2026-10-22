import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { EmbedResolver } from './embed-resolver.js';
import { mapMovieMeta } from './mapper.js';
import type { NguoncClientPort } from './nguonc.client.js';
import { NguoncMovie, StremioMeta } from './types.js';

export interface StremioStream {
  name: string;
  description?: string;
  url: string;
  behaviorHints: { notWebReady: true; bingeGroup: string };
}

export interface AddonCacheOptions {
  catalogTtlMs?: number;
  detailTtlMs?: number;
  streamTtlMs?: number;
}

interface CachePort {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttl?: number): Promise<unknown>;
}

@Injectable()
export class NguoncAddonService {
  constructor(
    private readonly client: NguoncClientPort,
    private readonly resolver: Pick<EmbedResolver, 'resolve'>,
    @Inject(CACHE_MANAGER) private readonly cache: CachePort,
    private readonly cacheOptions: AddonCacheOptions = {},
  ) {}

  async catalog(type: 'movie' | 'series', search: string | undefined, skip = 0): Promise<StremioMeta[]> {
    const page = Math.floor(Math.max(skip, 0) / 10) + 1;
    const key = `catalog:${type}:${search ?? ''}:${page}`;
    return this.getOrLoad(key, this.cacheOptions.catalogTtlMs ?? 5 * 60_000, async () => {
      const list = search ? await this.client.search(search, page) : await this.client.listLatest(page);
      const details = await Promise.all(list.items.slice(0, 10).map((item) => this.detail(item.slug)));
      return details.filter((movie) => mapMovieMeta(movie).type === type).map(mapMovieMeta);
    });
  }

  async meta(type: 'movie' | 'series', id: string): Promise<StremioMeta | undefined> {
    const slug = parseContentId(id, type === 'series');
    if (!slug) return undefined;
    const meta = mapMovieMeta(await this.detail(slug));
    return meta.type === type ? meta : undefined;
  }

  async streams(type: 'movie' | 'series', id: string): Promise<StremioStream[]> {
    const parsed = parseStreamId(id, type);
    if (!parsed) return [];
    const movie = await this.detail(parsed.slug);
    const candidates = movie.episodes.flatMap((server) =>
      server.items
        .filter((episode) => !parsed.episodeSlug || episode.slug === parsed.episodeSlug)
        .map((episode) => ({ server: server.server_name, episode })),
    );
    const resolved: Array<StremioStream | undefined> = await Promise.all(candidates.map(async ({ server, episode }) => {
      const playlistName = type === 'series' ? `${movie.name} Tập ${episode.name}` : movie.name;
      const url = await this.getOrLoad(
        `stream:${episode.embed}`,
        this.cacheOptions.streamTtlMs ?? 15 * 60_000,
        () => this.resolver.resolve(episode.embed, playlistName),
      );
      if (!url) return undefined;
      const description = `${movie.quality ?? ''} ${movie.language ?? ''}`.trim();
      return {
        name: `NguồnC • ${server}`,
        ...(description ? { description } : {}),
        url,
        behaviorHints: { notWebReady: true as const, bingeGroup: `nguonc:${movie.slug}:${server}` },
      } satisfies StremioStream;
    }));
    return resolved.filter((stream): stream is StremioStream => Boolean(stream));
  }

  private detail(slug: string): Promise<NguoncMovie> {
    return this.getOrLoad(`detail:${slug}`, this.cacheOptions.detailTtlMs ?? 15 * 60_000, () => this.client.getMovie(slug));
  }

  private async getOrLoad<T>(key: string, ttl: number, loader: () => Promise<T>): Promise<T> {
    try {
      const cached = await this.cache.get<T>(key);
      if (cached !== undefined) return cached;
    } catch {
      // A cache outage must not prevent metadata or playback resolution.
    }

    const value = await loader();
    try {
      await this.cache.set(key, value, ttl);
    } catch {
      // The upstream value remains valid even when persisting it fails.
    }
    return value;
  }
}

function parseContentId(id: string, series: boolean): string | undefined {
  const prefix = 'nguonc:';
  if (!id.startsWith(prefix)) return undefined;
  const parts = id.slice(prefix.length).split(':');
  if (series ? parts.length !== 1 : parts.length !== 1) return undefined;
  return validSlug(parts[0]) ? parts[0] : undefined;
}

function parseStreamId(id: string, type: 'movie' | 'series'): { slug: string; episodeSlug?: string } | undefined {
  if (!id.startsWith('nguonc:')) return undefined;
  const parts = id.slice('nguonc:'.length).split(':');
  if ((type === 'movie' && parts.length !== 1) || (type === 'series' && parts.length !== 2)) return undefined;
  if (!validSlug(parts[0]) || (parts[1] && !validSlug(parts[1])) ) return undefined;
  return { slug: parts[0], episodeSlug: parts[1] };
}

function validSlug(value: string | undefined): value is string {
  return Boolean(value && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value));
}
