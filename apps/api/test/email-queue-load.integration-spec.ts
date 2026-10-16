import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import type { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { EMAIL_DELIVERY_QUEUE } from '../src/core/notifications/delivery/email-delivery.job';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../src/core/notifications/notification.port';
import { NOTIFICATION_TRANSPORT } from '../src/core/notifications/notification.module';
import { SmtpNotificationAdapter } from '../src/core/notifications/smtp-notification.adapter';
import type { Env } from '../src/config/env.validation';
import { SmtpSink } from './support/smtp-sink';

/**
 * Load test of the email queue against a sandbox SMTP server (`SmtpSink`, a
 * real SMTP conversation over TCP; nothing leaves the machine). 1,000
 * personalized bulk emails go through the real path: NotificationPort →
 * BullMQ (Redis) → worker → template layer (opt-out check in Postgres,
 * render) → nodemailer SMTP pool → sink. Prints the measured times.
 *
 * Worker settings for this run (env, read when the app boots):
 *   EMAIL_QUEUE_CONCURRENCY=20, EMAIL_QUEUE_RATE_MAX=1000 per 1000 ms.
 */
const N = 1_000;
const RUN = randomUUID().slice(0, 8);
const domain = `carga-${RUN}.test`;

jest.setTimeout(180_000);

describe('Email queue under load (1,000 recipients, sandbox SMTP)', () => {
  let app: INestApplication;
  let port: NotificationPort;
  let queue: Queue;
  const sink = new SmtpSink((rcpt) => rcpt.startsWith('rebota@'));
  const ours = () => sink.messages.filter((m) => m.to.some((t) => t.endsWith(`@${domain}`)));

  beforeAll(async () => {
    const smtpPort = await sink.start();
    process.env.EMAIL_QUEUE_CONCURRENCY = '20';
    process.env.EMAIL_QUEUE_RATE_MAX = '1000';
    process.env.EMAIL_QUEUE_RATE_DURATION_MS = '1000';
    const { AppModule } = await import('../src/app.module');
    const smtpEnv: Record<string, unknown> = {
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: smtpPort,
      SMTP_USER: 'sandbox',
      SMTP_PASS: 'sandbox',
      SMTP_FROM: 'AdoptaFácil <no-reply@adoptafacil.test>',
      EMAIL_QUEUE_CONCURRENCY: 20,
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NOTIFICATION_TRANSPORT)
      .useValue(
        new SmtpNotificationAdapter({
          get: (key: string) => smtpEnv[key],
        } as unknown as ConfigService<Env, true>),
      )
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    port = app.get<NotificationPort>(NOTIFICATION_PORT);
    queue = app.get<Queue>(getQueueToken(EMAIL_DELIVERY_QUEUE));
  });

  afterAll(async () => {
    await app?.close();
    await sink.stop();
  });

  async function waitFor(check: () => boolean, timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (!check()) {
      if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for the queue');
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  function campaignEmail(i: number) {
    return {
      to: `donante-${i}@${domain}`,
      subject: 'fallback',
      body: 'fallback',
      idempotencyKey: `load:${RUN}:${i}`,
      template: {
        event: 'community.campaign_update' as const,
        organizationName: 'Fundación Carga',
        data: {
          organizacion: 'Fundación Carga',
          nombre: `Donante${i}`,
          titulo: 'Ya casi llegamos',
          mensaje: 'Gracias por apoyar la cirugía de Max.',
        },
      },
    };
  }

  async function enqueueAll(): Promise<number> {
    const start = performance.now();
    for (let i = 0; i < N; i += 100) {
      await Promise.all(
        Array.from({ length: Math.min(100, N - i) }, (_, k) => port.send(campaignEmail(i + k))),
      );
    }
    return performance.now() - start;
  }

  it('delivers 1,000 personalized emails, each exactly once, without blocking the caller', async () => {
    const t0 = performance.now();
    const enqueueMs = await enqueueAll();
    await waitFor(() => ours().length >= N, 150_000);
    const totalMs = performance.now() - t0;

    const delivered = ours();
    const recipients = new Set(delivered.flatMap((m) => m.to));
    expect(delivered).toHaveLength(N);
    expect(recipients.size).toBe(N);
    // Personalized per recipient, branded, with its own unsubscribe link.
    const sample = delivered.find((m) => m.to[0] === `donante-417@${domain}`)!;
    expect(sample.data).toContain('Hola Donante417');
    expect(sample.data).toContain('List-Unsubscribe');
    expect(sample.data).toMatch(/text\/html/);

    console.log(
      `[email-queue-load] ${N} correos: encolar ${Math.round(enqueueMs)} ms ` +
        `(${(enqueueMs / N).toFixed(2)} ms por correo); entregados en ${Math.round(totalMs)} ms ` +
        `(${Math.round((N / totalMs) * 1000)} correos/s, concurrencia 20)`,
    );

    // Same 1,000 again (a retried request or a repeated event): deduplicated.
    const before = ours().length;
    const againMs = await enqueueAll();
    await new Promise((r) => setTimeout(r, 1500));
    expect(ours().length).toBe(before);
    console.log(
      `[email-queue-load] reenvío de los mismos ${N}: 0 duplicados (${Math.round(againMs)} ms)`,
    );
  });

  it('a permanent bounce (SMTP 550) fails at once without retries; the rest keep flowing', async () => {
    const bounce = `rebota@${domain}`;
    await port.send({ to: bounce, subject: 'x', body: 'x', idempotencyKey: `bounce:${RUN}` });
    await port.send({ to: `ok-${RUN}@${domain}`, subject: 'x', body: 'x' });
    await waitFor(() => ours().some((m) => m.to.includes(`ok-${RUN}@${domain}`)), 20_000);
    let failed: Awaited<ReturnType<Queue['getFailed']>> = [];
    for (let i = 0; i < 100 && !failed.some((j) => j.data.to === bounce); i++) {
      failed = await queue.getFailed();
      await new Promise((r) => setTimeout(r, 100));
    }
    const job = failed.find((j) => j.data.to === bounce)!;
    expect(job).toBeDefined();
    expect(job.attemptsMade).toBe(1);
    expect(job.failedReason).toContain('550');
    await job.remove();
  });
});
