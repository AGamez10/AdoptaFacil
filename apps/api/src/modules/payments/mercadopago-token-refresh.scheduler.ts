import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { Env } from '../../config/env.validation';
import {
  MERCADOPAGO_TOKEN_REFRESH_JOB,
  MERCADOPAGO_TOKEN_REFRESH_QUEUE,
} from './mercadopago-connect.constants';

/**
 * Registers the repeatable Mercado Pago token-renewal scan (ADR-PAG-003).
 * Only with PAYMENT_DRIVER=mercadopago; skipped under NODE_ENV=test
 * (integration tests drive the service directly); a missing Redis never
 * blocks boot. BullMQ dedups the repeatable entry, so re-adding is safe.
 */
@Injectable()
export class MercadoPagoTokenRefreshScheduler implements OnModuleInit {
  private readonly logger = new Logger(MercadoPagoTokenRefreshScheduler.name);

  constructor(
    @InjectQueue(MERCADOPAGO_TOKEN_REFRESH_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    if (this.config.get('PAYMENT_DRIVER', { infer: true }) !== 'mercadopago') return;
    const every = this.config.get('MERCADOPAGO_TOKEN_REFRESH_SCAN_INTERVAL_MS', { infer: true });
    try {
      await this.queue.add(
        MERCADOPAGO_TOKEN_REFRESH_JOB,
        {},
        { repeat: { every }, removeOnComplete: true, removeOnFail: true },
      );
      this.logger.log(`mercadopago-token-refresh scan scheduled every ${every}ms`);
    } catch (error) {
      this.logger.warn(
        `Could not schedule mercadopago-token-refresh scan: ${(error as Error).message}`,
      );
    }
  }
}
