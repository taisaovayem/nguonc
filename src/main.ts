import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  app.enableCors();
  const config = app.get(ConfigService);
  await app.listen(numberSetting(config, 'PORT', 3000));
}
await bootstrap();

function numberSetting(config: ConfigService, name: string, fallback: number): number {
  const value = Number(config.get<string>(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
