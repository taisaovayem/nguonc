import { HttpStatus, Logger } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HlsController } from './hls.controller.js';
import type { HlsProxyService } from './hls-proxy.service.js';

describe('HlsController', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs the upstream status when a segment request fails', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const proxy = {
      getResource: vi.fn().mockResolvedValue({ status: 503, body: new Uint8Array() }),
    } as unknown as HlsProxyService;
    const reply = fakeReply();

    await new HlsController(proxy).resource('session', 'segment', { headers: {} } as FastifyRequest, reply);

    expect(reply.code).toHaveBeenCalledWith(503);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('status=503'));
  });

  it('logs when a playback session is unavailable', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const proxy = {
      getResource: vi.fn().mockResolvedValue({ status: 404, body: new Uint8Array(), unavailable: 'session' }),
    } as unknown as HlsProxyService;
    const reply = fakeReply();

    await new HlsController(proxy).resource('session', 'segment', { headers: {} } as FastifyRequest, reply);

    expect(reply.code).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unavailable=session'));
  });

  it('logs the error when fetching a segment times out', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const proxy = {
      getResource: vi.fn().mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError')),
    } as unknown as HlsProxyService;
    const reply = fakeReply();

    await new HlsController(proxy).resource('session', 'segment', { headers: { range: 'bytes=0-' } } as FastifyRequest, reply);

    expect(reply.code).toHaveBeenCalledWith(HttpStatus.BAD_GATEWAY);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('TimeoutError'));
  });
});

function fakeReply(): FastifyReply & { code: ReturnType<typeof vi.fn> } {
  const reply = {
    code: vi.fn(),
    send: vi.fn(),
    header: vi.fn(),
  };
  reply.code.mockReturnValue(reply);
  reply.send.mockReturnValue(reply);
  return reply as unknown as FastifyReply & { code: ReturnType<typeof vi.fn> };
}
