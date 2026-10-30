import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UnrecoverableError, Worker, type Job } from 'bullmq';
import { parseRedisUrl, type Env } from '../../../config/env.validation';
import { runsQueueWorkers } from '../../../config/app-role';
import type { NotificationPort } from '../notification.port';
import {
  EMAIL_DELIVERY_QUEUE,
  fromJobData,
  isPermanentEmailError,
  type EmailDeliveryJobData,
} from './email-delivery.job';

/** The template layer + transport that actually renders and sends (not the queue). */
export const EMAIL_DELIVERY = Symbol('EMAIL_DELIVERY');

/**
 * BullMQ worker of the email queue. Concurrency and the provider rate limit
 * come from env (EMAIL_QUEUE_*), so throughput is tuned per deploy, and more
 * API replicas simply add workers on the same queue.
 *
 * A transient failure (timeout, 4xx, network) throws, so BullMQ retries with
 * backoff; a permanent one (SMTP 5xx: unknown mailbox, refused) is marked
 * unrecoverable and not retried. Logs carry the job id and event only, never
 * the address or the content (Ley 1581).
 */
@Injectable()
export class EmailDeliveryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('EmailQueue');
  private worker?: Worker<EmailDeliveryJobData>;

  constructor(
    private readonly config: ConfigService<Env, true>,
    @Inject(EMAIL_DELIVERY) private readonly delivery: NotificationPort,
  ) {}

  onModuleInit(): void {
    // Plan de escala (B7): in the `api` role the e-mail queue is only produced.
    if (!runsQueueWorkers()) return;
    this.worker = new Worker<EmailDeliveryJobData>(
      EMAIL_DELIVERY_QUEUE,
      (job) => this.process(job),
      {
        connection: parseRedisUrl(this.config.get('REDIS_URL', { infer: true })),
        concurrency: this.config.get('EMAIL_QUEUE_CONCURRENCY', { infer: true }),
        limiter: {
          max: this.config.get('EMAIL_QUEUE_RATE_MAX', { infer: true }),
          duration: this.config.get('EMAIL_QUEUE_RATE_DURATION_MS', { infer: true }),
        },
      },
    );
    this.worker.on('failed', (job, error) => {
      const final =
        !job || job.attemptsMade >= (job.opts.attempts ?? 1) || error instanceof UnrecoverableError;
      this.logger.warn(
        `email job=${job?.id ?? '?'} event=${job?.name ?? '?'} attempt=${job?.attemptsMade ?? 0} ${final ? 'FAILED for good' : 'will retry'} (${error.message})`,
      );
    });
    this.worker.on('error', (error) => this.logger.warn(`email worker error: ${error.message}`));
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  async process(job: Job<EmailDeliveryJobData>): Promise<void> {
    try {
      await this.delivery.send(fromJobData(job.data));
    } catch (error) {
      if (isPermanentEmailError(error)) {
        throw new UnrecoverableError((error as Error).message);
      }
      throw error;
    }
  }
}
