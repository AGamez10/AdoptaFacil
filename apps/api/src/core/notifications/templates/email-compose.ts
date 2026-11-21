import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { EmailPreview, EmailTemplateContent } from '@adoptafacil/contracts';
import type { EmailBrand } from '../branding/org-email-branding';
import type { EmailEventDefinition } from './email-catalog';
import { renderLayout, renderTextFooter } from './email-layout';
import {
  cleanText,
  escapeHtml,
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
// Red de seguridad: un correo que llega SIN plantilla de catálogo (texto plano
// armado por el módulo) igual sale con la plantilla de AdoptaFácil. El texto se
// escapa entero (nunca se interpreta como HTML) y solo los enlaces http(s)
// sueltos se vuelven <a>; las líneas con viñeta (`- `, `• `) se dibujan como
// lista. Ningún correo de AdoptaFácil vuelve a salir "pelado".
// ---------------------------------------------------------------------------

const URL_IN_TEXT = /https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g;
const GREETING = /^(hola|buen[oa]s?)\b/i;

/** Escaped HTML of one plain-text fragment, with bare http(s) URLs linked. */
function linkify(text: string): string {
  let html = '';
  let last = 0;
  for (const match of text.matchAll(URL_IN_TEXT)) {
    const url = match[0];
    html += escapeHtml(text.slice(last, match.index));
    const safe = escapeHtml(url);
    html += `<a class="af-link" href="${safe}" target="_blank" rel="noopener" style="color:#198072;word-break:break-all;">${safe}</a>`;
    last = (match.index ?? 0) + url.length;
  }
  return html + escapeHtml(text.slice(last));
}

export function composePlainEmail(subject: string, body: string, webBaseUrl: string): EmailPreview {
  const cleanSubject = cleanText(subject, true).slice(0, 200) || 'Aviso de AdoptaFácil';
  const paragraphs = cleanText(body)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const preheader = cleanText(
    paragraphs.find((p) => !GREETING.test(p) || p.length > 40) ?? '',
    true,
  )
    .replace(URL_IN_TEXT, '')
    .slice(0, 140);
  const html = renderLayout({
    theme: 'community',
    icon: '🐾',
    kicker: 'Aviso de AdoptaFácil',
    category: 'transactional',
    preheaderHtml: escapeHtml(preheader),
    headingHtml: escapeHtml(cleanSubject),
    paragraphsHtml: paragraphs.map((p) =>
      p
        .split('\n')
        .map((line) => linkify(line))
        .join('<br>'),
    ),
    webBaseUrl,
  });
  const text = [cleanText(body).trim(), '', renderTextFooter('transactional')].join('\n');
  return { subject: cleanSubject, preheader, html, text };
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

/** With `organizationId` the token covers `hash:orgId`, so an organization's
 *  link cannot be replayed as a platform-wide opt-out (or for another org). */
export function signUnsubscribe(
  secret: string,
  emailHash: string,
  organizationId?: string,
): string {
  const payload = organizationId ? `${emailHash}:${organizationId}` : emailHash;
  return createHmac('sha256', unsubscribeKey(secret)).update(payload).digest('base64url');
}

export function verifyUnsubscribe(
  secret: string,
  emailHash: string,
  token: string,
  organizationId?: string,
): boolean {
  if (!/^[0-9a-f]{64}$/.test(emailHash) || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const expected = Buffer.from(signUnsubscribe(secret, emailHash, organizationId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

function orgParam(organizationId?: string): string {
  return organizationId ? `&o=${organizationId}` : '';
}

export function buildUnsubscribeUrl(
  webBaseUrl: string,
  secret: string,
  email: string,
  organizationId?: string,
): string {
  const h = hashEmail(email);
  const t = signUnsubscribe(secret, h, organizationId);
  return `${webBaseUrl.replace(/\/+$/, '')}/correo/baja?h=${h}&t=${t}${orgParam(organizationId)}`;
}

export function buildOneClickUnsubscribeUrl(
  apiBaseUrl: string,
  secret: string,
  email: string,
  organizationId?: string,
): string {
  const h = hashEmail(email);
  const t = signUnsubscribe(secret, h, organizationId);
  return `${apiBaseUrl.replace(/\/+$/, '')}/public/email/unsubscribe?h=${h}&t=${t}${orgParam(organizationId)}`;
}
