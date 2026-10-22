import { Module } from '@nestjs/common';
import { HlsController } from './hls.controller.js';
import { HlsProxyService } from './hls-proxy.service.js';

@Module({
  controllers: [HlsController],
  providers: [HlsProxyService],
  exports: [HlsProxyService],
})
export class HlsModule {}
