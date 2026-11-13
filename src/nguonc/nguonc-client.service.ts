import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NguoncClient } from './nguonc.client.js';

@Injectable()
export class NguoncClientService extends NguoncClient {
  constructor(config: ConfigService) {
    super({
      baseUrl: config.get<string>('NGUONC_API_BASE_URL') ?? 'https://phim.nguonc.com/api/',
      timeoutMs: numberSetting(config, 'REQUEST_TIMEOUT_MS', 8_000),
    });
  }
}

function numberSetting(config: ConfigService, name: string, fallback: number): number {
  const value = Number(config.get<string>(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
