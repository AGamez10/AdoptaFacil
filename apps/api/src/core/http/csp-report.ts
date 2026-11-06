/**
 * Parsing of Content-Security-Policy violation reports (plan SEO · P0).
 *
 * Browsers send them in two shapes: the legacy `report-uri` one
 * (`application/csp-report`, `{"csp-report": {...}}`) and the Reporting API one
 * (`application/reports+json`, `[{"type":"csp-violation","body":{...}}]`).
 * Only what is needed to tune the policy is kept: the directive, the ORIGIN of
 * what was blocked and the PATH of the page. Never the full URLs: query strings
 * can carry tokens (donation receipts, password resets) and personal data.
 */
export interface CspViolation {
  directive: string;
  blocked: string;
  page: string;
  disposition: 'report' | 'enforce' | 'unknown';
}

const MAX_REPORTS_PER_REQUEST = 20;
const MAX_FIELD_LENGTH = 120;

export function parseCspReports(payload: unknown): CspViolation[] {
  const bodies: Record<string, unknown>[] = [];
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      if (isRecord(entry) && entry.type === 'csp-violation' && isRecord(entry.body)) {
        bodies.push(entry.body);
      }
    }
  } else if (isRecord(payload) && isRecord(payload['csp-report'])) {
    bodies.push(payload['csp-report']);
  }
  return bodies.slice(0, MAX_REPORTS_PER_REQUEST).map(toViolation);
}

function toViolation(body: Record<string, unknown>): CspViolation {
  const directive =
    text(body.effectiveDirective) ||
    text(body['effective-directive']) ||
    text(body['violated-directive']) ||
    'unknown';
  const blocked = text(body.blockedURL) || text(body['blocked-uri']);
  const page = text(body.documentURL) || text(body['document-uri']);
  const disposition = text(body.disposition);
  return {
    directive: clip(directive),
    blocked: clip(originOnly(blocked)),
    page: clip(pathOnly(page)),
    disposition: disposition === 'report' || disposition === 'enforce' ? disposition : 'unknown',
  };
}

/** "https://cdn.example/x.js?k=1" → "https://cdn.example"; keywords like
 *  "inline" or "eval" pass through. */
function originOnly(value: string): string {
  if (!value) return 'unknown';
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : url.protocol;
  } catch {
    return /^[a-z-]+$/i.test(value) ? value : 'unknown';
  }
}

/** "https://site/donaciones/comprobante?token=…" → "/donaciones/comprobante". */
function pathOnly(value: string): string {
  if (!value) return 'unknown';
  try {
    return new URL(value).pathname;
  } catch {
    return 'unknown';
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function clip(value: string): string {
  return value.length > MAX_FIELD_LENGTH ? `${value.slice(0, MAX_FIELD_LENGTH)}…` : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
