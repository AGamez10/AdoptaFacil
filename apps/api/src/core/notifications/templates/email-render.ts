import type {
  EmailTemplateContent,
  EmailVariableDescriptor,
  EmailVariableKind,
} from '@adoptafacil/contracts';
import type { EmailEventDefinition } from './email-catalog';

/**
 * Template engine for the superadmin-editable emails. Deliberately tiny and
 * logic-less, so a template can't do anything but place text:
 *
 *  - Template text is PLAIN TEXT. It is HTML-escaped before it reaches the
 *    layout, so `<script>`, `<a href>`, `<img onerror>`… typed by an admin
 *    render as visible text, never as markup (no stored XSS / phishing links).
 *  - `{{variable}}` is the only substitution, restricted to the variables the
 *    catalog lists for that event (unknown names are rejected at save time and
 *    render as nothing if they ever reach here). Values are escaped too.
 *  - `**bold**` is the only formatting; blank lines split paragraphs.
 *  - URL values are accepted only as absolute http(s) URLs; anything else
 *    (javascript:, data:, relative) becomes empty.
 *  - Single-line fields (subject, preheader, heading, button) drop CR/LF, so a
 *    value can never inject an extra mail header.
 */

const PLACEHOLDER = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;
// Anything that looks like a placeholder attempt (to catch typos like `{{ nombre }` or `{{1x}}`).
const PLACEHOLDER_LIKE = /\{\{|\}\}/g;
// C0 controls except TAB/LF/CR, DEL, and the C1 range.
// eslint-disable-next-line no-control-regex -- stripping control chars is the point
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const BIDI_OVERRIDES = /[\u202A-\u202E\u2066-\u2069]/g;

export const CONTENT_LIMITS = {
  subject: 150,
  preheader: 200,
  heading: 120,
  body: 5000,
  ctaLabel: 40,
  footerNote: 300,
} as const;

const SINGLE_LINE_FIELDS = ['subject', 'preheader', 'heading', 'ctaLabel'] as const;
const MAX_VALUE_LENGTH = 2000;

export type RenderValues = Record<string, string | number | null | undefined>;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Strip control/bidi characters and collapse line breaks for one-line fields. */
export function cleanText(value: string, singleLine = false): string {
  const cleaned = value.replace(CONTROL_CHARS, '').replace(BIDI_OVERRIDES, '');
  return singleLine
    ? cleaned
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
    : cleaned.replace(/\r\n?/g, '\n');
}

/** Absolute http(s) URL or empty string. */
export function safeUrl(raw: string): string {
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});
// Hora Colombia SOLO en presentación (AGENTS.md invariante 4).
const DATE_CO = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'America/Bogota',
});

/** Turn a raw value into its display text for the variable's kind. */
export function formatValue(
  kind: EmailVariableKind,
  raw: string | number | null | undefined,
): string {
  if (raw === null || raw === undefined || raw === '') return '';
  switch (kind) {
    case 'money': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(n) ? COP.format(n) : '';
    }
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(n) ? new Intl.NumberFormat('es-CO').format(n) : '';
    }
    case 'date': {
      const d = new Date(String(raw));
      return Number.isNaN(d.getTime()) ? '' : DATE_CO.format(d);
    }
    case 'url':
      return safeUrl(String(raw));
    default:
      return cleanText(String(raw)).slice(0, MAX_VALUE_LENGTH);
  }
}

/** Formatted values for every variable the event declares (unknown keys dropped). */
export function resolveValues(
  variables: readonly EmailVariableDescriptor[],
  data: RenderValues,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const variable of variables) {
    out[variable.name] = formatValue(variable.kind, data[variable.name]);
  }
  return out;
}

/** Raw example values (formatted later, like real data, when rendering). */
export function exampleValues(variables: readonly EmailVariableDescriptor[]): RenderValues {
  return Object.fromEntries(variables.map((variable) => [variable.name, variable.example]));
}

/**
 * Validate an admin-edited copy against its event. Returns human-readable
 * errors in Spanish (empty = valid). Lengths are also enforced by the zod
 * schema at the controller; this adds the template-specific rules.
 */
export function validateContent(
  def: EmailEventDefinition,
  content: EmailTemplateContent,
): string[] {
  const errors: string[] = [];
  const allowed = new Set(def.variables.map((variable) => variable.name));
  const fields: Array<[keyof typeof CONTENT_LIMITS, string | undefined]> = [
    ['subject', content.subject],
    ['preheader', content.preheader],
    ['heading', content.heading],
    ['body', content.body],
    ['ctaLabel', content.ctaLabel],
    ['footerNote', content.footerNote],
  ];
  for (const [field, value] of fields) {
    if (value === undefined) continue;
    if (value.length > CONTENT_LIMITS[field]) {
      errors.push(`"${FIELD_LABELS[field]}" supera ${CONTENT_LIMITS[field]} caracteres.`);
    }
    if ((SINGLE_LINE_FIELDS as readonly string[]).includes(field) && /[\r\n]/.test(value)) {
      errors.push(`"${FIELD_LABELS[field]}" debe ir en una sola línea.`);
    }
    const known = new Set<string>();
    for (const match of value.matchAll(PLACEHOLDER)) {
      known.add(match[0]);
      if (!allowed.has(match[1])) {
        errors.push(
          `La variable {{${match[1]}}} no existe para este correo. Usa solo: ${[...allowed].map((n) => `{{${n}}}`).join(', ') || 'ninguna'}.`,
        );
      }
    }
    const stripped = value.replace(PLACEHOLDER, '');
    if (PLACEHOLDER_LIKE.test(stripped)) {
      errors.push(`"${FIELD_LABELS[field]}" tiene llaves {{ }} mal cerradas.`);
    }
    PLACEHOLDER_LIKE.lastIndex = 0;
  }
  if (!content.subject.trim()) errors.push('El asunto es obligatorio.');
  if (!content.heading.trim()) errors.push('El título es obligatorio.');
  if (!content.body.trim()) errors.push('El mensaje es obligatorio.');
  if (content.ctaLabel?.trim() && !def.ctaUrlVariable) {
    errors.push('Este correo no lleva botón: deja vacío el texto del botón.');
  }
  return [...new Set(errors)];
}

const FIELD_LABELS: Record<keyof typeof CONTENT_LIMITS, string> = {
  subject: 'Asunto',
  preheader: 'Texto de vista previa',
  heading: 'Título',
  body: 'Mensaje',
  ctaLabel: 'Texto del botón',
  footerNote: 'Nota al pie',
};

/** Plain-text substitution (subject, text/plain part). */
export function renderPlain(
  template: string,
  values: Record<string, string>,
  singleLine = false,
): string {
  const rendered = cleanText(template, singleLine).replace(PLACEHOLDER, (_m, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? values[name] : '',
  );
  return singleLine ? cleanText(rendered, true) : rendered;
}

/** Strip `**bold**` markers for the text/plain part. */
export function stripMarks(text: string): string {
  return text.replace(/\*\*\*\*/g, '').replace(/\*\*(.+?)\*\*/g, '$1');
}

/**
 * Escaped HTML for one inline fragment: escape the template text, substitute
 * escaped values (asterisks neutralized so a VALUE can never open bold), then
 * apply `**bold**` and line breaks.
 */
export function renderInlineHtml(
  template: string,
  values: Record<string, string>,
  singleLine = false,
): string {
  const source = cleanText(template, singleLine);
  let html = '';
  let last = 0;
  for (const match of source.matchAll(PLACEHOLDER)) {
    html += escapeHtml(source.slice(last, match.index));
    const value = Object.prototype.hasOwnProperty.call(values, match[1]) ? values[match[1]] : '';
    html += escapeHtml(singleLine ? cleanText(value, true) : value).replace(/\*/g, '&#42;');
    last = (match.index ?? 0) + match[0].length;
  }
  html += escapeHtml(source.slice(last));
  // An empty value inside **…** leaves `****`: drop it instead of mis-pairing.
  html = html.replace(/\*\*\*\*/g, '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return singleLine ? html : html.replace(/\n/g, '<br>');
}

/** Body → array of paragraph HTML fragments (blank line = new paragraph). */
export function renderParagraphs(template: string, values: Record<string, string>): string[] {
  return cleanText(template)
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => renderInlineHtml(paragraph, values));
}
