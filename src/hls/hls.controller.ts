import { Controller, Get, HttpStatus, Param, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { HlsProxyService } from './hls-proxy.service.js';

@Controller('hls')
export class HlsController {
  constructor(private readonly proxy: HlsProxyService) {}

  @Get(':sessionId/:playlistName.m3u8')
  playlist(@Param('sessionId') sessionId: string, @Res() reply: FastifyReply): FastifyReply {
    const playlist = this.proxy.getRootPlaylist(sessionId);
    return playlist
      ? reply.type('application/vnd.apple.mpegurl').send(playlist)
      : reply.code(HttpStatus.NOT_FOUND).send();
  }

  @Get(':sessionId/resource/:resourceId')
  async resource(
    @Param('sessionId') sessionId: string,
    @Param('resourceId') resourceId: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<FastifyReply> {
    try {
      const range = typeof request.headers.range === 'string' ? request.headers.range : undefined;
      const resource = await this.proxy.getResource(sessionId, resourceId, range);
      if (!resource) return reply.code(HttpStatus.NOT_FOUND).send();
      if (resource.contentType) reply.header('Content-Type', resource.contentType);
      if (resource.contentRange) reply.header('Content-Range', resource.contentRange);
      if (resource.contentLength) reply.header('Content-Length', resource.contentLength);
      return reply.code(resource.status).send(Buffer.from(resource.body));
    } catch {
      return reply.code(HttpStatus.BAD_GATEWAY).send();
    }
  }
}
