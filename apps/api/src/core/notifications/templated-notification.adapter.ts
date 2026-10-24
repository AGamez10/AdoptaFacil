import { Logger } from '@nestjs/common';
import { getEmailEvent } from './templates/email-catalog';
import type { EmailTemplateService } from './templates/email-template.service';
import type { OrgEmailBranding, OrgEmailBrandingPort } from './branding/org-email-branding';
import type { NotificationMessage, NotificationPort } from './notification.port';

/**
 * The NotificationPort every module injects. It wraps the real transport
 * (`log` stub or SMTP) and, when a caller passes `template: { event, data }`,
 * swaps the plain-text body for the superadmin's branded template:
 *
 *  - event switched off by the superadmin → nothing is sent (logged as skipped);
 *    required events (password reset) can't be switched off;
 *  - bulk event → never sent to an address that opted out (Ley 1581), and if
 *    the opt-out list can't be checked, it is NOT sent (fail closed on consent);
 *  - the template can't be rendered (DB down, bad data) → the caller's own
 *    subject/body go out instead (fail open on service emails, so a receipt or
 *    a password reset is never lost).
 *
 * Messages without `template` pass through untouched. Never logs bodies or
 * addresses beyond what the inner adapter already logs.
 *
 * With `template.organizationId` and a branding port, the email may go out
 * with the organization's brand (plan Crece/Pro, within the monthly cap):
 * its name in the header, its portal color, "<Org> vía AdoptaFácil" as the
 * sender name and its contact email as Reply-To. Branding never blocks a send:
 * without it the email goes out with AdoptaFácil's brand.
 */
export class TemplatedNotificationAdapter implements NotificationPort {
  private readonly logger = new Logger('NotificationPort');

  constructor(
    private readonly inner: NotificationPort,
    private readonly templates: EmailTemplateService,
    private readonly branding?: OrgEmailBrandingPort,
  ) {}

  async send(message: NotificationMessage): Promise<void> {
    const { template, ...plain } = message;
    const def = template ? getEmailEvent(template.event) : undefined;
    if (!template || !def) {
      return this.inner.send(plain);
    }

    if (def.category === 'bulk') {
      let suppressed: boolean;
      try {
        suppressed = await this.templates.isSuppressed(message.to, template.organizationId);
      } catch (error) {
        this.logger.warn(
          `bulk email event=${def.event} skipped: opt-out list unavailable (${(error as Error).message})`,
        );
        return;
      }
      if (suppressed) {
        this.logger.log(`bulk email event=${def.event} skipped: recipient opted out`);
        return;
      }
    }

    let rendered;
    let branding: OrgEmailBranding | null = null;
    try {
      const state = await this.templates.resolve(def);
      if (!state.enabled) {
        this.logger.log(`email event=${def.event} skipped: disabled by platform admin`);
        return;
      }
      if (template.organizationId && this.branding) {
        branding = await this.branding.claim(template.organizationId);
      }
      rendered = this.templates.render(
        def,
        state.content,
        message.to,
        template.data,
        template.organizationName,
        branding?.brand,
        template.organizationId,
      );
    } catch (error) {
      this.logger.warn(
        `email event=${def.event} template failed, sending plain fallback (${(error as Error).message})`,
      );
      return this.inner.send(plain);
    }

    return this.inner.send({
      ...plain,
      subject: rendered.subject,
      body: rendered.text,
      html: rendered.html,
      headers: { ...(plain.headers ?? {}), ...(rendered.headers ?? {}) },
      ...(branding ? { fromName: branding.fromName } : {}),
      ...(branding?.replyTo ? { replyTo: branding.replyTo } : {}),
    });
  }
}
