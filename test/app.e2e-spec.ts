import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createRequire } from 'node:module';
import { AppModule } from './../src/app.module.js';
import { createAddonInterface } from './../src/stremio-addon.factory.js';

const require = createRequire(import.meta.url);
const { getRouter } = require('stremio-addon-sdk') as { getRouter: (addon: unknown) => unknown };

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    const addon = createAddonInterface({
      catalog: async () => [{ id: 'nguonc:demo', type: 'movie', name: 'Demo' }],
      meta: async () => ({ id: 'nguonc:demo', type: 'movie', name: 'Demo' }),
      streams: async () => [],
    });
    (app.getHttpAdapter().getInstance() as { use(router: unknown): void }).use(getRouter(addon));
    await app.init();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('/manifest.json (GET) exposes an installable Stremio manifest', () => {
    return request(app.getHttpServer())
      .get('/manifest.json')
      .expect(200)
      .expect((response) => expect(response.body.id).toBe('com.nguonc.stremio'));
  });

  it('/catalog/movie/nguonc-latest.json (GET) exposes catalog metas', () => {
    return request(app.getHttpServer())
      .get('/catalog/movie/nguonc-latest.json')
      .expect(200)
      .expect((response) => expect(response.body.metas).toEqual([{ id: 'nguonc:demo', type: 'movie', name: 'Demo' }]));
  });

  afterEach(async () => {
    await app.close();
  });
});
