import { Controller, Get, Header } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('robots.txt')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  robots(): string {
    return 'User-agent: *\nDisallow: /\n';
  }
}
