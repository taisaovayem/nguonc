# StreamC HLS Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve StreamC embeds into an addon-hosted HLS proxy URL that Stremio can play.

**Architecture:** `EmbedResolver` will reproduce StreamC's bootstrap request, obtain and decrypt its signed HLS playlist, then create an opaque session through `HlsProxy`.  `HlsProxy` will rewrite root and nested HLS manifests to only proxy resources registered to that session; HTTP routes expose the manifest and range-aware media responses at `PUBLIC_BASE_URL`.

**Tech Stack:** NestJS 12, TypeScript 6 / Node 24 Web Crypto, Express adapter, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-10-20-streamc-hls-proxy-design.md`

## Global Constraints

- Use `PUBLIC_BASE_URL=https://nguonc.taisaovayem.com` as the externally visible HLS route origin.
- Allow only `streamc.xyz` and DNS-label subdomains for initial embeds; reject credentials and non-HTTPS URLs.
- Reproduce the captured NguồnC bootstrap body, including the `phim.nguonc.com` referrer/origin values.
- Decrypt `#ENC-AESGCM` HLS envelopes using the documented HMAC-SHA-256/AES-GCM derivation.
- The resource endpoint must proxy only URLs registered for its session, preserve a client `Range` header, and never act as an arbitrary URL proxy.
- Preserve the existing addon catalogue/meta/stream contracts and keep stream caching bounded by the upstream grant expiry.

## Review Focus

- An attacker supplies `embed15.streamc.xyz.evil.example`; the resolver rejects it at the DNS boundary.
- A bootstrap payload has a playlist URL outside the embed origin, invalid dates, or no `preissued` grant; the resolver returns no stream.
- An encrypted playlist has a malformed IV, ciphertext, or authentication tag; it cannot produce a session.
- A client requests an expired session or unknown resource ID; it receives 404 without triggering an upstream fetch.
- A player requests a byte range from a registered non-HLS segment; the proxy forwards the range and preserves the upstream media status and headers.

---

### Task 1: StreamC bootstrap and encrypted-playlist resolution

**Files:**
- Modify: `src/nguonc/embed-resolver.ts`
- Modify: `src/nguonc/embed-resolver.spec.ts`

**Interfaces:**
- Consumes: `HlsProxyPort` from Task 2: `createSession(input: HlsSessionInput): string | undefined`.
- Produces: `EmbedResolver.resolve(embedUrl: string): Promise<string | undefined>`, returning an addon-hosted playlist URL after creating a session.

- [ ] **Step 1: Write failing resolver tests**

Add fixtures for a valid StreamC bootstrap response with `preissued`, and an AES-GCM playlist envelope encrypted from a literal HLS fixture using hash `e98bc48528bc4c91980a653c79e38b16`.  Assert that resolving `https://embed15.streamc.xyz/embed.php?hash=...` posts the exact captured bootstrap payload and hands the decrypted `#EXTM3U` text plus its source URL/expiry to the publisher.  Add tests proving an `embed15.streamc.xyz.evil.example` URL is never fetched and malformed envelopes return `undefined`.

- [ ] **Step 2: Run the resolver tests to verify they fail**

Run: `yarn test src/nguonc/embed-resolver.spec.ts`

Expected: FAIL because the resolver only fetches HTML and has no StreamC bootstrap/decryption flow.

- [ ] **Step 3: Implement the StreamC resolver flow**

Extend `EmbedResolverOptions` with `playlistPublisher: HlsProxyPort` and implement host-boundary validation.  POST the exact captured JSON payload with `bootstrap_format: "aesgcm-v1"`; decrypt its bootstrap envelope using SHA-256 of `stream-bootstrap-v1\n<embed URL>` as the AES-GCM key; validate `preissued.playlist`, `issuedAt`, and `expiresAt`; fetch and decrypt its AES-GCM playlist envelope through Node Web Crypto; then call `playlistPublisher.createSession` with the decrypted HLS text and a closure that can decrypt nested playlists for the same video hash.

- [ ] **Step 4: Run the resolver tests to verify they pass**

Run: `yarn test src/nguonc/embed-resolver.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/nguonc/embed-resolver.ts src/nguonc/embed-resolver.spec.ts
git commit -m "feat: resolve encrypted StreamC playlists"
```

### Task 2: Opaque HLS session and resource proxy

**Files:**
- Create: `src/nguonc/hls-proxy.ts`
- Create: `src/nguonc/hls-proxy.spec.ts`

**Interfaces:**
- Consumes: a decrypted root playlist, its source URL, an AES-GCM playlist-decryption closure, and expiry from Task 1.
- Produces: `HlsProxyPort`, `HlsSessionInput`, `HlsProxy.getRootPlaylist(sessionId)`, and `HlsProxy.getResource(sessionId, resourceId, range?)`.

- [ ] **Step 1: Write failing HLS proxy tests**

Cover creation of a public root URL at `https://nguonc.taisaovayem.com/hls/<id>/playlist.m3u8`; rewriting a relative media URI and `EXT-X-MAP` URI to opaque resource URLs; returning 404-equivalent `undefined` for an expired session/unknown resource; and forwarding `Range: bytes=100-` plus status/content-type/content-range for a binary resource fixture.  Add a nested plain HLS fixture proving it is rewritten before being returned.

- [ ] **Step 2: Run the HLS proxy tests to verify they fail**

Run: `yarn test src/nguonc/hls-proxy.spec.ts`

Expected: FAIL because `HlsProxy` does not exist.

- [ ] **Step 3: Implement `HlsProxy`**

Create a focused in-memory, TTL-bounded session store.  Generate opaque IDs with `randomUUID`; register only valid HTTPS, credential-free URLs discovered while rewriting manifests; rewrite plain URI lines and `URI="..."` HLS attributes against the source URL.  For registered resource reads, forward a supplied range and browser-compatible referer/user-agent; recursively decrypt/rewrite HLS bodies and otherwise return binary body/status/content headers.

- [ ] **Step 4: Run the HLS proxy tests to verify they pass**

Run: `yarn test src/nguonc/hls-proxy.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/nguonc/hls-proxy.ts src/nguonc/hls-proxy.spec.ts
git commit -m "feat: add bounded HLS playlist proxy"
```

### Task 3: Publish HLS routes and wire production configuration

**Files:**
- Create: `src/nguonc/hls-routes.ts`
- Create: `src/nguonc/hls-routes.spec.ts`
- Modify: `src/main.ts`
- Modify: `src/nguonc/addon.service.spec.ts`

**Interfaces:**
- Consumes: `HlsProxy` from Task 2 and the resolver publisher dependency from Task 1.
- Produces: `registerHlsRoutes(app, proxy)` and production wiring that returns the configured public HLS URL in Stremio stream results.

- [ ] **Step 1: Write failing route and addon integration tests**

Use an Express app with `registerHlsRoutes` to prove root playlists return `application/vnd.apple.mpegurl`, unknown sessions return 404, and registered binary resources preserve a range response.  Extend the addon stream test with a resolver result of `https://nguonc.taisaovayem.com/hls/session/playlist.m3u8` and assert the returned stream URL is unchanged.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `yarn test src/nguonc/hls-routes.spec.ts src/nguonc/addon.service.spec.ts`

Expected: FAIL because route registration and public HLS wiring do not exist.

- [ ] **Step 3: Implement the routes and main wiring**

Add read-only Express routes that translate a missing proxy result to 404, set manifest/binary headers, and stream the buffered proxy response.  In `main.ts`, parse and validate `PUBLIC_BASE_URL`, instantiate `HlsProxy`, pass it to `EmbedResolver`, register routes before attaching the Stremio router, and change the default embed allowlist to `streamc.xyz`.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `yarn test src/nguonc/hls-routes.spec.ts src/nguonc/addon.service.spec.ts`

Expected: PASS.

- [ ] **Step 5: Run full verification and commit Task 3**

Run: `yarn test && yarn lint && yarn build`

Expected: all tests, lint, and the Nest build pass.

```bash
git add src/main.ts src/nguonc/hls-routes.ts src/nguonc/hls-routes.spec.ts src/nguonc/addon.service.spec.ts
git commit -m "feat: publish StreamC HLS routes"
```
