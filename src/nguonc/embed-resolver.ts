export interface EmbedResolverOptions {
  allowedHosts: string[];
  timeoutMs?: number;
  fetcher?: typeof fetch;
}

export class EmbedResolver {
  private readonly allowedHosts: Set<string>;
  private readonly timeoutMs: number;
  private readonly fetcher: typeof fetch;

  constructor(options: EmbedResolverOptions) {
    this.allowedHosts = new Set(options.allowedHosts.map((host) => host.toLowerCase()));
    this.timeoutMs = options.timeoutMs ?? 8_000;
    this.fetcher = options.fetcher ?? fetch;
  }

  async resolve(embedUrl: string): Promise<string | undefined> {
    let url: URL;
    try {
      url = new URL(embedUrl);
    } catch {
      return undefined;
    }
    if (url.protocol !== 'https:' || !this.allowedHosts.has(url.hostname.toLowerCase())) {
      return undefined;
    }

    try {
      const response = await this.fetcher(url, {
        headers: { 'User-Agent': 'Nguonc-Stremio-Addon/1.0' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) return undefined;
      return extractMediaUrl(await response.text());
    } catch {
      return undefined;
    }
  }
}

function extractMediaUrl(html: string): string | undefined {
  const patterns = [
    /<source[^>]+src=["']([^"']+\.(?:m3u8|mp4)(?:\?[^"']*)?)["']/i,
    /(?:file|src)\s*[:=]\s*["']([^"']+\.(?:m3u8|mp4)(?:\?[^"']*)?)["']/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern)?.[1];
    if (!match) continue;
    try {
      const url = new URL(match);
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString();
    } catch {
      // Continue to the next known player pattern.
    }
  }
  return undefined;
}
