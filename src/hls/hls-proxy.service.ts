import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HlsProxy } from '../nguonc/hls-proxy.js';
import { publicBaseUrlSetting } from '../runtime-config.js';

@Injectable()
export class HlsProxyService extends HlsProxy {
  constructor(config: ConfigService) {
    super({
      publicBaseUrl: publicBaseUrlSetting(config),
      timeoutMs: numberSetting(config, 'REQUEST_TIMEOUT_MS', 8_000),
      prefetchSegments: numberSetting(config, 'HLS_PREFETCH_SEGMENTS', 15),
      cacheMaxBytes: numberSetting(config, 'HLS_PREFETCH_CACHE_BYTES', 1024 * 1024 * 1024),
      cacheIdleTtlMs: numberSetting(config, 'HLS_CACHE_IDLE_TTL_MS', 30 * 60_000),
    });
  }
}

function numberSetting(config: ConfigService, name: string, fallback: number): number {
  const value = Number(config.get<string>(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
