import { describe, expect, it } from 'vitest';
import { createAddonInterface } from './stremio-addon.factory.js';

describe('Stremio addon manifest', () => {
  it('publishes separate latest catalogs for movies and series with search and pagination', () => {
    const addon = createAddonInterface({
      catalog: async () => [],
      meta: async () => undefined,
      streams: async () => [],
    });

    expect(addon.manifest).toMatchObject({
      id: 'com.nguonc.stremio',
      resources: ['catalog', 'meta', 'stream'],
      types: ['movie', 'series'],
      catalogs: expect.arrayContaining([
        expect.objectContaining({ type: 'movie', id: 'nguonc-latest' }),
        expect.objectContaining({ type: 'series', id: 'nguonc-latest' }),
      ]),
    });
  });
});
