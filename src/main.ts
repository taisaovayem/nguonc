import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { createRequire } from 'node:module';
import { EmbedResolver } from './nguonc/embed-resolver.js';
import { HlsProxy } from './nguonc/hls-proxy.js';
import { registerHlsRoutes } from './nguonc/hls-routes.js';
import { NguoncAddonService } from './nguonc/addon.service.js';
import { NguoncClient } from './nguonc/nguonc.client.js';
import { createAddonInterface } from './stremio-addon.factory.js';

const require = createRequire(import.meta.url);
const { getRouter } = require('stremio-addon-sdk') as { getRouter: (addon: unknown) => unknown };

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const timeoutMs = numberSetting('REQUEST_TIMEOUT_MS', 8_000);
  const hlsProxy = new HlsProxy({
    publicBaseUrl: publicBaseUrlSetting(),
    timeoutMs,
    prefetchSegments: numberSetting('HLS_PREFETCH_SEGMENTS', 15),
    cacheMaxBytes: numberSetting('HLS_PREFETCH_CACHE_BYTES', 1024 * 1024 * 1024),
    cacheIdleTtlMs: numberSetting('HLS_CACHE_IDLE_TTL_MS', 30 * 60_000),
  });
  const resolver = new EmbedResolver({
    allowedHosts: (process.env.EMBED_ALLOWED_HOSTS ?? 'streamc.xyz').split(',').map((host) => host.trim()).filter(Boolean),
    playlistPublisher: hlsProxy,
    timeoutMs,
  });
  const client = new NguoncClient({
    baseUrl: process.env.NGUONC_API_BASE_URL ?? 'https://phim.nguonc.com/api/',
    timeoutMs,
  });
  const addon = createAddonInterface(new NguoncAddonService(client, resolver, undefined, {
    catalogTtlMs: numberSetting('CATALOG_CACHE_TTL_MS', 5 * 60_000),
    detailTtlMs: numberSetting('DETAIL_CACHE_TTL_MS', 15 * 60_000),
    streamTtlMs: numberSetting('STREAM_CACHE_TTL_MS', 15 * 60_000),
  }));
  const httpServer = app.getHttpAdapter().getInstance();
  registerHlsRoutes(httpServer, hlsProxy);
  (httpServer as { use(router: unknown): void }).use(getRouter(addon));
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

function numberSetting(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function publicBaseUrlSetting(): string {
  const value = process.env.PUBLIC_BASE_URL;
  if (!value) throw new Error('PUBLIC_BASE_URL must be configured');

  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('PUBLIC_BASE_URL must be an HTTPS origin without credentials, query, or fragment');
  }
  return url.toString();
}
