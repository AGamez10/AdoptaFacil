import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Env } from '../../config/env.validation';
import { maskEmail } from './mask-email';
import { NotificationMessage, NotificationPort } from './notification.port';

/** Minimal transport surface we depend on (so tests can inject a fake). */
export interface MailTransport {
  sendMail(options: {
    from: string | { name: string; address: string };
    replyTo?: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
    headers?: Record<string, string>;
    attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
  }): Promise<unknown>;
}

/** Factory for the transport; defaults to nodemailer, overridable in tests. */
export type MailTransportFactory = (options: {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
  pool?: boolean;
  maxConnections?: number;
}) => MailTransport;

/**
 * Real SMTP NotificationPort (T-109). Credentials come EXCLUSIVELY from env
 * (SMTP_HOST/PORT/USER/PASS/FROM) — never hardcoded. Selected when
 * NOTIFICATION_DRIVER=smtp; the log stub stays the default. A failed send
 * THROWS so the email delivery queue can retry it with backoff; callers never
 * see it, because modules send through the queue, never through this adapter
 * directly. NEVER logs the body or credentials (Ley 1581) — at most the
 * masked recipient + result. Swapping to SendGrid/SES later = new adapter + one line in
 * NotificationModule; consumers (auth, reminders) are untouched.
 */
@Injectable()
export class SmtpNotificationAdapter implements NotificationPort {
  private readonly logger = new Logger('NotificationPort');
  private readonly from: string;
  private readonly fromAddress: string;
  private readonly transport: MailTransport;

  constructor(
    config: ConfigService<Env, true>,
    createTransport: MailTransportFactory = nodemailer.createTransport,
  ) {
    // Non-null: env validation (fail-fast) guarantees these when driver=smtp.
    const host = config.get('SMTP_HOST', { infer: true }) as string;
    const port = config.get('SMTP_PORT', { infer: true }) as number;
    const user = config.get('SMTP_USER', { infer: true }) as string;
    const pass = config.get('SMTP_PASS', { infer: true }) as string;
    this.from = config.get('SMTP_FROM', { infer: true }) as string;
    // `"AdoptaFácil" <no-reply@adoptafacil.org>` or a bare address: a branded
    // email keeps this ADDRESS (no SPF/DKIM per organization) and only changes
    // the display name.
    this.fromAddress = /<([^>]+)>/.exec(this.from)?.[1]?.trim() ?? this.from.trim();
    this.transport = createTransport({
      host,
      port,
      secure: port === 465, // implicit TLS on 465; STARTTLS otherwise
      auth: { user, pass },
      // Reuse SMTP connections across queued sends (one per worker slot).
      pool: true,
      maxConnections: config.get('EMAIL_QUEUE_CONCURRENCY', { infer: true }) ?? 5,
    });
  }

  async send(message: NotificationMessage): Promise<void> {
    try {
      await this.transport.sendMail({
        from: message.fromName ? { name: message.fromName, address: this.fromAddress } : this.from,
        ...(message.replyTo ? { replyTo: message.replyTo } : {}),
        to: message.to,
        subject: message.subject,
        text: message.body,
        // Additive: only sent when the template layer produced them.
        ...(message.html ? { html: message.html } : {}),
        ...(message.headers ? { headers: message.headers } : {}),
        ...(message.attachments?.length ? { attachments: message.attachments } : {}),
      });
      // Masked recipient + result only — never subject/body/credentials.
      this.logger.log(`email to=${maskEmail(message.to)} result=ok`);
    } catch (error) {
      // Never the body/creds. Rethrown so the delivery queue retries it (or
      // gives up on a permanent SMTP 5xx); the queue keeps callers safe.
      this.logger.warn(
        `email to=${maskEmail(message.to)} result=failed (${(error as Error).message})`,
      );
      throw error;
    }
  }
}
