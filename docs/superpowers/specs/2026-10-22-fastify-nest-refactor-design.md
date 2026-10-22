# Fastify and idiomatic NestJS refactor

## Goal

Replace the Express-based Stremio SDK router and manually registered HLS routes with a Fastify-only, dependency-injected NestJS application. Preserve every existing public Stremio and HLS URL contract while moving business logic to Nest services and cache storage to Nest's cache manager.

## Scope and compatibility

The public API remains compatible with installed Stremio clients:

- `GET /manifest.json`
- `GET /catalog/:type/nguonc-latest.json` and the search/pagination variant carrying an `extra` path segment
- `GET /meta/:type/:id.json`
- `GET /stream/:type/:id.json`
- `GET /hls/:sessionId/:playlistName.m3u8`
- `GET /hls/:sessionId/resource/:resourceId`

Responses retain their existing JSON envelope (`metas`, `meta`, or `streams`), `cacheMaxAge` values, failure fallbacks, HLS status codes, media headers, and binary bodies. Controllers must set Stremio's `Cache-Control` headers from `cacheMaxAge` and return CORS-compatible responses.

The refactor removes `stremio-addon-sdk`, `@nestjs/platform-express`, Express type packages, `supertest`, the manual `TtlCache`, `createAddonInterface`, and `registerHlsRoutes`. It does not change upstream NguồnC or StreamC protocols.

## Modules and providers

`AppModule` imports and owns these modules:

1. `ConfigModule.forRoot({ isGlobal: true })` loads `.env`; all runtime configuration is read through `ConfigService`.
2. `CacheModule.registerAsync(...)` is global and provides `CACHE_MANAGER`. Its default TTL is disabled; each cache operation supplies its own TTL.
3. `NguoncModule` provides `NguoncClientService`, `EmbedResolverService`, and `NguoncAddonService`.
4. `HlsModule` provides `HlsProxyService` and `HlsSegmentCacheService`, and exports `HlsProxyService` to `NguoncModule`.
5. `StremioModule` provides `StremioService` and `StremioController`.

`main.ts` has only composition and transport concerns: create `NestFactory` with `FastifyAdapter`, enable CORS, and listen on the configured port. It must not construct application services, attach middleware routers, or read raw environment variables.

`NguoncClient`, `EmbedResolver`, `HlsProxy`, and `NguoncAddonService` become injectable services. Their constructor dependencies are interfaces/tokens where test doubles are needed; request timeout and cache TTLs come from `ConfigService`.

## Fastify controllers

`StremioController` defines explicit routes for the four Stremio resources rather than a catch-all route. It validates `type`, catalog ID, content ID, and optional `extra` values before calling `StremioService`. The service delegates to `NguoncAddonService` and returns protocol envelopes:

- catalog success: `{ metas, cacheMaxAge: 300 }`; failure: `{ metas: [], cacheMaxAge: 30 }`
- meta success: `{ meta, cacheMaxAge: 900 }`; failure: `{ meta: undefined, cacheMaxAge: 30 }`
- stream success: `{ streams, cacheMaxAge: 900 }`; failure: `{ streams: [], cacheMaxAge: 30 }`

The controller writes `Cache-Control: max-age=<cacheMaxAge>, public` and `application/json; charset=utf-8`. URL parsing retains the SDK behavior for query-string-like `extra` values encoded in the final path segment.

`HlsController` replaces the Express route registration function. It obtains a `FastifyReply` only where required to set binary/range headers. Unknown or expired sessions/resources return 404; upstream/proxy failures return 502. Playlists use `application/vnd.apple.mpegurl`; binary responses retain upstream status, content type, content range, and content length.

No controller owns caching, playlist decryption, URL rewriting, or upstream fetching.

## Cache design

All cached values use Nest's `CACHE_MANAGER` injected through `@Inject(CACHE_MANAGER)`:

- catalog, detail, and resolved-stream values replace `TtlCache` calls with `cacheManager.get`, `set`, and cache-key helpers. Their configured TTLs remain 5, 15, and 15 minutes by default.
- HLS prefetched binary bodies are stored under opaque session/resource cache keys through `HlsSegmentCacheService`; their per-entry TTL is 30 minutes.

`HlsSegmentCacheService` keeps only cache-policy metadata in memory: total stored body bytes, insertion order, and session/resource-to-cache-key indexes. It enforces the shared 1 GiB byte budget by deleting least-recently-prefetched unused bodies through `CACHE_MANAGER.del`. A cache hit is consumed atomically from the service's perspective: it reads, immediately deletes the cache key, removes its metadata, then returns the body. Player requests with a `Range` header also remove any full-body prefetched entry and mark the resource consumed so an in-flight prefetch cannot reinsert it.

The metadata sweep runs at least once per minute. It deletes idle entries older than 30 minutes and removes all metadata/cache keys belonging to expired HLS sessions. This preserves the existing prefetch behavior: prefetch the first 15 media segments discovered in a playlist and the following 15 after each played or sought segment.

The `CACHE_MANAGER` memory backend is process-local, matching the existing process-local session design. Horizontal scaling remains out of scope; it would require a shared cache and session store in a later change.

## Dependency migration

Add runtime dependencies:

- `@nestjs/platform-fastify`
- `@nestjs/cache-manager`
- `cache-manager`
- `@fastify/cors`

Remove Express and SDK dependencies once no source, test, or lockfile consumer remains:

- `@nestjs/platform-express`
- `@types/express`
- `supertest` and `@types/supertest`
- `stremio-addon-sdk`

Fastify integration tests use `app.inject()` instead of opening a Supertest server. Unit tests use injected fakes for upstream fetches and cache manager operations.

## Errors, safety, and lifecycle

- Validation and source URL safety checks in the existing resolver/proxy remain unchanged.
- An HLS cache failure is non-fatal: the proxy fetches the registered upstream resource normally and never exposes that upstream URL.
- Cache `get` failures are treated as misses; cache `set`/`del` failures do not prevent playback, but leave no conflicting in-memory metadata.
- Application shutdown clears the HLS cleanup interval. It does not delete active cache entries; their TTL handles cleanup.

## Testing and verification

Tests must cover:

- Fastify manifest, catalog, meta, stream, and HLS contracts through `app.inject()`.
- CORS and Stremio cache headers.
- Nest DI wiring and `.env` configuration through `ConfigService`.
- `CACHE_MANAGER` catalog/detail/stream cache hits, TTL values, and error fallback.
- HLS prefetch, seek-ahead, consume-and-delete behavior for full and range requests, 30-minute expiry, and 1 GiB LRU eviction.
- Removal of the Express router and SDK imports.

Run unit tests, Fastify integration tests, lint, and build. The development server must start from `.env` without manually exporting variables.
