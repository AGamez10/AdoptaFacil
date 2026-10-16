import { createHash } from 'node:crypto';
import type { NotificationMessage } from '../notification.port';

/** BullMQ queue that carries every outbound email (one job = one recipient). */
export const EMAIL_DELIVERY_QUEUE = 'email-delivery';

/** How long a repeated `idempotencyKey` is ignored after the first enqueue. */
export const EMAIL_DEDUPE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** First retry after 30 s, then 1, 2, 4, 8 min… (BullMQ exponential backoff). */
export const EMAIL_BACKOFF_MS = 30_000;

/** Failed jobs (and their content) are dropped from Redis after this long. */
export const EMAIL_FAILED_RETENTION_S = 7 * 24 * 60 * 60;

/**
 * Job payload. JSON-safe copy of a NotificationMessage: attachment buffers
 * travel as base64. The idempotency key never travels (only its hash is used
 * as the BullMQ deduplication id).
 */
export interface EmailDeliveryJobData {
  to: string;
  subject: string;
  body: string;
  html?: string;
  headers?: Record<string, string>;
  template?: NotificationMessage['template'];
  attachments?: Array<{ filename: string; contentBase64: string; contentType: string }>;
}

export function toJobData(message: NotificationMessage): EmailDeliveryJobData {
  const { attachments, idempotencyKey: _key, ...rest } = message;
  return {
    ...rest,
    ...(attachments?.length
      ? {
          attachments: attachments.map((a) => ({
            filename: a.filename,
            contentType: a.contentType,
            contentBase64: a.content.toString('base64'),
          })),
        }
      : {}),
  };
}

export function fromJobData(data: EmailDeliveryJobData): NotificationMessage {
  const { attachments, ...rest } = data;
  return {
    ...rest,
    ...(attachments?.length
      ? {
          attachments: attachments.map((a) => ({
            filename: a.filename,
            contentType: a.contentType,
            content: Buffer.from(a.contentBase64, 'base64'),
          })),
        }
      : {}),
  };
}

/** Deduplication id: a hash, so the raw key (which may name a person) isn't stored. */
export function dedupeId(idempotencyKey: string): string {
  return createHash('sha256').update(idempotencyKey).digest('hex');
}

/**
 * SMTP answers 5xx for problems a retry won't fix (unknown mailbox, rejected
 * sender, message refused). Everything else (timeouts, 4xx, connection
 * resets) is worth retrying.
 */
export function isPermanentEmailError(error: unknown): boolean {
  const e = error as { responseCode?: number; code?: string };
  if (typeof e?.responseCode === 'number') return e.responseCode >= 500 && e.responseCode < 600;
  return e?.code === 'EENVELOPE';
}
