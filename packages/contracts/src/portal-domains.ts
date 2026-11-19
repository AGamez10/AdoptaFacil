/**
 * Dominio propio del portal (plan Pro). La organización compra su dominio en
 * el registrador que quiera (queda a su nombre) y lo apunta a AdoptaFácil con
 * dos registros DNS; AdoptaFácil lo verifica y emite el certificado HTTPS solo.
 *
 * Estados que ve la organización:
 * - `none`: no ha pedido un dominio.
 * - `pending_dns`: lo pidió; faltan o aún no se ven los registros DNS.
 * - `active`: verificado; el portal responde en ese dominio con HTTPS.
 * - `suspended`: estaba verificado, pero su plan ya no incluye dominio propio
 *   (el portal sigue en su enlace de AdoptaFácil; vuelve solo al renovar).
 * - `unavailable`: la plataforma aún no habilitó dominios propios.
 */
export type PortalDomainState = 'none' | 'pending_dns' | 'active' | 'suspended' | 'unavailable';

/** Por qué no se pudo verificar (el último intento). */
export type PortalDomainCheckError = 'txt_missing' | 'target_mismatch' | 'taken' | 'dns_error';

export const PORTAL_DOMAIN_CHECK_ERRORS: Record<PortalDomainCheckError, string> = {
  txt_missing: 'Todavía no vemos el registro TXT de verificación.',
  target_mismatch: 'El dominio todavía no apunta a AdoptaFácil (revisa el CNAME o el registro A).',
  taken: 'Ese dominio ya está conectado a otra organización.',
  dns_error: 'No pudimos consultar el DNS en este momento. Intenta de nuevo en unos minutos.',
};

export interface PortalDnsRecord {
  type: 'CNAME' | 'A' | 'TXT';
  /** Nombre del registro tal como se escribe en el registrador. */
  name: string;
  value: string;
}

/** `GET /org/portal/domain` (Owner/Administrator). */
export interface PortalDomainView {
  state: PortalDomainState;
  /** El plan actual incluye dominio propio (si no, se ofrece Pro). */
  planIncludes: boolean;
  domain: string | null;
  /** Registros que la organización debe crear en su registrador. */
  records: PortalDnsRecord[];
  lastCheckedAt: string | null;
  lastError: PortalDomainCheckError | null;
  verifiedAt: string | null;
}

/** `PUT /org/portal/domain`. */
export interface SetPortalDomainInput {
  domain: string;
}

/** `GET /public/portal-domains/resolve?host=` — solo el slug, como los subdominios. */
export interface PortalDomainLookup {
  slug: string;
}

/**
 * Normaliza lo que escribe la persona (`https://www.MiRefugio.org/` →
 * `www.mirefugio.org`). `null` si no es un nombre de dominio válido. Los
 * dominios con tildes o ñ se escriben en su forma `xn--` (punycode). Pura.
 */
export function normalizePortalDomain(raw: string): string | null {
  let value = raw.trim().toLowerCase();
  value = value.replace(/^[a-z]+:\/\//, '');
  value = value.split(/[/?#]/, 1)[0] ?? '';
  value = value.replace(/\.$/, '');
  if (value.length === 0 || value.length > 253) return null;
  if (!/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/.test(value)) {
    return null;
  }
  return value;
}

/** El dominio es la raíz (`mirefugio.org`), no un subdominio (`www.mirefugio.org`).
 *  Aproximación para sufijos de dos niveles comunes en Colombia (`.com.co`, `.org.co`…). Pura. */
export function isApexDomain(domain: string): boolean {
  const labels = domain.split('.');
  const twoLevel = /^(com|org|net|edu|gov|mil|nom|co)\.[a-z]{2}$/.test(labels.slice(-2).join('.'));
  return labels.length === (twoLevel ? 3 : 2);
}
