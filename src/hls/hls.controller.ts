import { Controller, Get, HttpStatus, Logger, Param, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { HlsProxyService } from './hls-proxy.service.js';

@Controller('hls')
export class HlsController {
  private readonly logger = new Logger(HlsController.name);

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
    const startedAt = Date.now();
    try {
      const range = typeof request.headers.range === 'string' ? request.headers.range : undefined;
      const resource = await this.proxy.getResource(sessionId, resourceId, range);
      if (resource.unavailable) {
        this.logger.warn(this.requestSummary(sessionId, resourceId, range, startedAt, `unavailable=${resource.unavailable}`));
        return reply.code(HttpStatus.NOT_FOUND).send();
      }
      if (resource.status >= HttpStatus.BAD_REQUEST) {
        this.logger.warn(this.requestSummary(sessionId, resourceId, range, startedAt, `status=${resource.status}`));
      }
      if (resource.contentType) reply.header('Content-Type', resource.contentType);
      if (resource.contentRange) reply.header('Content-Range', resource.contentRange);
      if (resource.contentLength) reply.header('Content-Length', resource.contentLength);
      return reply.code(resource.status).send(Buffer.from(resource.body));
    } catch (error) {
      const cause = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      this.logger.error(this.requestSummary(sessionId, resourceId, typeof request.headers.range === 'string' ? request.headers.range : undefined, startedAt, cause));
      return reply.code(HttpStatus.BAD_GATEWAY).send();
    }
  }

  private requestSummary(sessionId: string, resourceId: string, range: string | undefined, startedAt: number, outcome: string): string {
    return `HLS resource session=${sessionId} resource=${resourceId} range=${range ?? '-'} durationMs=${Date.now() - startedAt} ${outcome}`;
  }
}
