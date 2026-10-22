# StreamC HLS Grant Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Renew the upstream StreamC playlist grant before expiry while retaining the public session and HLS resource URLs.

**Architecture:** `EmbedResolver` supplies each HLS session an in-memory callback that repeats bootstrap, grant validation, playlist fetch, and decryption with the original embed URL/hash captured in a closure. `HlsProxy` calls that callback inside a configurable two-minute refresh window, coalesces simultaneous refreshes, and rebuilds resource mappings by stable origin/path identity so refreshed signatures remain invisible to players.

**Tech Stack:** NestJS, TypeScript, Node.js Web Crypto, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-22-streamc-hls-grant-refresh-design.md`

## Global Constraints

- Keep all refresh state in process memory; do not add a database or cache service.
- Keep the existing public HLS route shape and opaque session IDs unchanged.
- Keep the original embed URL and video hash server-side only.
- Refresh at or within 120,000 ms of upstream grant expiry by default.
- Preserve the existing behavior that a session is unavailable after an expired grant cannot be refreshed.

## Review Focus

- Concurrent segment requests in the refresh window must issue exactly one bootstrap refresh; cover in Task 2.
- A failed early refresh must still serve the currently valid upstream URL; cover in Task 2.
- A failed refresh after actual expiry must produce the existing unavailable-session result without an upstream segment request; cover in Task 2.
- Refreshed query-string signatures must retain the original local resource route; cover in Task 2.
- No public URL or stream response may expose the original embed hash; cover in Task 1.

### Task 1: Reusable StreamC grant resolution

**Files:**
- Modify: `src/nguonc/embed-resolver.ts`
- Modify: `src/nguonc/embed-resolver.spec.ts`

**Interfaces:**
- Produces `HlsSessionRefresh`, containing `playlist`, `sourceUrl`, and `expiresAt`.
- Extends `HlsSessionInput` with `refresh(): Promise<HlsSessionRefresh | undefined>`.
- `EmbedResolver.resolve(embedUrl, playlistName?)` passes a closure that obtains a new `HlsSessionRefresh` using only server-side captured embed data.

- [ ] **Step 1: Write failing resolver tests**

Add a test that captures the `createSession` input, invokes `input.refresh()`, and asserts a second bootstrap POST and second signed-playlist fetch occur. Assert the refreshed playlist/deadline are returned and the published URL contains neither the embed hash nor upstream URL.

- [ ] **Step 2: Run the focused resolver test to verify it fails**

Run: `yarn test src/nguonc/embed-resolver.spec.ts`

Expected: FAIL because the session input has no refresh callback.

- [ ] **Step 3: Implement reusable grant loading in `src/nguonc/embed-resolver.ts`**

Extract the bootstrap, grant validation, playlist fetch, and decryption sequence into a private method returning `HlsSessionRefresh | undefined`. Resolve the initial playlist through that method and pass a closure that calls it again with the parsed embed URL/hash.

- [ ] **Step 4: Run resolver tests to verify they pass**

Run: `yarn test src/nguonc/embed-resolver.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit resolver refresh support**

```bash
git add src/nguonc/embed-resolver.ts src/nguonc/embed-resolver.spec.ts
git commit -m "feat: refresh StreamC playlist grants"
```

### Task 2: In-memory HLS session refresh

**Files:**
- Modify: `src/nguonc/hls-proxy.ts`
- Modify: `src/nguonc/hls-proxy.spec.ts`
- Modify: `src/hls/hls-proxy.service.ts`
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Consumes `HlsSessionInput.refresh()` from Task 1.
- Adds `refreshBeforeExpiryMs?: number` to `HlsProxyOptions`; default `120_000`.
- `HlsProxy.getResource(sessionId, resourceId, range?)` refreshes eligible sessions before it reads the registered upstream resource.

- [ ] **Step 1: Write failing HLS proxy tests**

Add focused tests using a controlled `now()` and `prefetchSegments: 0`:

1. A resource request with exactly two minutes left calls `refresh` and fetches the renewed `?signature=new` upstream URL through the pre-existing local resource ID.
2. Two resource requests while a deferred refresh is pending share one `refresh` promise.
3. A failed refresh before expiry falls back to the old still-valid upstream URL.
4. A failed refresh after expiry returns `{ status: 404, unavailable: 'session' }` without fetching the stale segment.

- [ ] **Step 2: Run HLS proxy tests to verify they fail**

Run: `yarn test src/nguonc/hls-proxy.spec.ts`

Expected: FAIL because sessions are deleted at expiry and cannot refresh their resource mappings.

- [ ] **Step 3: Implement refreshable sessions in `src/nguonc/hls-proxy.ts`**

Store the refresh callback and one shared in-flight refresh promise per session. Before serving a resource, invoke a helper that refreshes at the configured threshold, updates `expiresAt` and the rewritten root playlist, and retains resource IDs by origin/path identity while replacing their upstream URLs. Leave a pre-expiry session usable when refresh returns `undefined`; delete it only if it is expired and refresh fails.

- [ ] **Step 4: Wire configuration and document it**

Read `HLS_REFRESH_BEFORE_EXPIRY_MS` in `HlsProxyService`, defaulting to `120_000`. Add the setting and Vietnamese explanation to `.env.example` and `README.md`.

- [ ] **Step 5: Run focused tests to verify they pass**

Run: `yarn test src/nguonc/hls-proxy.spec.ts src/nguonc/embed-resolver.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit HLS refresh support**

```bash
git add src/nguonc/hls-proxy.ts src/nguonc/hls-proxy.spec.ts src/hls/hls-proxy.service.ts .env.example README.md
git commit -m "feat: refresh HLS sessions before expiry"
```

### Task 3: Full regression verification

**Files:**
- No source changes expected.

**Interfaces:**
- Verifies existing Stremio, HLS controller, and application contracts remain compatible with Tasks 1–2.

- [ ] **Step 1: Run the full test suite**

Run: `yarn test`

Expected: PASS with no test failures.

- [ ] **Step 2: Inspect the final diff and status**

Run: `git diff HEAD~2..HEAD` and `git status --short`

Expected: only the planned commits and no unintended working-tree changes.
