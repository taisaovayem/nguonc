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

  it('serves the search interface at the root route', async () => {
    const home = await app.inject({ method: 'GET', url: '/' });

    expect(home.statusCode).toBe(200);
    expect(home.headers['content-type']).toContain('text/html');
    expect(home.headers['x-robots-tag']).toBe('noindex, nofollow, noarchive, nosnippet');
    expect(home.body).toContain('<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">');
    expect(home.body).toContain('<form id="search-form">');
    expect(home.body).toContain('<input id="query" name="query" type="search"');
    expect(home.body).toContain('<button type="submit">Tìm</button>');
    expect(home.body).toContain('<p id="status" role="status" aria-live="polite"></p>');
    expect(home.body).toContain('<section id="content" aria-live="polite"></section>');
    expect(home.body).toContain('Sao chép');
  });

  it('tells compliant crawlers not to crawl or index the addon', async () => {
    const robots = await app.inject({ method: 'GET', url: '/robots.txt' });

    expect(robots.statusCode).toBe(200);
    expect(robots.headers['content-type']).toContain('text/plain');
    expect(robots.headers['x-robots-tag']).toBe('noindex, nofollow, noarchive, nosnippet');
    expect(robots.body).toBe('User-agent: *\nDisallow: /\n');

    const manifest = await app.inject({ method: 'GET', url: '/manifest.json' });
    expect(manifest.headers['x-robots-tag']).toBe('noindex, nofollow, noarchive, nosnippet');
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
