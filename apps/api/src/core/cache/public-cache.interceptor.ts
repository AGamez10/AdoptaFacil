import { createHash } from 'node:crypto';
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { from, of, type Observable, switchMap, tap } from 'rxjs';
import { publicCacheResults } from '../observability/metrics';
import { PublicCacheService } from './public-cache.service';

/** Seconds a CDN may keep serving a stale copy while it refreshes in the background. */
const STALE_WHILE_REVALIDATE_S = 300;

/**
 * Cache key for an anonymous public GET: path + query params in a stable order,
 * so `?a=1&b=2` and `?b=2&a=1` share an entry.
 */
export function publicCacheKey(originalUrl: string): string {
  const url = new URL(originalUrl, 'http://cache.local');
  url.searchParams.sort();
  const normalized = `${url.pathname}?${url.searchParams.toString()}`;
  return `pc:v1:${createHash('sha256').update(normalized).digest('hex')}`;
}

/**
 * Plan de escala (B5): serves an anonymous public GET from the cache Redis when
 * present, stores successful JSON bodies otherwise, and tells the CDN it may
 * keep the response for the same TTL (`s-maxage`) and serve it stale while it
 * revalidates. Only used through `@PublicCache()` on handlers that read no
 * user, cookie or header — errors (404, 400) are never cached.
 */
@Injectable()
export class PublicCacheInterceptor implements NestInterceptor {
  constructor(private readonly cache: PublicCacheService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    if (req.method !== 'GET') return next.handle();

    res.setHeader(
      'Cache-Control',
      `public, max-age=0, s-maxage=${this.cache.ttlSeconds}, stale-while-revalidate=${STALE_WHILE_REVALIDATE_S}`,
    );
    if (!this.cache.enabled) return next.handle();

    const key = publicCacheKey(req.originalUrl ?? req.url);
    return from(this.cache.get(key)).pipe(
      switchMap((hit) => {
        if (hit !== null) {
          res.setHeader('X-Cache', 'HIT');
          publicCacheResults.inc({ result: 'hit' });
          return of(JSON.parse(hit) as unknown);
        }
        res.setHeader('X-Cache', 'MISS');
        publicCacheResults.inc({ result: 'miss' });
        return next.handle().pipe(
          tap((body) => {
            if (body !== undefined && body !== null) void this.cache.set(key, JSON.stringify(body));
          }),
        );
      }),
    );
  }
}
