import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type { Env } from '../../config/env.validation';
import { EMAIL_DELIVERY, EmailDeliveryWorker } from './delivery/email-delivery.worker';
import { EMAIL_DELIVERY_QUEUE, type EmailDeliveryJobData } from './delivery/email-delivery.job';
import { QueuedNotificationPort } from './delivery/queued-notification.port';
import { LogNotificationAdapter } from './log-notification.adapter';
import { SmtpNotificationAdapter } from './smtp-notification.adapter';
import { NOTIFICATION_PORT, type NotificationPort } from './notification.port';
import { TemplatedNotificationAdapter } from './templated-notification.adapter';
import { OrgEmailBrandingService } from './branding/org-email-branding.service';
import { EmailTemplateService } from './templates/email-template.service';

/** The raw transport (log stub or SMTP), before the template layer. */
export const NOTIFICATION_TRANSPORT = Symbol('NOTIFICATION_TRANSPORT');

/**
 * Shared NotificationPort provider (T-107) + real SMTP adapter (T-109). Global so
 * any module injects NOTIFICATION_PORT without re-binding it. The transport is
 * chosen by NOTIFICATION_DRIVER: `smtp` (real email, prod) or `log` (stub, the
 * default and what tests use). Swapping to SendGrid/SES later = add an adapter
 * and one line in this factory — auth/reminders are untouched.
 *
 * Layers, outermost first:
 *  - NOTIFICATION_PORT (`QueuedNotificationPort`): what modules inject. It only
 *    enqueues the email on the `email-delivery` BullMQ queue and returns.
 *  - EMAIL_DELIVERY (`TemplatedNotificationAdapter`): run by the queue worker
 *    (`EmailDeliveryWorker`); renders the superadmin-editable branded HTML for
 *    catalog events, applies opt-outs/on-off, then calls the transport.
 *  - NOTIFICATION_TRANSPORT: log stub or SMTP.
 * The superadmin endpoints live in `EmailTemplatesModule` (it needs AuthModule,
 * which itself injects this port, so they can't live here without a cycle).
 */
@Global()
@Module({
  imports: [BullModule.registerQueue({ name: EMAIL_DELIVERY_QUEUE })],
  providers: [
    EmailTemplateService,
    EmailDeliveryWorker,
    OrgEmailBrandingService,
    {
      provide: NOTIFICATION_TRANSPORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): NotificationPort =>
        config.get('NOTIFICATION_DRIVER', { infer: true }) === 'smtp'
          ? new SmtpNotificationAdapter(config)
          : new LogNotificationAdapter(),
    },
    {
      provide: EMAIL_DELIVERY,
      inject: [NOTIFICATION_TRANSPORT, EmailTemplateService, OrgEmailBrandingService],
      useFactory: (
        transport: NotificationPort,
        templates: EmailTemplateService,
        branding: OrgEmailBrandingService,
      ) => new TemplatedNotificationAdapter(transport, templates, branding),
    },
    {
      provide: NOTIFICATION_PORT,
      inject: [getQueueToken(EMAIL_DELIVERY_QUEUE), EMAIL_DELIVERY, ConfigService],
      useFactory: (
        queue: Queue<EmailDeliveryJobData>,
        delivery: NotificationPort,
        config: ConfigService<Env, true>,
      ) =>
        new QueuedNotificationPort(
          queue,
          delivery,
          config.get('EMAIL_QUEUE_ATTEMPTS', { infer: true }),
        ),
    },
  ],
  exports: [NOTIFICATION_PORT, NOTIFICATION_TRANSPORT, EmailTemplateService],
})
export class NotificationModule {}
