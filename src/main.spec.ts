import { expect, test, vi } from 'vitest';

const listen = vi.fn().mockResolvedValue(undefined);
const app = {
  enableCors: vi.fn(),
  get: vi.fn(() => ({ get: vi.fn() })),
  listen,
};

vi.mock('@nestjs/core', () => ({
  NestFactory: { create: vi.fn().mockResolvedValue(app) },
}));

vi.mock('@nestjs/platform-fastify', () => ({
  FastifyAdapter: vi.fn(),
}));

vi.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {},
}));

vi.mock('./app.module.js', () => ({
  AppModule: class AppModule {},
}));

test('binds the Fastify server to all IPv4 interfaces for the Docker reverse proxy', async () => {
  await import('./main.js');

  expect(listen).toHaveBeenCalledWith(3000, '0.0.0.0');
});
