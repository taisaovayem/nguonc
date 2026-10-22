# Fastify NestJS Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Express/SDK adapters with Fastify-backed NestJS modules, controllers, and injectable services without changing the public addon or HLS contracts.

**Architecture:** `AppModule` composes `ConfigModule`, global Nest cache, `NguoncModule`, `HlsModule`, and `StremioModule`. Controllers own the HTTP contracts, while injected services own upstream access, StreamC resolution, session management, and cache policy. `main.ts` creates only the Fastify Nest application, enables CORS, and listens.

**Tech Stack:** NestJS 12, `@nestjs/platform-fastify`, `@nestjs/cache-manager`, cache-manager, `@fastify/cors`, Vitest, Fastify `app.inject()`.

**Spec:** `docs/superpowers/specs/2026-10-22-fastify-nest-refactor-design.md`

## Global Constraints

- Preserve all documented Stremio and HLS endpoints, response envelopes, cache ages, binary/range headers, and status codes.
- Use `ConfigService` for runtime settings; no raw `process.env` or manually constructed application services in `main.ts`.
- Remove `stremio-addon-sdk`, Express, `registerHlsRoutes`, `TtlCache`, and Supertest rather than retaining compatibility shims.
- Use Nest `CACHE_MANAGER` for catalog/detail/stream values and HLS prefetch bodies; HLS cache reads are consume-and-delete.
- Preserve local HTTP `PUBLIC_BASE_URL` support and do not reintroduce host or scheme allowlists for source URLs.

## Review Focus

- A Fastify `app.inject()` request for every published URL must preserve headers and envelope data, including invalid resource fallbacks.
- Relative HLS resource URIs must resolve against the local proxy URL even when `PUBLIC_BASE_URL` includes a path prefix.
- A range request must never return a stale full-body prefetched cache entry.
- Cache manager read/write/delete failures must degrade to an upstream fetch rather than breaking playback.
- Shutdown must clear proxy cleanup work without deleting an otherwise active session prematurely.

### Task 1: Establish Fastify Nest composition

**Files:**
- Modify: `package.json`, `yarn.lock`, `src/main.ts`, `src/app.module.ts`, `src/app.module.spec.ts`
- Create: `src/nguonc/nguonc.module.ts`, `src/hls/hls.module.ts`, `src/stremio/stremio.module.ts`, `src/stremio/stremio.controller.ts`, `src/stremio/stremio.controller.spec.ts`

**Interfaces:**
- Produces: `AppModule` with global config/cache imports; `bootstrap()` using `NestFactory.create<NestFastifyApplication>(..., new FastifyAdapter())`; injectable module boundaries for later tasks.

- [ ] **Step 1: Write failing Fastify integration tests**

Add an `app.inject()` test that expects `GET /health` to return 200 JSON and `GET /manifest.json` to return the public manifest with CORS enabled.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `yarn test src/stremio/stremio.controller.spec.ts`

Expected: FAIL because no Fastify controller/application composition exists.

- [ ] **Step 3: Replace the Express runtime dependencies and compose modules**

Install Fastify/cache dependencies; remove Express/SDK/Supertest packages. Implement global `ConfigModule` and `CacheModule`, add Fastify bootstrap/CORS, and expose a static manifest route from `StremioController`.

- [ ] **Step 4: Run focused and full tests**

Run: `yarn test src/stremio/stremio.controller.spec.ts` then `yarn test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json yarn.lock src/main.ts src/app.module.ts src/app.module.spec.ts src/nguonc/nguonc.module.ts src/hls/hls.module.ts src/stremio
git commit -m "refactor: bootstrap Nest with Fastify modules"
```

### Task 2: Make NguồnC and resolver injectable cache-backed services

**Files:**
- Modify: `src/nguonc/nguonc.client.ts`, `src/nguonc/embed-resolver.ts`, `src/nguonc/addon.service.ts`, `src/nguonc/addon.service.spec.ts`, `src/nguonc/embed-resolver.spec.ts`, `src/nguonc/nguonc.module.ts`
- Delete: `src/nguonc/ttl-cache.ts`, `src/nguonc/ttl-cache.spec.ts`

**Interfaces:**
- Consumes: global `ConfigService`, `CACHE_MANAGER`, exported `HlsProxyService`.
- Produces: injectable `NguoncClientService`, `EmbedResolverService`, and `NguoncAddonService` whose `catalog`, `meta`, and `streams` contracts remain unchanged.

- [ ] **Step 1: Write failing cache-manager tests**

Update the addon tests to inject a fake cache manager and assert catalog/detail/stream keys, configured TTLs, cache hits, and cache-operation failure fallbacks.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `yarn test src/nguonc/addon.service.spec.ts`

Expected: FAIL because services still use `TtlCache` and are not injectable.

- [ ] **Step 3: Convert source, resolver, and addon classes to Nest providers**

Use `@Injectable()`, constructor injection, `ConfigService`, and `@Inject(CACHE_MANAGER)`. Keep source protocol parsing and StreamC decryption behavior intact while moving all TTL cache operations to the cache manager.

- [ ] **Step 4: Run focused and full tests**

Run: `yarn test src/nguonc/addon.service.spec.ts src/nguonc/embed-resolver.spec.ts` then `yarn test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/nguonc
git commit -m "refactor: inject Nguonc services and Nest cache"
```

### Task 3: Move HLS proxy routes and cache to Nest services

**Files:**
- Modify: `src/nguonc/hls-proxy.ts`, `src/nguonc/hls-proxy.spec.ts`, `src/hls/hls.module.ts`
- Create: `src/hls/hls.controller.ts`, `src/hls/hls.controller.spec.ts`, `src/hls/hls-segment-cache.service.ts`, `src/hls/hls-segment-cache.service.spec.ts`
- Delete: `src/nguonc/hls-routes.ts`, `src/nguonc/hls-routes.spec.ts`

**Interfaces:**
- Consumes: `ConfigService`, `CACHE_MANAGER`, and Fastify reply/request types only at the controller boundary.
- Produces: exported `HlsProxyService` with `createSession`, `getRootPlaylist`, and `getResource`; `HlsController` routes for root playlists and resources.

- [ ] **Step 1: Write failing HLS controller/cache tests**

Add `app.inject()` tests for playlist MIME type, 404, 502, range header forwarding, binary headers, and consume-on-read cache behavior; add cache service tests for 1 GiB LRU eviction and 30-minute expiry.

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `yarn test src/hls/hls.controller.spec.ts src/hls/hls-segment-cache.service.spec.ts`

Expected: FAIL because Express registration and per-session Maps still own the HTTP and cache layers.

- [ ] **Step 3: Extract the cache service and add the Nest HLS controller**

Use `CACHE_MANAGER` for prefetched bodies and retain only session/index/size metadata in the proxy service. Implement decorator-based playlist/resource routes and map proxy outcomes to Fastify replies without exposing source URLs.

- [ ] **Step 4: Run focused and full tests**

Run: `yarn test src/hls/hls.controller.spec.ts src/hls/hls-segment-cache.service.spec.ts src/nguonc/hls-proxy.spec.ts` then `yarn test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hls src/nguonc/hls-proxy.ts src/nguonc/hls-proxy.spec.ts
git rm src/nguonc/hls-routes.ts src/nguonc/hls-routes.spec.ts
git commit -m "refactor: serve HLS through Nest controller"
```

### Task 4: Implement Stremio resource controllers and remove manual adapters

**Files:**
- Modify: `src/stremio/stremio.controller.ts`, `src/stremio/stremio.controller.spec.ts`, `src/stremio/stremio.module.ts`, `README.md`, `.env.example`
- Delete: `src/stremio-addon.factory.ts`, `src/stremio-addon.factory.spec.ts`, `src/app.service.ts`, `src/app.controller.ts`, `src/app.controller.spec.ts`

**Interfaces:**
- Consumes: injected `NguoncAddonService` and `HlsProxyService`.
- Produces: controller routes for manifest, catalog, meta, and stream with Stremio envelopes and `Cache-Control` headers; `HealthController` if health is separated from Stremio routing.

- [ ] **Step 1: Write failing Stremio endpoint contract tests**

Cover valid and invalid `type`/ID paths, catalog search/skip extra path parsing, stream/meta error fallbacks, CORS, JSON MIME type, and `Cache-Control` values through `app.inject()`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `yarn test src/stremio/stremio.controller.spec.ts`

Expected: FAIL because `createAddonInterface` is still responsible for these routes.

- [ ] **Step 3: Implement controller routes and delete SDK/manual registration**

Map decorators directly to all preserved URLs. Set protocol headers at the controller boundary, remove `getRouter`, `registerHlsRoutes`, `createAddonInterface`, and all now-unused Express-specific files/imports.

- [ ] **Step 4: Run full verification**

Run: `yarn test`, `yarn lint`, and `yarn build`

Expected: all commands PASS with no Express or Stremio SDK imports remaining.

- [ ] **Step 5: Commit**

```bash
git add .env.example README.md src
git rm src/stremio-addon.factory.ts src/stremio-addon.factory.spec.ts src/app.service.ts src/app.controller.ts src/app.controller.spec.ts
git commit -m "refactor: expose Stremio APIs from Nest controllers"
```

## Plan self-review

- The four tasks cover every module, service, controller, cache, dependency, lifecycle, and verification requirement in the spec.
- The outputs of Tasks 1–3 are explicit dependencies for Task 4; all types and endpoint contracts are preserved by focused tests.
- No production implementation detail is duplicated as a transcript; each task starts with a test that must fail before its implementation.
