import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { HomepageController } from './homepage.controller.js';
import { HlsModule } from './hls/hls.module.js';
import { NguoncModule } from './nguonc/nguonc.module.js';
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
  providers: [],
})
export class AppModule {}
