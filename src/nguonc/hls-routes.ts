import type { Express } from 'express';
import { HlsProxy } from './hls-proxy.js';

export function registerHlsRoutes(app: Express, proxy: HlsProxy): void {
  app.get('/hls/:sessionId/:playlistName.m3u8', (request, response) => {
    const playlist = proxy.getRootPlaylist(request.params.sessionId);
    if (!playlist) {
      response.sendStatus(404);
      return;
    }

    response.type('application/vnd.apple.mpegurl').send(playlist);
  });

  app.get('/hls/:sessionId/resource/:resourceId', async (request, response) => {
    try {
      const resource = await proxy.getResource(
        request.params.sessionId,
        request.params.resourceId,
        typeof request.headers.range === 'string' ? request.headers.range : undefined,
      );
      if (!resource) {
        response.sendStatus(404);
        return;
      }

      if (resource.contentType) response.setHeader('Content-Type', resource.contentType);
      if (resource.contentRange) response.setHeader('Content-Range', resource.contentRange);
      if (resource.contentLength) response.setHeader('Content-Length', resource.contentLength);
      response.status(resource.status).send(Buffer.from(resource.body));
    } catch {
      response.sendStatus(502);
    }
  });
}
