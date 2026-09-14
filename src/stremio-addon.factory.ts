import { createRequire } from 'node:module';
import { StremioMeta } from './nguonc/types.js';

const require = createRequire(import.meta.url);
const { addonBuilder } = require('stremio-addon-sdk') as { addonBuilder: new (manifest: object) => any };

export interface AddonHandlers {
  catalog(type: 'movie' | 'series', search?: string, skip?: number): Promise<StremioMeta[]>;
  meta(type: 'movie' | 'series', id: string): Promise<StremioMeta | undefined>;
  streams(type: 'movie' | 'series', id: string): Promise<unknown[]>;
}

export function createAddonInterface(handlers: AddonHandlers) {
  const builder = new addonBuilder({
    id: 'com.nguonc.stremio',
    version: '1.0.0',
    name: 'NguồnC',
    description: 'Catalog và stream từ NguồnC cho người dùng được phép.',
    resources: ['catalog', 'meta', 'stream'],
    types: ['movie', 'series'],
    idPrefixes: ['nguonc:'],
    catalogs: ['movie', 'series'].map((type) => ({
      type,
      id: 'nguonc-latest',
      name: 'NguồnC • Mới cập nhật',
      extra: [
        { name: 'search', isRequired: false },
        { name: 'skip', isRequired: false },
      ],
    })),
    behaviorHints: { configurable: false },
  });

  builder.defineCatalogHandler(async ({ type, id, extra }: any) => {
    if (!validType(type) || id !== 'nguonc-latest') return { metas: [] };
    try {
      return { metas: await handlers.catalog(type, extra?.search, Number(extra?.skip) || 0), cacheMaxAge: 300 };
    } catch {
      return { metas: [], cacheMaxAge: 30 };
    }
  });
  builder.defineMetaHandler(async ({ type, id }: any) => {
    if (!validType(type)) return { meta: undefined };
    try {
      return { meta: await handlers.meta(type, id), cacheMaxAge: 900 };
    } catch {
      return { meta: undefined, cacheMaxAge: 30 };
    }
  });
  builder.defineStreamHandler(async ({ type, id }: any) => {
    if (!validType(type)) return { streams: [] };
    try {
      return { streams: await handlers.streams(type, id), cacheMaxAge: 900 };
    } catch {
      return { streams: [], cacheMaxAge: 30 };
    }
  });
  return builder.getInterface();
}

function validType(value: unknown): value is 'movie' | 'series' {
  return value === 'movie' || value === 'series';
}
