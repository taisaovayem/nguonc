import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { createRequire } from 'node:module';
import { EmbedResolver } from './nguonc/embed-resolver.js';
import { NguoncAddonService } from './nguonc/addon.service.js';
import { NguoncClient } from './nguonc/nguonc.client.js';
import { createAddonInterface } from './stremio-addon.factory.js';

const require = createRequire(import.meta.url);
const { getRouter } = require('stremio-addon-sdk') as { getRouter: (addon: unknown) => unknown };

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const timeoutMs = numberSetting('REQUEST_TIMEOUT_MS', 8_000);
  const resolver = new EmbedResolver({
    allowedHosts: (process.env.EMBED_ALLOWED_HOSTS ?? 'embed.streamc.xyz').split(',').map((host) => host.trim()).filter(Boolean),
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
  (app.getHttpAdapter().getInstance() as { use(router: unknown): void }).use(getRouter(addon));
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

function numberSetting(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
