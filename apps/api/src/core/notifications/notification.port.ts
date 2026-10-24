import type { EmailEventKey } from '@adoptafacil/contracts';

/**
 * NotificationPort (hexagonal) — the SINGLE shared definition for outbound
 * notifications (emails/SMS/push). Promoted to core in T-107 (it was already the
 * single global port, previously under src/notifications).
 *
 * Ola 1 ships only the PORT and a simulable stub (see LogNotificationAdapter);
 * real adapters arrive later behind this same interface, bound to
 * NOTIFICATION_PORT in one place. Consumers (auth password-reset, clinical
 * reminders, future dispersions/emails) depend on this abstraction only.
 */
export const NOTIFICATION_PORT = Symbol('NOTIFICATION_PORT');

export interface NotificationAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

/**
 * Ask for the superadmin-editable template of a catalog event. The message's
 * own `subject`/`body` stay as the plain-text FALLBACK used if the template
 * can't be rendered, so a critical email (password reset) is never lost.
 */
export interface NotificationTemplateRequest {
  event: EmailEventKey;
  /** Raw values for the event's variables (formatted by kind when rendering). */
  data: Record<string, string | number | null | undefined>;
  /** Shown in the email header and as `{{organizacion}}`. */
  organizationName?: string;
  /**
   * Additive: the organization the email is about. When its plan includes
   * `brandedEmails` (and the month's cap isn't reached) the email goes out
   * with that organization's brand; otherwise with AdoptaFácil's. On a bulk
   * email, its unsubscribe link opts the recipient out of THAT
   * organization's emails only.
   */
  organizationId?: string;
}

export interface NotificationMessage {
  to: string;
  subject: string;
  /** Texto plano (siempre presente: es la alternativa legible sin HTML). */
  body: string;
  /** Additive: HTML part (set by the template layer, not by callers). */
  html?: string;
  /** Additive: extra mail headers (e.g. List-Unsubscribe on bulk emails). */
  headers?: Record<string, string>;
  /** Additive: files to attach (e.g. the signed adoption contract PDF). */
  attachments?: NotificationAttachment[];
  /** Additive: render this catalog event's template instead of `body`. */
  template?: NotificationTemplateRequest;
  /**
   * Additive: stable id of this email (e.g. `donation.thanks:<donationId>`).
   * The same key sent again within 7 days is dropped by the delivery queue,
   * so a repeated webhook or a retried request never emails twice.
   */
  idempotencyKey?: string;
  /** Additive: display name of the sender (the address stays SMTP_FROM). Set by the template layer. */
  fromName?: string;
  /** Additive: Reply-To address (the organization's contact email). Set by the template layer. */
  replyTo?: string;
}

export interface NotificationPort {
  send(message: NotificationMessage): Promise<void>;
}
