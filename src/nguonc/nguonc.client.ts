import { NguoncListResponse, NguoncMovie } from './types.js';

export interface NguoncClientOptions {
  baseUrl: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}

export interface NguoncClientPort {
  getMovie(slug: string): Promise<NguoncMovie>;
  listLatest(page: number): Promise<NguoncListResponse>;
  search(keyword: string, page: number): Promise<NguoncListResponse>;
}

export class NguoncClient implements NguoncClientPort {
  private readonly baseUrl: URL;
  private readonly timeoutMs: number;
  private readonly fetcher: typeof fetch;

  constructor(options: NguoncClientOptions) {
    this.baseUrl = new URL(options.baseUrl.endsWith('/') ? options.baseUrl : `${options.baseUrl}/`);
    this.timeoutMs = options.timeoutMs ?? 8_000;
    this.fetcher = options.fetcher ?? fetch;
  }

  getMovie(slug: string): Promise<NguoncMovie> {
    return this.get(`film/${encodeURIComponent(slug)}`).then((payload) => {
      if (!isRecord(payload) || !isRecord(payload.movie)) throw new Error('NguồnC returned an invalid film payload');
      return payload.movie as unknown as NguoncMovie;
    });
  }

  listLatest(page: number): Promise<NguoncListResponse> {
    return this.list(`films/phim-moi-cap-nhat?page=${page}`);
  }

  search(keyword: string, page: number): Promise<NguoncListResponse> {
    return this.list(`films/search?keyword=${encodeURIComponent(keyword)}&page=${page}`);
  }

  private async list(path: string): Promise<NguoncListResponse> {
    const payload = await this.get(path);
    if (!isRecord(payload) || !Array.isArray(payload.items) || !isRecord(payload.paginate)) {
      throw new Error('NguồnC returned an invalid list payload');
    }
    return payload as unknown as NguoncListResponse;
  }

  private async get(path: string): Promise<unknown> {
    const response = await this.fetcher(new URL(path, this.baseUrl), {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`NguồnC request failed with HTTP ${response.status}`);
    return response.json();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
