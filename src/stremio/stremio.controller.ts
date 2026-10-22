import { Controller, Get, Header, Param, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { NguoncAddonService } from '../nguonc/addon.service.js';

@Controller()
export class StremioController {
  constructor(private readonly addon: NguoncAddonService) {}

  @Get('manifest.json')
  @Header('Access-Control-Allow-Origin', '*')
  manifest() {
    return {
      id: 'com.nguonc.stremio',
      version: '1.0.0',
      name: 'NguồnC',
      description: 'Catalog và stream từ NguồnC cho người dùng được phép.',
      resources: ['catalog', 'meta', 'stream'],
      types: ['movie', 'series'],
      idPrefixes: ['nguonc:'],
      catalogs: ['movie', 'series'].map((type) => ({
        type,
        id: 'nguonc-latest',
        name: 'NguồnC • Mới cập nhật',
        extra: [
          { name: 'search', isRequired: false },
          { name: 'skip', isRequired: false },
        ],
      })),
      behaviorHints: { configurable: false },
    };
  }

  @Get('catalog/:type/:catalogId.json')
  async catalog(
    @Param('type') type: string,
    @Param('catalogId') catalogId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.catalogResponse(type, catalogId, undefined, reply);
  }

  @Get('catalog/:type/:catalogId/:extra.json')
  async catalogWithExtra(
    @Param('type') type: string,
    @Param('catalogId') catalogId: string,
    @Param('extra') extra: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.catalogResponse(type, catalogId, extra, reply);
  }

  @Get('meta/:type/:id.json')
  async meta(@Param('type') type: string, @Param('id') id: string, @Res({ passthrough: true }) reply: FastifyReply) {
    if (!validType(type)) return this.envelope(reply, 30, { meta: undefined });
    try {
      return this.envelope(reply, 900, { meta: await this.addon.meta(type, id) });
    } catch {
      return this.envelope(reply, 30, { meta: undefined });
    }
  }

  @Get('stream/:type/:id.json')
  async stream(@Param('type') type: string, @Param('id') id: string, @Res({ passthrough: true }) reply: FastifyReply) {
    if (!validType(type)) return this.envelope(reply, 30, { streams: [] });
    try {
      return this.envelope(reply, 900, { streams: await this.addon.streams(type, id) });
    } catch {
      return this.envelope(reply, 30, { streams: [] });
    }
  }

  private async catalogResponse(type: string, catalogId: string, extra: string | undefined, reply: FastifyReply) {
    if (!validType(type) || catalogId !== 'nguonc-latest') return this.envelope(reply, 30, { metas: [] });
    const values = new URLSearchParams(extra);
    try {
      return this.envelope(reply, 300, { metas: await this.addon.catalog(type, values.get('search') ?? undefined, Number(values.get('skip')) || 0) });
    } catch {
      return this.envelope(reply, 30, { metas: [] });
    }
  }

  private envelope(reply: FastifyReply, cacheMaxAge: number, value: object) {
    reply.header('Cache-Control', `public, max-age=${cacheMaxAge}`);
    return { ...value, cacheMaxAge };
  }
}

function validType(value: string): value is 'movie' | 'series' {
  return value === 'movie' || value === 'series';
}
