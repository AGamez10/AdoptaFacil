import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { EmailPreview, EmailTemplateContent } from '@adoptafacil/contracts';
import type { EmailBrand } from '../branding/org-email-branding';
import type { EmailEventDefinition } from './email-catalog';
import { renderLayout, renderTextFooter } from './email-layout';
import {
  renderInlineHtml,
  renderParagraphs,
  renderPlain,
  resolveValues,
  stripMarks,
  type RenderValues,
} from './email-render';

export interface ComposeOptions {
  organizationName?: string;
  webBaseUrl: string;
  /** Bulk emails only. */
  unsubscribeUrl?: string;
  /** Organization brand (plan Crece/Pro): its name heads the email and its colors paint it. */
  brand?: EmailBrand;
}

/** Pure: event + copy + data → subject, preheader, html and text parts. */
export function composeEmail(
  def: EmailEventDefinition,
  content: EmailTemplateContent,
  data: RenderValues,
  options: ComposeOptions,
): EmailPreview {
  const values = resolveValues(def.variables, {
    ...data,
    // The organization variable always reflects the org the email is about.
    ...(options.organizationName ? { organizacion: options.organizationName } : {}),
  });
  const ctaUrl = def.ctaUrlVariable ? values[def.ctaUrlVariable] : '';
  const ctaLabel = content.ctaLabel?.trim() && ctaUrl ? content.ctaLabel : undefined;
  const footerNote = content.footerNote?.trim() ? content.footerNote : undefined;

  const subject = renderPlain(content.subject, values, true).slice(0, 200) || def.defaults.subject;
  const preheader = renderPlain(content.preheader, values, true);
  const heading = renderPlain(content.heading, values, true);

  const html = renderLayout({
    theme: def.theme,
    accentColor: content.accentColor,
    icon: content.icon,
    category: def.category,
    preheaderHtml: renderInlineHtml(content.preheader, values, true),
    headingHtml: renderInlineHtml(content.heading, values, true),
    paragraphsHtml: renderParagraphs(content.body, values),
    ctaLabelHtml: ctaLabel ? renderInlineHtml(ctaLabel, values, true) : undefined,
    ctaUrl: ctaLabel ? ctaUrl : undefined,
    footerNoteHtml: footerNote ? renderInlineHtml(footerNote, values) : undefined,
    organizationName: options.organizationName,
    unsubscribeUrl: def.category === 'bulk' ? options.unsubscribeUrl : undefined,
    webBaseUrl: options.webBaseUrl,
    ...(options.brand && options.organizationName ? { brand: options.brand } : {}),
  });

  const textParts = [stripMarks(heading), '', stripMarks(renderPlain(content.body, values)).trim()];
  if (ctaLabel && ctaUrl)
    textParts.push('', `${stripMarks(renderPlain(ctaLabel, values, true))}: ${ctaUrl}`);
  if (footerNote) textParts.push('', stripMarks(renderPlain(footerNote, values)));
  textParts.push(
    '',
    renderTextFooter(def.category, options.organizationName, options.unsubscribeUrl),
  );

  return { subject, preheader, html, text: textParts.join('\n') };
}

// ---------------------------------------------------------------------------
// Unsubscribe links (bulk emails, Ley 1581). The link carries only the SHA-256
// of the address + an HMAC over it, never the address itself, so it can't be
// forged for someone else's email nor reveal who it belongs to.
// ---------------------------------------------------------------------------

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashEmail(email: string): string {
  return createHash('sha256').update(normalizeEmail(email)).digest('hex');
}

function unsubscribeKey(secret: string): Buffer {
  return createHmac('sha256', secret).update('adoptafacil:email-unsubscribe:v1').digest();
}

export function signUnsubscribe(secret: string, emailHash: string): string {
  return createHmac('sha256', unsubscribeKey(secret)).update(emailHash).digest('base64url');
}

export function verifyUnsubscribe(secret: string, emailHash: string, token: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(emailHash) || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const expected = Buffer.from(signUnsubscribe(secret, emailHash));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function buildUnsubscribeUrl(webBaseUrl: string, secret: string, email: string): string {
  const h = hashEmail(email);
  const t = signUnsubscribe(secret, h);
  return `${webBaseUrl.replace(/\/+$/, '')}/correo/baja?h=${h}&t=${t}`;
}

export function buildOneClickUnsubscribeUrl(
  apiBaseUrl: string,
  secret: string,
  email: string,
): string {
  const h = hashEmail(email);
  const t = signUnsubscribe(secret, h);
  return `${apiBaseUrl.replace(/\/+$/, '')}/public/email/unsubscribe?h=${h}&t=${t}`;
}
