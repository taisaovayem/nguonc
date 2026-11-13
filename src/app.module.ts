import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { HomepageController } from './homepage.controller.js';
import { HlsModule } from './hls/hls.module.js';
import { NguoncModule } from './nguonc/nguonc.module.js';
import { NoIndexInterceptor } from './no-index.interceptor.js';
import { StremioModule } from './stremio/stremio.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CacheModule.register({ isGlobal: true }),
    NguoncModule,
    HlsModule,
    StremioModule,
  ],
  controllers: [AppController, HomepageController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: NoIndexInterceptor,
    },
  ],
})
export class AppModule {}
