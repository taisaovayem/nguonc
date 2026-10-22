import { randomUUID } from 'node:crypto';
import type { HlsProxyPort, HlsSessionInput } from './embed-resolver.js';

export interface HlsProxyOptions {
  publicBaseUrl: string;
  timeoutMs?: number;
  refreshBeforeExpiryMs?: number;
  prefetchSegments?: number;
  prefetchConcurrency?: number;
  cacheMaxBytes?: number;
  cacheIdleTtlMs?: number;
  fetcher?: typeof fetch;
  now?: () => number;
  idGenerator?: () => string;
}

export interface HlsProxyResponse {
  status: number;
  body: Uint8Array;
  unavailable?: 'session' | 'resource';
  contentType?: string;
  contentRange?: string;
  contentLength?: string;
}

interface HlsSession {
  expiresAt: number;
  referer: string;
  refresh: HlsSessionInput['refresh'];
  refreshPromise?: Promise<boolean>;
  decryptPlaylist: HlsSessionInput['decryptPlaylist'];
  resources: Map<string, URL>;
  resourceIds: Map<string, string>;
  rootPlaylist: string;
  cachedResources: Map<string, CachedResource>;
  inFlightResources: Map<string, Promise<HlsProxyResponse>>;
  queuedResourceIds: Set<string>;
  prefetchTargets: Map<string, string[]>;
  consumedResourceIds: Set<string>;
}

interface CachedResource extends HlsProxyResponse {
  cachedAt: number;
}

interface RewrittenPlaylist {
  body: string;
  mediaResourceIds: string[];
}

const BROWSER_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';

interface PrefetchJob {
  sessionId: string;
  session: HlsSession;
  resourceId: string;
}

export class HlsProxy implements HlsProxyPort {
  private readonly publicBaseUrl: URL;
  private readonly timeoutMs: number;
  private readonly refreshBeforeExpiryMs: number;
  private readonly prefetchSegments: number;
  private readonly prefetchConcurrency: number;
  private readonly cacheMaxBytes: number;
  private readonly cacheIdleTtlMs: number;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly idGenerator: () => string;
  private readonly sessions = new Map<string, HlsSession>();
  private readonly cacheCleanupTimer: NodeJS.Timeout;
  private readonly prefetchQueue: PrefetchJob[] = [];
  private cachedBytes = 0;
  private activePrefetches = 0;

  constructor(options: HlsProxyOptions) {
    this.publicBaseUrl = new URL(options.publicBaseUrl.endsWith('/') ? options.publicBaseUrl : `${options.publicBaseUrl}/`);
    this.timeoutMs = options.timeoutMs ?? 8_000;
    this.refreshBeforeExpiryMs = Math.max(0, options.refreshBeforeExpiryMs ?? 2 * 60_000);
    this.prefetchSegments = Math.max(0, Math.floor(options.prefetchSegments ?? 15));
    this.prefetchConcurrency = Math.max(1, Math.floor(options.prefetchConcurrency ?? 3));
    this.cacheMaxBytes = options.cacheMaxBytes ?? 1024 * 1024 * 1024;
    this.cacheIdleTtlMs = options.cacheIdleTtlMs ?? 30 * 60_000;
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
    this.idGenerator = options.idGenerator ?? randomUUID;
    this.cacheCleanupTimer = setInterval(() => this.purgeExpiredCache(), Math.max(1_000, Math.min(this.cacheIdleTtlMs, 60_000)));
    this.cacheCleanupTimer.unref();
  }

  createSession(input: HlsSessionInput): string | undefined {
    if (input.expiresAt <= this.now()) return undefined;
    const sessionId = this.nextId();
    if (!sessionId) return undefined;
    const referer = requestOrigin(input.refererUrl ?? input.sourceUrl);
    if (!referer) return undefined;

    const session: HlsSession = {
      expiresAt: input.expiresAt,
      referer,
      refresh: input.refresh,
      decryptPlaylist: input.decryptPlaylist,
      resources: new Map(),
      resourceIds: new Map(),
      rootPlaylist: '',
      cachedResources: new Map(),
      inFlightResources: new Map(),
      queuedResourceIds: new Set(),
      prefetchTargets: new Map(),
      consumedResourceIds: new Set(),
    };
    const rewritten = this.rewritePlaylist(sessionId, session, input.playlist, input.sourceUrl);
    if (!rewritten) return undefined;

    session.rootPlaylist = rewritten.body;
    this.sessions.set(sessionId, session);
    this.configurePrefetchTargets(session, rewritten.mediaResourceIds);
    this.prefetchResources(sessionId, session, rewritten.mediaResourceIds);
    return new URL(`hls/${sessionId}/${playlistFilename(input.playlistName)}`, this.publicBaseUrl).toString();
  }

  getRootPlaylist(sessionId: string): string | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    if (session.expiresAt + this.refreshBeforeExpiryMs <= this.now()) {
      this.deleteSession(sessionId, session);
      return undefined;
    }
    return session.rootPlaylist;
  }

  async getResource(sessionId: string, resourceId: string, range?: string): Promise<HlsProxyResponse> {
    const session = await this.getSession(sessionId);
    if (!session) return { status: 404, body: new Uint8Array(), unavailable: 'session' };
    const sourceUrl = session.resources.get(resourceId);
    if (!sourceUrl) return { status: 404, body: new Uint8Array(), unavailable: 'resource' };
    const cached = range ? undefined : this.takeCachedResource(session, resourceId);
    session.consumedResourceIds.add(resourceId);
    session.queuedResourceIds.delete(resourceId);
    if (range) this.removeCachedResource(session, resourceId);

    if (!range) {
      if (cached) {
        this.prefetchAfter(sessionId, session, resourceId);
        return cached;
      }

      const inFlight = session.inFlightResources.get(resourceId);
      if (inFlight) {
        const resource = await inFlight;
        this.removeCachedResource(session, resourceId);
        this.prefetchAfter(sessionId, session, resourceId);
        return resource;
      }
    }

    const resource = await this.fetchResource(sessionId, session, resourceId, sourceUrl, range);
    this.prefetchAfter(sessionId, session, resourceId);
    return resource;
  }

  private async fetchResource(
    sessionId: string,
    session: HlsSession,
    resourceId: string,
    sourceUrl: URL,
    range?: string,
  ): Promise<HlsProxyResponse> {

    const response = await this.fetcher(sourceUrl, {
      headers: {
        Accept: '*/*',
        Referer: session.referer,
        'User-Agent': BROWSER_USER_AGENT,
        ...(range ? { Range: range } : {}),
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const body = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') ?? undefined;
    const isHls = contentType?.includes('mpegurl') || startsWithHls(body);
    if (isHls && response.ok) {
      const decrypted = await session.decryptPlaylist(new TextDecoder('utf-8', { fatal: true }).decode(body));
      const playlist = this.rewritePlaylist(sessionId, session, decrypted, response.url || sourceUrl.toString());
      if (!playlist) throw new Error('Unable to rewrite HLS playlist');
      this.configurePrefetchTargets(session, playlist.mediaResourceIds);
      this.prefetchResources(sessionId, session, playlist.mediaResourceIds);
      return { status: response.status, body: new TextEncoder().encode(playlist.body), contentType: 'application/vnd.apple.mpegurl' };
    }

    return {
      status: response.status,
      body,
      ...(contentType ? { contentType } : {}),
      ...(response.headers.get('content-range') ? { contentRange: response.headers.get('content-range')! } : {}),
      ...(response.headers.get('content-length') ? { contentLength: response.headers.get('content-length')! } : {}),
    };
  }

  private async getSession(sessionId: string): Promise<HlsSession | undefined> {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    if (session.expiresAt - this.now() <= this.refreshBeforeExpiryMs) await this.refreshSession(sessionId, session);
    if (session.expiresAt <= this.now()) {
      this.deleteSession(sessionId, session);
      return undefined;
    }
    return session;
  }

  private async refreshSession(sessionId: string, session: HlsSession): Promise<boolean> {
    if (session.refreshPromise) return session.refreshPromise;
    const refreshPromise = this.refreshSessionOnce(sessionId, session);
    session.refreshPromise = refreshPromise;
    try {
      return await refreshPromise;
    } finally {
      if (session.refreshPromise === refreshPromise) session.refreshPromise = undefined;
    }
  }

  private async refreshSessionOnce(sessionId: string, session: HlsSession): Promise<boolean> {
    try {
      const refreshed = await session.refresh();
      if (!refreshed || refreshed.expiresAt <= this.now()) return false;
      const rewritten = this.rewritePlaylist(sessionId, session, refreshed.playlist, refreshed.sourceUrl);
      if (!rewritten) return false;
      session.expiresAt = refreshed.expiresAt;
      session.rootPlaylist = rewritten.body;
      this.configurePrefetchTargets(session, rewritten.mediaResourceIds);
      this.prefetchResources(sessionId, session, rewritten.mediaResourceIds);
      return true;
    } catch {
      return false;
    }
  }

  private rewritePlaylist(sessionId: string, session: HlsSession, playlist: string, sourceUrl: string): RewrittenPlaylist | undefined {
    let baseUrl: URL;
    try {
      baseUrl = new URL(sourceUrl);
    } catch {
      return undefined;
    }
    const resources = new Map(session.resources);
    const resourceIds = new Map(session.resourceIds);

    const rewriteUri = (value: string): { path: string; resourceId: string } | undefined => {
      let url: URL;
      try {
        url = new URL(value, baseUrl);
      } catch {
        return undefined;
      }
      const resourceKey = resourceIdentity(url);
      const existing = resourceIds.get(resourceKey);
      const resourceId = existing ?? this.nextId();
      if (!resourceId) return undefined;
      if (!existing) {
        resourceIds.set(resourceKey, resourceId);
      }
      resources.set(resourceId, url);
      return { path: new URL(`hls/${sessionId}/resource/${resourceId}`, this.publicBaseUrl).pathname, resourceId };
    };

    const rewrittenLines: string[] = [];
    const mediaResourceIds: string[] = [];
    let expectsMediaUri = false;
    for (const line of playlist.split(/\r?\n/)) {
      if (!line) {
        rewrittenLines.push(line);
        continue;
      }
      if (line.startsWith('#EXTINF:')) {
        expectsMediaUri = true;
        rewrittenLines.push(line);
        continue;
      }
      if (!line.startsWith('#')) {
        const rewritten = rewriteUri(line);
        if (rewritten === undefined) return undefined;
        if (expectsMediaUri) mediaResourceIds.push(rewritten.resourceId);
        expectsMediaUri = false;
        rewrittenLines.push(rewritten.path);
        continue;
      }
      let invalid = false;
      const rewritten = line.replace(/URI="([^"]+)"/g, (_match, value: string) => {
        const uri = rewriteUri(value);
        if (!uri) invalid = true;
        return uri ? `URI="${uri.path}"` : _match;
      });
      if (invalid) return undefined;
      rewrittenLines.push(rewritten);
    }
    session.resources = resources;
    session.resourceIds = resourceIds;
    return { body: rewrittenLines.join('\n'), mediaResourceIds };
  }

  private configurePrefetchTargets(session: HlsSession, mediaResourceIds: string[]): void {
    for (let index = 0; index < mediaResourceIds.length; index += 1) {
      session.prefetchTargets.set(mediaResourceIds[index], mediaResourceIds.slice(index + 1, index + 1 + this.prefetchSegments));
    }
  }

  private prefetchAfter(sessionId: string, session: HlsSession, resourceId: string): void {
    this.prefetchResources(sessionId, session, session.prefetchTargets.get(resourceId) ?? []);
  }

  private prefetchResources(sessionId: string, session: HlsSession, resourceIds: string[]): void {
    this.purgeExpiredCache();
    for (const resourceId of resourceIds.slice(0, this.prefetchSegments)) {
      if (session.consumedResourceIds.has(resourceId)
        || session.cachedResources.has(resourceId)
        || session.inFlightResources.has(resourceId)
        || session.queuedResourceIds.has(resourceId)
        || !session.resources.has(resourceId)) continue;
      session.queuedResourceIds.add(resourceId);
      this.prefetchQueue.push({ sessionId, session, resourceId });
    }
    this.drainPrefetchQueue();
  }

  private drainPrefetchQueue(): void {
    while (this.activePrefetches < this.prefetchConcurrency) {
      const job = this.prefetchQueue.shift();
      if (!job) return;
      const { sessionId, session, resourceId } = job;
      session.queuedResourceIds.delete(resourceId);
      const sourceUrl = session.resources.get(resourceId);
      if (this.sessions.get(sessionId) !== session
        || session.expiresAt <= this.now()
        || session.consumedResourceIds.has(resourceId)
        || session.cachedResources.has(resourceId)
        || session.inFlightResources.has(resourceId)
        || !sourceUrl) continue;

      this.activePrefetches += 1;
      const inFlight = this.fetchResource(sessionId, session, resourceId, sourceUrl);
      session.inFlightResources.set(resourceId, inFlight);
      void inFlight.then((resource) => {
        if (!session.consumedResourceIds.has(resourceId) && resource.status >= 200 && resource.status < 300 && !resource.contentType?.includes('mpegurl')) {
          this.cacheResource(session, resourceId, resource);
        }
      }).catch(() => undefined).finally(() => {
        if (session.inFlightResources.get(resourceId) === inFlight) session.inFlightResources.delete(resourceId);
        this.activePrefetches -= 1;
        this.drainPrefetchQueue();
      });
    }
  }

  private cacheResource(session: HlsSession, resourceId: string, resource: HlsProxyResponse): void {
    const size = resource.body.byteLength;
    if (size > this.cacheMaxBytes) return;
    this.removeCachedResource(session, resourceId);
    this.purgeExpiredCache();
    while (this.cachedBytes + size > this.cacheMaxBytes && this.evictOldestCachedResource()) {
      // Evict until this response fits the configured shared memory budget.
    }
    if (this.cachedBytes + size > this.cacheMaxBytes) return;
    session.cachedResources.set(resourceId, { ...resource, cachedAt: this.now() });
    this.cachedBytes += size;
  }

  private takeCachedResource(session: HlsSession, resourceId: string): HlsProxyResponse | undefined {
    this.purgeExpiredCache();
    const resource = session.cachedResources.get(resourceId);
    if (!resource) return undefined;
    this.removeCachedResource(session, resourceId);
    const { cachedAt: _cachedAt, ...response } = resource;
    return response;
  }

  private removeCachedResource(session: HlsSession, resourceId: string): void {
    const resource = session.cachedResources.get(resourceId);
    if (!resource) return;
    session.cachedResources.delete(resourceId);
    this.cachedBytes -= resource.body.byteLength;
  }

  private purgeExpiredCache(): void {
    const now = this.now();
    for (const [sessionId, session] of this.sessions) {
      if (session.expiresAt + this.refreshBeforeExpiryMs <= now && !session.refreshPromise) {
        this.deleteSession(sessionId, session);
        continue;
      }
      for (const [resourceId, resource] of session.cachedResources) {
        if (resource.cachedAt + this.cacheIdleTtlMs <= now) this.removeCachedResource(session, resourceId);
      }
    }
  }

  private evictOldestCachedResource(): boolean {
    let oldest: { session: HlsSession; resourceId: string; cachedAt: number } | undefined;
    for (const session of this.sessions.values()) {
      for (const [resourceId, resource] of session.cachedResources) {
        if (!oldest || resource.cachedAt < oldest.cachedAt) oldest = { session, resourceId, cachedAt: resource.cachedAt };
      }
    }
    if (!oldest) return false;
    this.removeCachedResource(oldest.session, oldest.resourceId);
    return true;
  }

  private deleteSession(sessionId: string, session: HlsSession): void {
    for (const resourceId of session.cachedResources.keys()) this.removeCachedResource(session, resourceId);
    session.queuedResourceIds.clear();
    for (let index = this.prefetchQueue.length - 1; index >= 0; index -= 1) {
      if (this.prefetchQueue[index].session === session) this.prefetchQueue.splice(index, 1);
    }
    this.sessions.delete(sessionId);
  }

  private nextId(): string | undefined {
    const id = this.idGenerator();
    return /^[a-zA-Z0-9_-]+$/.test(id) ? id : undefined;
  }
}

function startsWithHls(body: Uint8Array): boolean {
  return new TextDecoder().decode(body.slice(0, 8)).startsWith('#EXTM3U');
}

function requestOrigin(value: string): string | undefined {
  try {
    const url = new URL(value);
    return `${url.origin}/`;
  } catch {
    return undefined;
  }
}

function playlistFilename(value: string | undefined): string {
  const slug = value
    ?.normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'playlist'}.m3u8`;
}

function resourceIdentity(url: URL): string {
  return `${url.origin}${url.pathname}`;
}
