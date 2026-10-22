import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../app.module.js';

describe('StremioController', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves health and the Stremio manifest through Fastify with CORS', async () => {
    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: 'ok' });

    const manifest = await app.inject({
      method: 'GET',
      url: '/manifest.json',
      headers: { origin: 'http://player.example' },
    });
    expect(manifest.statusCode).toBe(200);
    expect(manifest.headers['access-control-allow-origin']).toBe('*');
    expect(manifest.json()).toMatchObject({
      id: 'com.nguonc.stremio',
      resources: ['catalog', 'meta', 'stream'],
    });
  });
});
