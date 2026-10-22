# StreamC HLS grant refresh design

## Goal

Keep an actively playing StreamC HLS URL usable beyond one upstream playlist grant without adding a database or changing its public `.m3u8` URL.

## Constraints

- Refresh begins when a session has two minutes or less remaining.
- The embed URL and video hash remain server-side only.
- Session state remains in memory; restarting the application invalidates existing HLS links.
- Existing opaque session and resource routes remain unchanged.

## Design

`EmbedResolver` will create a closure that can repeat the existing StreamC bootstrap and playlist decryption flow for the original embed URL. It will pass that closure into `HlsProxy` with the first decrypted playlist and its expiry.

An HLS session retains the refresh closure. Before serving a resource, `HlsProxy` checks its expiry. At or within the two-minute refresh window, concurrent requests share one refresh operation. A successful operation replaces the root playlist, expiry, and registered upstream resource URLs while preserving the session ID and stable local resource IDs. URLs are matched by origin and path, letting StreamC renew query-string signatures without changing player-facing resource URLs.

If a pre-expiry refresh fails, the proxy continues with the still-valid grant and retries on a later resource request. Once the grant has expired, a failed refresh removes the session and preserves the existing 404 behavior. No background timer refreshes inactive sessions.

## Testing

Unit tests will prove that a request in the refresh window performs one shared refresh, continues using the original local resource URL, and fetches the renewed upstream segment URL. Resolver tests will prove that the refresh callback repeats bootstrap/decryption without exposing embed data in the published URL.
