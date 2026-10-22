# Homepage M3U8 Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cung cấp trang chủ tối giản để tìm phim/tập và sao chép link HLS M3U8 cho player ngoài.

**Architecture:** Một `HomepageController` mới phục vụ HTML tự chứa tại `GET /`; CSS và JavaScript ở trong document, không cần bundle hoặc frontend framework. JavaScript gọi các endpoint catalog, meta và stream hiện hữu, chỉ render text/URL đã kiểm tra, rồi dùng Clipboard API để sao chép.

**Tech Stack:** NestJS 12, Fastify, TypeScript, HTML/CSS/JavaScript trình duyệt, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-22-homepage-m3u8-search-design.md`

## Global Constraints

- Không thêm dependency sản phẩm hoặc frontend build mới.
- Không thay đổi hành vi của các endpoint Stremio hiện có.
- Không phát video, lưu lịch sử, thêm catalog, đăng nhập, hay phân trang.
- Dữ liệu upstream hiển thị bằng `textContent`; poster và stream chỉ nhận URL `http:` hoặc `https:`.
- Link M3U8 là tạm thời; giao diện phải nhắc người dùng dùng sớm.

## Review Focus

- Từ khóa có dấu, khoảng trắng và ký tự URL-reserved phải được encode trước khi ghép URL catalog; Task 1 kiểm tra source chứa `encodeURIComponent`.
- Phản hồi catalog/meta/stream lỗi hoặc không đúng schema phải hiện thông báo thay vì gây lỗi JavaScript; Task 1 kiểm tra các nhánh `catch` và thông báo lỗi được render.
- Phim bộ không được resolve stream trước khi người dùng chọn tập; Task 1 kiểm tra nhánh `meta.type === 'series'` render tập và chỉ hàm chọn tập gọi URL stream series.
- URL poster/stream không phải `http:`/`https:` không được gán vào DOM hoặc copy; Task 1 kiểm tra helper `isSafeUrl` được gọi trước hai thao tác này.
- Clipboard API không khả dụng hoặc từ chối phải chọn ô URL để người dùng tự copy; Task 1 kiểm tra nhánh fallback `input.select()`.

---

## File Structure

- Create: `src/homepage.controller.ts` — controller độc lập, trả document HTML cùng client-side CSS/JavaScript.
- Modify: `src/app.module.ts` — đăng ký `HomepageController` cùng `AppController`.
- Modify: `src/stremio/stremio.controller.spec.ts` — integration test `GET /` qua Fastify để xác nhận đăng ký route không ảnh hưởng health/manifest.

### Task 1: Homepage Controller and Fastify Registration

**Files:**
- Create: `src/homepage.controller.ts`
- Modify: `src/app.module.ts:4-16`
- Modify: `src/stremio/stremio.controller.spec.ts:18-39`

**Interfaces:**
- Consumes: `GET /catalog/:type/nguonc-latest/:extra.json`, `GET /meta/:type/:id.json`, and `GET /stream/:type/:id.json` provided by `StremioController`.
- Produces: `HomepageController.home(reply: FastifyReply): FastifyReply`, which sends HTML for `GET /` with `Content-Type: text/html; charset=utf-8`.

- [ ] **Step 1: Write a failing `GET /` Fastify integration test in `src/stremio/stremio.controller.spec.ts`**

```ts
it('serves the M3U8 search page at the root route', async () => {
  const home = await app.inject({ method: 'GET', url: '/' });
  expect(home.statusCode).toBe(200);
  expect(home.headers['content-type']).toContain('text/html');
  expect(home.body).toContain('<form');
  expect(home.body).toContain('Sao chép');
});
```

- [ ] **Step 2: Run the integration test to verify it fails**

Run: `yarn vitest run src/stremio/stremio.controller.spec.ts`

Expected: FAIL because `GET /` returns Fastify's 404 response before `HomepageController` exists.

- [ ] **Step 3: Implement `HomepageController` in `src/homepage.controller.ts`**

Declare `@Controller()`. Expose `page(): string` and decorate `home(reply: FastifyReply): FastifyReply` with `@Get()`. `home` sets the HTML response type and sends `page()`. The self-contained document must provide:

- a blank search form and a results/status region;
- concurrent movie/series search using encoded query values;
- safe text-only result/movie/episode/source rendering using DOM nodes and `textContent`;
- movie stream resolution immediately after selection, but series episode buttons before any series stream request;
- read-only source URL inputs, copy buttons with `navigator.clipboard.writeText`, and `select()` fallback;
- short Vietnamese loading, no-results, and failure messages plus M3U8-expiry guidance.

Use a monotonically increasing request token around async flows so an older response cannot replace newer results. Keep IDs as API-provided `nguonc:` values and construct series stream ID as `${meta.id}:${episodeSlug}`, where `episodeSlug` is the suffix after the final `:` in a video ID.

- [ ] **Step 4: Register `HomepageController` in `src/app.module.ts`**

Add the controller import and include it in the module `controllers` array without removing `AppController`.

- [ ] **Step 5: Extend Fastify integration coverage in `src/stremio/stremio.controller.spec.ts`**

Keep the new `GET /` assertion before the existing health/manifest assertions. It must assert status `200`, `content-type` contains `text/html`, and the body exposes the search form and M3U8 copy control. Keep the existing CORS manifest assertions unchanged.

- [ ] **Step 6: Run focused tests to verify the new route and existing Stremio routes pass**

Run: `yarn vitest run src/stremio/stremio.controller.spec.ts`

Expected: PASS with the homepage document served through Fastify; health and manifest still pass.

- [ ] **Step 7: Run formatting/type/lint and full verification**

Run: `yarn test && yarn test:e2e && yarn build && yarn lint`

Expected: all commands exit `0`; no existing test regression.

- [ ] **Step 8: Perform a local manual browser-flow check**

Run the service with `yarn start:dev`, open `/`, then verify: an empty search is rejected locally; a non-empty query renders movie/series results; selecting a movie shows M3U8 sources; selecting a series first shows episodes; clicking copy reports success or leaves the URL selected when clipboard access is unavailable. Stop the development server after the check.

- [ ] **Step 9: Commit the completed feature**

```bash
git add src/homepage.controller.ts src/app.module.ts src/stremio/stremio.controller.spec.ts
git commit -m "feat: add homepage m3u8 search"
```
