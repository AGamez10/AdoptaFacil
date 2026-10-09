import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation';
import { LogNotificationAdapter } from './log-notification.adapter';
import { SmtpNotificationAdapter } from './smtp-notification.adapter';
import { NOTIFICATION_PORT, type NotificationPort } from './notification.port';
import { TemplatedNotificationAdapter } from './templated-notification.adapter';
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
 * NOTIFICATION_PORT is the transport wrapped by the template layer
 * (`TemplatedNotificationAdapter`): messages that name a catalog event get the
 * superadmin-editable branded HTML; everything else passes through unchanged.
 * The superadmin endpoints live in `EmailTemplatesModule` (it needs AuthModule,
 * which itself injects this port, so they can't live here without a cycle).
 */
@Global()
@Module({
  providers: [
    EmailTemplateService,
    {
      provide: NOTIFICATION_TRANSPORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): NotificationPort =>
        config.get('NOTIFICATION_DRIVER', { infer: true }) === 'smtp'
          ? new SmtpNotificationAdapter(config)
          : new LogNotificationAdapter(),
    },
    {
      provide: NOTIFICATION_PORT,
      inject: [NOTIFICATION_TRANSPORT, EmailTemplateService],
      useFactory: (transport: NotificationPort, templates: EmailTemplateService) =>
        new TemplatedNotificationAdapter(transport, templates),
    },
  ],
  exports: [NOTIFICATION_PORT, NOTIFICATION_TRANSPORT, EmailTemplateService],
})
export class NotificationModule {}
