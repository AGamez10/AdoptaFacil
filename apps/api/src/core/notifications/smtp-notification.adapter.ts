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
  requireTLS?: boolean;
  auth?: { user: string; pass: string };
  dkim?: { domainName: string; keySelector: string; privateKey: string };
  pool?: boolean;
  maxConnections?: number;
}) => MailTransport;

/** Lo que el adaptador y `pnpm mail:test` necesitan para armar el transporte. */
export interface SmtpEnv {
  SMTP_HOST?: string;
  SMTP_PORT?: number | string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_DKIM_DOMAIN?: string;
  SMTP_DKIM_SELECTOR?: string;
  SMTP_DKIM_PRIVATE_KEY?: string;
}

/**
 * Opciones de nodemailer a partir del entorno, compartidas por la API y por
 * `pnpm mail:test` para que la prueba use exactamente la misma conexión.
 * - 465: TLS implícito. 587: STARTTLS OBLIGATORIO (sin él la contraseña podría
 *   viajar en claro si alguien quita el STARTTLS en el camino). Otro puerto
 *   (relay interno, 25): STARTTLS si el servidor lo ofrece.
 * - Sin SMTP_USER/SMTP_PASS no hay AUTH (solo un relay propio en la red de Docker).
 * - Con SMTP_DKIM_* la API firma cada correo con la clave del dominio.
 */
export function smtpTransportOptions(env: SmtpEnv): Parameters<MailTransportFactory>[0] {
  const port = Number(env.SMTP_PORT);
  return {
    host: env.SMTP_HOST as string,
    port,
    secure: port === 465,
    ...(port === 587 ? { requireTLS: true } : {}),
    ...(env.SMTP_USER && env.SMTP_PASS
      ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }
      : {}),
    ...(env.SMTP_DKIM_DOMAIN && env.SMTP_DKIM_SELECTOR && env.SMTP_DKIM_PRIVATE_KEY
      ? {
          dkim: {
            domainName: env.SMTP_DKIM_DOMAIN,
            keySelector: env.SMTP_DKIM_SELECTOR,
            // En un .env la clave PEM va en una línea con los saltos como \n.
            privateKey: env.SMTP_DKIM_PRIVATE_KEY.replace(/\\n/g, '\n'),
          },
        }
      : {}),
  };
}

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
    // Env validation (fail-fast) guarantees host/port/from when driver=smtp.
    const env = (key: keyof SmtpEnv) => config.get(key as keyof Env, { infer: true }) as never;
    this.from = config.get('SMTP_FROM', { infer: true }) as string;
    // `"AdoptaFácil" <no-reply@adoptafacil.org>` or a bare address: a branded
    // email keeps this ADDRESS (no SPF/DKIM per organization) and only changes
    // the display name.
    this.fromAddress = /<([^>]+)>/.exec(this.from)?.[1]?.trim() ?? this.from.trim();
    this.transport = createTransport({
      ...smtpTransportOptions({
        SMTP_HOST: env('SMTP_HOST'),
        SMTP_PORT: env('SMTP_PORT'),
        SMTP_USER: env('SMTP_USER'),
        SMTP_PASS: env('SMTP_PASS'),
        SMTP_DKIM_DOMAIN: env('SMTP_DKIM_DOMAIN'),
        SMTP_DKIM_SELECTOR: env('SMTP_DKIM_SELECTOR'),
        SMTP_DKIM_PRIVATE_KEY: env('SMTP_DKIM_PRIVATE_KEY'),
      }),
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
