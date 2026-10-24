import { Logger } from '@nestjs/common';
import type { JobsOptions, Queue } from 'bullmq';
import type { NotificationMessage, NotificationPort } from '../notification.port';
import {
  EMAIL_BACKOFF_MS,
  EMAIL_DEDUPE_TTL_MS,
  EMAIL_FAILED_RETENTION_S,
  dedupeId,
  toJobData,
  type EmailDeliveryJobData,
} from './email-delivery.job';

/** If Redis doesn't take the job within this time, the email is sent inline. */
const ENQUEUE_TIMEOUT_MS = 3_000;

/**
 * The NotificationPort every module injects. `send()` only ENQUEUES the email
 * (one Redis write) and returns; a worker renders and delivers it
 * (`EmailDeliveryWorker`). So a request never waits on SMTP, a burst of
 * thousands of emails can't block the API, and a failed send is retried with
 * backoff instead of being lost.
 *
 *  - `idempotencyKey` → BullMQ deduplication: the same key enqueued again
 *    within 7 days is ignored (a repeated webhook can't email twice).
 *  - Done jobs are removed at once; failed ones after 7 days (their content
 *    lives in Redis only while it's useful).
 *  - Redis unreachable → the email is delivered inline (best-effort), so a
 *    password reset is never lost to a queue outage.
 */
export class QueuedNotificationPort implements NotificationPort {
  private readonly logger = new Logger('EmailQueue');

  constructor(
    private readonly queue: Queue<EmailDeliveryJobData>,
    private readonly inline: NotificationPort,
    private readonly attempts: number,
  ) {}

  async send(message: NotificationMessage): Promise<void> {
    const opts: JobsOptions = {
      attempts: this.attempts,
      backoff: { type: 'exponential', delay: EMAIL_BACKOFF_MS },
      removeOnComplete: true,
      removeOnFail: { age: EMAIL_FAILED_RETENTION_S },
      ...(message.idempotencyKey
        ? { deduplication: { id: dedupeId(message.idempotencyKey), ttl: EMAIL_DEDUPE_TTL_MS } }
        : {}),
    };
    const event = message.template?.event ?? 'plain';
    try {
      await withTimeout(this.queue.add(event, toJobData(message), opts), ENQUEUE_TIMEOUT_MS);
    } catch (error) {
      this.logger.warn(
        `email event=${event} could not be queued, sending inline (${(error as Error).message})`,
      );
      try {
        await this.inline.send(message);
      } catch (inlineError) {
        this.logger.warn(
          `email event=${event} inline send failed (${(inlineError as Error).message})`,
        );
      }
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`queue did not answer in ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
