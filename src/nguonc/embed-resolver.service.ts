import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HlsProxyService } from '../hls/hls-proxy.service.js';
import { EmbedResolver } from './embed-resolver.js';

@Injectable()
export class EmbedResolverService extends EmbedResolver {
  constructor(config: ConfigService, hlsProxy: HlsProxyService) {
    super({
      playlistPublisher: hlsProxy,
      timeoutMs: numberSetting(config, 'REQUEST_TIMEOUT_MS', 8_000),
    });
  }
}

function numberSetting(config: ConfigService, name: string, fallback: number): number {
  const value = Number(config.get<string>(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
