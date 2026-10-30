import { UseInterceptors } from '@nestjs/common';
import { PublicCacheInterceptor } from './public-cache.interceptor';

/**
 * Plan de escala (B5): cache an ANONYMOUS public GET (Redis + CDN headers).
 * Only for handlers whose answer depends on the URL alone — never on a user,
 * session, cookie or header.
 */
export const PublicCache = (): MethodDecorator & ClassDecorator =>
  UseInterceptors(PublicCacheInterceptor);
