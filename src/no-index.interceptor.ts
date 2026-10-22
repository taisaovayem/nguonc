import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { Observable } from 'rxjs';

export const ROBOTS_TAG = 'noindex, nofollow, noarchive, nosnippet';

@Injectable()
export class NoIndexInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      context.switchToHttp().getResponse<FastifyReply>().header('X-Robots-Tag', ROBOTS_TAG);
    }
    return next.handle();
  }
}
