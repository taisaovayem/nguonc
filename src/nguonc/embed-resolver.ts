import { webcrypto } from 'node:crypto';

export interface HlsSessionInput {
  playlist: string;
  playlistName?: string;
  sourceUrl: string;
  refererUrl?: string;
  expiresAt: number;
  videoHash: string;
  decryptPlaylist: (encryptedPlaylist: string) => Promise<string>;
}

export interface HlsProxyPort {
  createSession(input: HlsSessionInput): string | undefined;
}

export interface EmbedResolverOptions {
  playlistPublisher?: HlsProxyPort;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}

interface StreamBootstrap {
  api: string;
  video: string;
  preissued?: PlaylistGrant;
}

interface PlaylistGrant {
  playlist: string;
  playlistFormat?: string;
  issuedAt: number;
  expiresAt: number;
}

interface AesGcmEnvelope {
  format: 'aesgcm-v1';
  iv: string;
  data: string;
}

const STREAMC_REFERRER = 'https://phim.nguonc.com/';

export class EmbedResolver {
  private readonly timeoutMs: number;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: EmbedResolverOptions) {
    this.timeoutMs = options.timeoutMs ?? 8_000;
    this.fetcher = options.fetcher ?? fetch;
  }

  async resolve(embedUrl: string, playlistName?: string): Promise<string | undefined> {
    if (!this.options.playlistPublisher) return undefined;

    const embed = parseEmbedUrl(embedUrl);
    if (!embed) return undefined;

    try {
      const bootstrap = await this.bootstrap(embed.url, embed.hash);
      if (!bootstrap) return undefined;

      const grant = validateGrant(bootstrap.preissued);
      if (!grant) return undefined;

      const playlistResponse = await this.fetcher(grant.playlist, {
        headers: streamHeaders(embed.url),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!playlistResponse.ok) return undefined;

      const decryptPlaylist = async (encryptedPlaylist: string) => {
        if (encryptedPlaylist.includes('#ENC-AESGCM') || encryptedPlaylist.includes('#EXT-X-B65')) {
          return decryptStreamPlaylist(encryptedPlaylist, embed.hash);
        }
        if (!encryptedPlaylist.startsWith('#EXTM3U\\n') && !encryptedPlaylist.startsWith('#EXTM3U\\r\\n')) {
          throw new Error('Expected an HLS playlist');
        }
        return encryptedPlaylist;
      };
      const playlist = await decryptPlaylist(await playlistResponse.text());
      return this.options.playlistPublisher.createSession({
        playlist,
        playlistName,
        sourceUrl: playlistResponse.url || grant.playlist,
        refererUrl: embed.url.toString(),
        expiresAt: grant.expiresAt * 1_000,
        videoHash: embed.hash,
        decryptPlaylist,
      });
    } catch {
      return undefined;
    }
  }

  private async bootstrap(embedUrl: URL, videoHash: string): Promise<StreamBootstrap | undefined> {
    const body = JSON.stringify({
      action: 'bootstrap',
      referrer: STREAMC_REFERRER,
      frame_origins: [new URL(STREAMC_REFERRER).origin],
      request_grant: true,
      playlist_format: 'aesgcm-v2',
      pretty_url: true,
      path_chunks: true,
      bootstrap_format: 'aesgcm-v1',
    });
    const headers = new Headers(streamHeaders(embedUrl));
    headers.set('Content-Type', 'application/json');
    const response = await this.fetcher(embedUrl, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) return undefined;

    const payload = await response.json() as unknown;
    const bootstrap = await decryptBootstrap(payload, embedUrl);
    return isStreamBootstrap(bootstrap, embedUrl, videoHash) ? bootstrap : undefined;
  }

}

function parseEmbedUrl(value: string): { url: URL; hash: string } | undefined {
  try {
    const url = new URL(value);
    const hash = url.searchParams.get('hash');
    if (!hash || !/^[a-f0-9]{32}$/i.test(hash)) {
      return undefined;
    }
    return { url, hash: hash.toLowerCase() };
  } catch {
    return undefined;
  }
}

function streamHeaders(embedUrl: URL): HeadersInit {
  return {
    Accept: 'application/json, text/plain, */*',
    Origin: embedUrl.origin,
    Referer: embedUrl.toString(),
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
  };
}

async function decryptBootstrap(payload: unknown, embedUrl: URL): Promise<unknown> {
  if (!isAesGcmEnvelope(payload)) return undefined;
  const additionalData = new TextEncoder().encode(`stream-bootstrap-v1\n${embedUrl.href}`);
  const keyMaterial = await webcrypto.subtle.digest('SHA-256', additionalData);
  return JSON.parse(await decryptAesGcm(payload, keyMaterial, additionalData));
}

async function decryptStreamPlaylist(playlist: string, videoHash: string): Promise<string> {
  const lines = playlist.trim().split(/\r?\n/);
  const match = /^#ENC-AESGCM;iv=([a-f0-9]{24})$/i.exec(lines[1] ?? '');
  if (lines.length !== 4 || lines[0] !== '#EXTM3U' || !match || lines[2] !== '#EXT-X-B65:0-138' || !/^[A-Za-z0-9+/]+={0,2}$/.test(lines[3] ?? '')) {
    throw new Error('Invalid encrypted playlist envelope');
  }

  const hmacKey = await webcrypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('stream-derive-v1'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const keyMaterial = await webcrypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(videoHash));
  const decrypted = await decryptAesGcm({ format: 'aesgcm-v1', iv: match[1], data: lines[3] }, keyMaterial);
  if (!decrypted.startsWith('#EXTM3U\n') && !decrypted.startsWith('#EXTM3U\r\n')) throw new Error('Decrypted value is not an HLS playlist');
  return decrypted;
}

async function decryptAesGcm(envelope: AesGcmEnvelope, keyMaterial: BufferSource, additionalData?: Uint8Array): Promise<string> {
  const iv = Buffer.from(envelope.iv, 'hex');
  const ciphertext = Buffer.from(envelope.data, 'base64');
  if (iv.length !== 12 || ciphertext.length <= 16) throw new Error('Invalid AES-GCM envelope');
  const key = await webcrypto.subtle.importKey('raw', keyMaterial, 'AES-GCM', false, ['decrypt']);
  const plaintext = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData }, key, ciphertext);
  return new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
}

function isAesGcmEnvelope(value: unknown): value is AesGcmEnvelope {
  return isRecord(value)
    && value.format === 'aesgcm-v1'
    && typeof value.iv === 'string'
    && /^[a-f0-9]{24}$/i.test(value.iv)
    && typeof value.data === 'string'
    && /^[A-Za-z0-9+/]+={0,2}$/.test(value.data);
}

function isStreamBootstrap(value: unknown, embedUrl: URL, videoHash: string): value is StreamBootstrap {
  return isRecord(value)
    && value.api === embedUrl.href
    && value.video === videoHash
    && (!('preissued' in value) || isRecord(value.preissued));
}

function validateGrant(value: unknown): PlaylistGrant | undefined {
  if (!isRecord(value)) return undefined;
  const { playlist: playlistValue, playlistFormat, issuedAt, expiresAt } = value;
  if (typeof playlistValue !== 'string'
    || typeof issuedAt !== 'number'
    || typeof expiresAt !== 'number'
    || !Number.isInteger(issuedAt)
    || !Number.isInteger(expiresAt)
    || expiresAt <= issuedAt
    || expiresAt - issuedAt > 86_400
    || expiresAt * 1_000 <= Date.now()) return undefined;

  try {
    const playlist = new URL(playlistValue);
    return {
      playlist: playlist.toString(),
      ...(typeof playlistFormat === 'string' ? { playlistFormat } : {}),
      issuedAt,
      expiresAt,
    };
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
