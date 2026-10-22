import { Module } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { HlsModule } from '../hls/hls.module.js';
import { NguoncAddonService } from './addon.service.js';
import { EmbedResolverService } from './embed-resolver.service.js';
import { NguoncClientService } from './nguonc-client.service.js';

@Module({
  imports: [HlsModule],
  providers: [
    NguoncClientService,
    EmbedResolverService,
    {
      provide: NguoncAddonService,
      inject: [NguoncClientService, EmbedResolverService, CACHE_MANAGER, ConfigService],
      useFactory: (client, resolver, cache, config) => new NguoncAddonService(client, resolver, cache, {
        catalogTtlMs: numberSetting(config, 'CATALOG_CACHE_TTL_MS', 5 * 60_000),
        detailTtlMs: numberSetting(config, 'DETAIL_CACHE_TTL_MS', 15 * 60_000),
        streamTtlMs: numberSetting(config, 'STREAM_CACHE_TTL_MS', 15 * 60_000),
      }),
    },
  ],
  exports: [NguoncAddonService],
})
export class NguoncModule {}

function numberSetting(config: ConfigService, name: string, fallback: number): number {
  const value = Number(config.get<string>(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
