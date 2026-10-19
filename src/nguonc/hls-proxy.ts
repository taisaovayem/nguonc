import { randomUUID } from 'node:crypto';
import type { HlsProxyPort, HlsSessionInput } from './embed-resolver.js';

export interface HlsProxyOptions {
  publicBaseUrl: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
  now?: () => number;
  idGenerator?: () => string;
}

export interface HlsProxyResponse {
  status: number;
  body: Uint8Array;
  contentType?: string;
  contentRange?: string;
  contentLength?: string;
}

interface HlsSession {
  expiresAt: number;
  referer: string;
  decryptPlaylist: HlsSessionInput['decryptPlaylist'];
  resources: Map<string, URL>;
  resourceIds: Map<string, string>;
  rootPlaylist: string;
}

const BROWSER_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';

export class HlsProxy implements HlsProxyPort {
  private readonly publicBaseUrl: URL;
  private readonly timeoutMs: number;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly idGenerator: () => string;
  private readonly sessions = new Map<string, HlsSession>();

  constructor(options: HlsProxyOptions) {
    this.publicBaseUrl = new URL(options.publicBaseUrl.endsWith('/') ? options.publicBaseUrl : `${options.publicBaseUrl}/`);
    this.timeoutMs = options.timeoutMs ?? 8_000;
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
    this.idGenerator = options.idGenerator ?? randomUUID;
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
      decryptPlaylist: input.decryptPlaylist,
      resources: new Map(),
      resourceIds: new Map(),
      rootPlaylist: '',
    };
    const playlist = this.rewritePlaylist(sessionId, session, input.playlist, input.sourceUrl);
    if (!playlist) return undefined;

    session.rootPlaylist = playlist;
    this.sessions.set(sessionId, session);
    return new URL(`hls/${sessionId}/${playlistFilename(input.playlistName)}`, this.publicBaseUrl).toString();
  }

  getRootPlaylist(sessionId: string): string | undefined {
    return this.getSession(sessionId)?.rootPlaylist;
  }

  async getResource(sessionId: string, resourceId: string, range?: string): Promise<HlsProxyResponse | undefined> {
    const session = this.getSession(sessionId);
    const sourceUrl = session?.resources.get(resourceId);
    if (!session || !sourceUrl) return undefined;

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
      if (!playlist) return undefined;
      return { status: response.status, body: new TextEncoder().encode(playlist), contentType: 'application/vnd.apple.mpegurl' };
    }

    return {
      status: response.status,
      body,
      ...(contentType ? { contentType } : {}),
      ...(response.headers.get('content-range') ? { contentRange: response.headers.get('content-range')! } : {}),
      ...(response.headers.get('content-length') ? { contentLength: response.headers.get('content-length')! } : {}),
    };
  }

  private getSession(sessionId: string): HlsSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session && session.expiresAt <= this.now()) this.sessions.delete(sessionId);
    return this.sessions.get(sessionId);
  }

  private rewritePlaylist(sessionId: string, session: HlsSession, playlist: string, sourceUrl: string): string | undefined {
    let baseUrl: URL;
    try {
      baseUrl = new URL(sourceUrl);
    } catch {
      return undefined;
    }

    const rewriteUri = (value: string): string | undefined => {
      let url: URL;
      try {
        url = new URL(value, baseUrl);
      } catch {
        return undefined;
      }
      if (url.protocol !== 'https:' || url.username || url.password) return undefined;

      const existing = session.resourceIds.get(url.toString());
      const resourceId = existing ?? this.nextId();
      if (!resourceId) return undefined;
      if (!existing) {
        session.resourceIds.set(url.toString(), resourceId);
        session.resources.set(resourceId, url);
      }
      return new URL(`hls/${sessionId}/resource/${resourceId}`, this.publicBaseUrl).pathname;
    };

    const rewrittenLines: string[] = [];
    for (const line of playlist.split(/\r?\n/)) {
      if (!line || line.startsWith('#EXTINF:')) {
        rewrittenLines.push(line);
        continue;
      }
      if (!line.startsWith('#')) {
        const rewritten = rewriteUri(line);
        if (rewritten === undefined) return undefined;
        rewrittenLines.push(rewritten);
        continue;
      }
      let invalid = false;
      const rewritten = line.replace(/URI="([^"]+)"/g, (_match, value: string) => {
        const uri = rewriteUri(value);
        if (!uri) invalid = true;
        return uri ? `URI="${uri}"` : _match;
      });
      if (invalid) return undefined;
      rewrittenLines.push(rewritten);
    }
    return rewrittenLines.join('\n');
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
    return url.protocol === 'https:' && !url.username && !url.password ? `${url.origin}/` : undefined;
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
