import { Module } from '@nestjs/common';
import { NguoncModule } from '../nguonc/nguonc.module.js';
import { StremioController } from './stremio.controller.js';

@Module({
  imports: [NguoncModule],
  controllers: [StremioController],
})
export class StremioModule {}
