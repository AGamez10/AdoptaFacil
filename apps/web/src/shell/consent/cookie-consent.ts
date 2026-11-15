import { LEGAL_DOCUMENTS } from '@adoptafacil/contracts';

/**
 * Consentimiento de cookies del visitante (Ley 1581 de 2012).
 *
 * Tres categorías: las obligatorias siempre están activas; estadísticas y
 * marketing arrancan APAGADAS y solo se encienden con una acción del visitante.
 * La elección vive en `localStorage` (no es una cookie) y va atada a la versión
 * vigente de la Política de cookies: si se publica una versión nueva, el aviso
 * vuelve a salir.
 *
 * Hoy la app no carga ningún script de estadística ni de marketing. Cualquier
 * script de ese tipo que se agregue en el futuro DEBE pasar por
 * `loadScriptWithConsent`, que no hace nada sin el permiso de su categoría.
 */

export type OptionalCookieCategory = 'statistics' | 'marketing';

export interface CookieConsent {
  /** Versión de la Política de cookies que vio el visitante al decidir. */
  policyVersion: string;
  necessary: true;
  statistics: boolean;
  marketing: boolean;
  /** Momento de la decisión, ISO 8601 en UTC. */
  decidedAt: string;
}

export const COOKIE_CONSENT_STORAGE_KEY = 'af_cookie_consent';
export const COOKIE_CONSENT_CHANGE_EVENT = 'af:cookie-consent-change';
export const OPEN_COOKIE_SETTINGS_EVENT = 'af:open-cookie-settings';

/** Versión vigente de la política (fuente única: `packages/contracts`). */
export const COOKIE_POLICY_VERSION =
  LEGAL_DOCUMENTS.find((d) => d.key === 'cookies_policy')?.version ?? 'sin-version';

export const COOKIE_POLICY_PATH = '/legal/cookies';

function isConsent(value: unknown): value is CookieConsent {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.policyVersion === 'string' &&
    v.necessary === true &&
    typeof v.statistics === 'boolean' &&
    typeof v.marketing === 'boolean' &&
    typeof v.decidedAt === 'string'
  );
}

/**
 * Decisión guardada para la versión vigente de la política, o `null` si el
 * visitante aún no decide (o decidió sobre una versión anterior).
 */
export function readCookieConsent(): CookieConsent | null {
  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isConsent(parsed) || parsed.policyVersion !== COOKIE_POLICY_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Guarda la decisión y avisa al resto de la app. */
export function saveCookieConsent(choice: {
  statistics: boolean;
  marketing: boolean;
}): CookieConsent {
  const consent: CookieConsent = {
    policyVersion: COOKIE_POLICY_VERSION,
    necessary: true,
    statistics: choice.statistics,
    marketing: choice.marketing,
    decidedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(consent));
  } catch {
    // Almacenamiento bloqueado (modo privado estricto): la decisión vale para
    // esta visita y el aviso volverá a salir en la próxima.
  }
  window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_CHANGE_EVENT, { detail: consent }));
  return consent;
}

/** ¿El visitante permitió esta categoría? Sin decisión, la respuesta es no. */
export function hasCookieConsent(category: OptionalCookieCategory): boolean {
  return readCookieConsent()?.[category] === true;
}

/** Reabre el panel de configuración (p. ej. desde el pie de página). */
export function openCookieSettings(): void {
  window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT));
}

/**
 * Única puerta para scripts de estadística o marketing. Inserta el script solo
 * si la categoría tiene permiso; si el permiso llega después (el visitante
 * acepta más tarde), lo inserta en ese momento. Devuelve una función que
 * cancela la espera.
 */
export function loadScriptWithConsent(
  category: OptionalCookieCategory,
  src: string,
  attrs: Record<string, string> = {},
): () => void {
  const inject = () => {
    if (document.querySelector(`script[data-consent-src="${CSS.escape(src)}"]`)) return;
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.consentCategory = category;
    script.dataset.consentSrc = src;
    for (const [k, v] of Object.entries(attrs)) script.setAttribute(k, v);
    document.head.appendChild(script);
  };

  if (hasCookieConsent(category)) {
    inject();
    return () => undefined;
  }
  const onChange = () => {
    if (hasCookieConsent(category)) {
      inject();
      window.removeEventListener(COOKIE_CONSENT_CHANGE_EVENT, onChange);
    }
  };
  window.addEventListener(COOKIE_CONSENT_CHANGE_EVENT, onChange);
  return () => window.removeEventListener(COOKIE_CONSENT_CHANGE_EVENT, onChange);
}
