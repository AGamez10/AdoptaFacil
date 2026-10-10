import { UnrecoverableError, type Job, type Queue } from 'bullmq';
import type { NotificationMessage, NotificationPort } from '../notification.port';
import {
  dedupeId,
  fromJobData,
  isPermanentEmailError,
  toJobData,
  type EmailDeliveryJobData,
} from './email-delivery.job';
import { EmailDeliveryWorker } from './email-delivery.worker';
import { QueuedNotificationPort } from './queued-notification.port';

const message: NotificationMessage = {
  to: 'ana@example.co',
  subject: 'Hola',
  body: 'texto',
  idempotencyKey: 'donation.thanks:d-1',
  template: { event: 'donation.thanks', data: { monto: 1000 } },
  attachments: [
    { filename: 'c.pdf', contentType: 'application/pdf', content: Buffer.from('%PDF') },
  ],
};

describe('email delivery job', () => {
  it('round-trips a message through JSON (attachments as base64, no idempotency key)', () => {
    const data = JSON.parse(JSON.stringify(toJobData(message))) as EmailDeliveryJobData;
    expect(JSON.stringify(data)).not.toContain('donation.thanks:d-1');
    const back = fromJobData(data);
    expect(back.attachments?.[0].content.toString()).toBe('%PDF');
    expect(back.template).toEqual(message.template);
    expect(back.to).toBe('ana@example.co');
  });

  it('dedupe id is a hash of the key, not the key', () => {
    expect(dedupeId('donation.thanks:d-1')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('only SMTP 5xx (and envelope errors) are permanent', () => {
    expect(isPermanentEmailError({ responseCode: 550 })).toBe(true);
    expect(isPermanentEmailError({ responseCode: 421 })).toBe(false);
    expect(isPermanentEmailError({ code: 'ETIMEDOUT' })).toBe(false);
    expect(isPermanentEmailError({ code: 'EENVELOPE' })).toBe(true);
    expect(isPermanentEmailError(new Error('x'))).toBe(false);
  });
});

describe('QueuedNotificationPort', () => {
  it('enqueues with retries, cleanup and deduplication by the hashed key', async () => {
    const add = jest.fn().mockResolvedValue({});
    const inline = { send: jest.fn() };
    const port = new QueuedNotificationPort({ add } as unknown as Queue, inline, 6);
    await port.send(message);
    expect(inline.send).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledWith(
      'donation.thanks',
      expect.objectContaining({ to: 'ana@example.co' }),
      expect.objectContaining({
        attempts: 6,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: true,
        deduplication: { id: dedupeId('donation.thanks:d-1'), ttl: 7 * 24 * 60 * 60 * 1000 },
      }),
    );
  });

  it('no key → no deduplication', async () => {
    const add = jest.fn().mockResolvedValue({});
    const port = new QueuedNotificationPort({ add } as unknown as Queue, { send: jest.fn() }, 3);
    await port.send({ to: 'a@b.co', subject: 's', body: 'b' });
    expect(add.mock.calls[0][2].deduplication).toBeUndefined();
    expect(add.mock.calls[0][0]).toBe('plain');
  });

  it('Redis down → delivers inline instead of losing the email, and never throws', async () => {
    const add = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const inline = { send: jest.fn().mockRejectedValue(new Error('smtp down too')) };
    const port = new QueuedNotificationPort({ add } as unknown as Queue, inline, 6);
    await expect(port.send(message)).resolves.toBeUndefined();
    expect(inline.send).toHaveBeenCalledWith(message);
  });
});

describe('EmailDeliveryWorker.process', () => {
  function worker(delivery: NotificationPort) {
    return new EmailDeliveryWorker({ get: jest.fn() } as never, delivery);
  }
  const job = { data: toJobData(message) } as Job<EmailDeliveryJobData>;

  it('hands the decoded message to the template layer', async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    await worker({ send }).process(job);
    expect(send.mock.calls[0][0].attachments[0].content.toString()).toBe('%PDF');
  });

  it('a transient error is rethrown (BullMQ retries it)', async () => {
    const error = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
    await expect(worker({ send: jest.fn().mockRejectedValue(error) }).process(job)).rejects.toBe(
      error,
    );
  });

  it('a permanent SMTP 5xx becomes unrecoverable (no pointless retries)', async () => {
    const error = Object.assign(new Error('550 mailbox unavailable'), { responseCode: 550 });
    await expect(
      worker({ send: jest.fn().mockRejectedValue(error) }).process(job),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });
});
