import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { AuthModule } from '../auth/auth.module';
import type { Env } from '../../config/env.validation';
import { DiskStorageAdapter } from './disk-storage.adapter';
import { LocalStubStorageAdapter } from './local-stub-storage.adapter';
import { S3StorageAdapter } from './s3-storage.adapter';
import { StorageController } from './storage.controller';
import { STORAGE_PORT } from './storage.port';
import { RedisUsageCache } from './usage-cache';
import { REDIS_CLIENT } from '../../redis/redis.service';

/**
 * Shared StoragePort provider (T-107) + real disk adapter (T-108). Global so any
 * module injects STORAGE_PORT without re-binding it. The adapter is chosen by
 * STORAGE_DRIVER: `disk` (real filesystem, prod), `s3` (an S3-compatible bucket
 * such as Cloudflare R2) or `stub` (in-memory, tests).
 * Swapping to S3/GCS later = add an S3Adapter and one line in this factory — no
 * change to org/animals. The StorageController serves bytes with access control.
 */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [StorageController],
  providers: [
    {
      provide: STORAGE_PORT,
      inject: [ConfigService, REDIS_CLIENT],
      useFactory: (config: ConfigService<Env, true>, redis: Redis) => {
        const driver = config.get('STORAGE_DRIVER', { infer: true });
        // Plan de escala (B3): the quota total is shared by every replica.
        const usage = new RedisUsageCache(redis);
        if (driver === 'disk') return new DiskStorageAdapter(config, usage);
        if (driver === 's3') return new S3StorageAdapter(config, fetch, () => new Date(), usage);
        return new LocalStubStorageAdapter();
      },
    },
  ],
  exports: [STORAGE_PORT],
})
export class StorageModule {}
