import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { Env } from '../../config/env.validation';
import {
  PAYMENT_RECONCILE_DAILY_JOB,
  PAYMENT_RECONCILE_PENDING_JOB,
  PAYMENT_RECONCILE_QUEUE,
} from './payment-reconciliation.constants';

/**
 * Registers the two repeatable reconciliation passes. Only with
 * PAYMENT_DRIVER=mercadopago; skipped under NODE_ENV=test (integration tests
 * drive the service directly); a missing Redis never blocks boot. BullMQ
 * dedups repeatable entries, so re-adding on every boot is safe.
 */
@Injectable()
export class PaymentReconciliationScheduler implements OnModuleInit {
  private readonly logger = new Logger(PaymentReconciliationScheduler.name);

  constructor(
    @InjectQueue(PAYMENT_RECONCILE_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    if (this.config.get('PAYMENT_DRIVER', { infer: true }) !== 'mercadopago') return;
    const every = this.config.get('PAYMENT_RECONCILE_INTERVAL_MS', { infer: true });
    try {
      const opts = { removeOnComplete: true, removeOnFail: true };
      await this.queue.add(PAYMENT_RECONCILE_PENDING_JOB, {}, { ...opts, repeat: { every } });
      await this.queue.add(
        PAYMENT_RECONCILE_DAILY_JOB,
        {},
        { ...opts, repeat: { every: 86_400_000 } },
      );
      this.logger.log(`payment-reconcile scheduled (pending every ${every}ms, full daily)`);
    } catch (error) {
      this.logger.warn(`Could not schedule payment-reconcile: ${(error as Error).message}`);
    }
  }
}
