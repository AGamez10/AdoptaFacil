import { Global, Module } from '@nestjs/common';
import { PublicCacheInterceptor } from './public-cache.interceptor';
import { PublicCacheService } from './public-cache.service';

@Global()
@Module({
  providers: [PublicCacheService, PublicCacheInterceptor],
  exports: [PublicCacheService, PublicCacheInterceptor],
})
export class PublicCacheModule {}
