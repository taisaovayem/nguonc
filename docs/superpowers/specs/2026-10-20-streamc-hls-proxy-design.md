# StreamC HLS proxy design

## Goal

Allow the NguồnC Stremio addon to play StreamC embeds through the public addon URL, `https://nguonc.taisaovayem.com`, without relying on browser DevTools or browser-side JavaScript.

## Evidence and constraints

- StreamC embeds use hosts such as `embed15.streamc.xyz`; exact hostname matching against `embed.streamc.xyz` rejects valid embeds.
- The cached StreamC player sends a JSON `bootstrap` POST to the embed URL.  The captured 223-byte request proves the request fields and values used for NguồnC:
  - `referrer: "https://phim.nguonc.com/"`
  - `frame_origins: ["https://phim.nguonc.com"]`
  - `request_grant: true`, `playlist_format: "aesgcm-v2"`, `pretty_url: true`, `path_chunks: true`, and `bootstrap_format: "aesgcm-v1"`.
- The bootstrap response contains a pre-issued signed playlist URL.  The playlist is an AES-GCM envelope, not plain HLS.  The player derives the AES key as HMAC-SHA-256 of the embed `hash`, keyed with `stream-derive-v1`.
- Decrypted media is HLS with MPEG-TS segments served under paths such as `https://indoss15.amass15.top/<hash>/streamaaa0000.png`.  The suffix is a disguise; the bytes are MPEG-TS.
- A direct signed playlist URL cannot be returned to Stremio: it requires browser JavaScript to decrypt it and relative URLs would resolve against StreamC.  The addon must host a rewritten HLS playlist.

## Architecture

1. `EmbedResolver` validates a StreamC host at a DNS-label boundary (`streamc.xyz` and its subdomains), performs the bootstrap request, validates the pre-issued playlist data, fetches the signed playlist, and decrypts its AES-GCM envelope.
2. `HlsSessionStore` creates an opaque session ID for the decrypted root playlist.  Each session owns only URLs discovered in its playlists, has a bounded TTL based on the issued playlist expiry, and is removed once expired.  This prevents the public endpoint from becoming an arbitrary URL proxy.
3. The resolver registers the root playlist in the store and returns `PUBLIC_BASE_URL/hls/<session-id>/playlist.m3u8` to `NguoncAddonService`.
4. The HTTP layer exposes two read-only routes:
   - `GET /hls/:sessionId/playlist.m3u8` returns the rewritten root manifest.
   - `GET /hls/:sessionId/resource/:resourceId` retrieves only a URL registered for that session.  If it is an HLS manifest, it decrypts when required and rewrites its URIs recursively.  Otherwise it forwards the media response, including a client `Range` request and relevant content headers.
5. Manifest rewriting replaces every URI-bearing HLS reference (plain media/variant lines and URI attributes such as `EXT-X-MAP` and `EXT-X-KEY`) with a session resource route.  The original source URL is resolved before registration, so relative URI semantics are preserved.

## Failure handling and safety

- Invalid embeds, malformed bootstrap responses, expired sessions, and malformed encryption envelopes produce no stream or a 404; no internal errors or upstream URLs are disclosed.
- Bootstrap, playlist, and resource fetches share the configured request timeout.
- Only HTTPS URLs without credentials are accepted as upstream playlist resources.
- The proxy forwards a StreamC referer and a browser-compatible user agent when contacting registered upstream resources.
- Session and resolver caches stay bounded.  The existing 15-minute stream cache remains valid because sessions expire no later than the upstream grant.

## Testing

- Unit tests first reproduce the StreamC bootstrap and encrypted playlist flow with an injected fetcher.
- Tests cover domain-boundary validation, AES-GCM decryption, HLS URI rewriting, session expiry, refusal of unknown resources, and binary/range proxy forwarding.
- Existing addon-stream tests verify that a resolved stream points to the configured public HLS endpoint.
- Run the focused Vitest tests, then the complete test suite, lint, and build.
