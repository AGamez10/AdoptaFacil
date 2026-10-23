/**
 * Saneado de TODO dato que una plantilla interpola en su HTML (M14, plantillas
 * gratuitas). Las plantillas arman su marcado como texto, así que la regla es:
 * ningún dato llega al HTML sin pasar por aquí.
 *
 *  - `esc`        → texto en contenido o en atributos entre comillas dobles.
 *  - `safeHref`   → solo http(s) absolutos o rutas internas de la app ("/x").
 *  - `safeImgSrc` → solo http(s) absolutos o rutas internas.
 *  - `telHref` / `mailHref` / `waHref` → construidos a partir de dígitos/correo
 *    validados, nunca concatenando texto libre.
 *
 * Todo lo demás (`javascript:`, `data:`, `vbscript:`, `//host`, espacios de
 * control, etc.) se descarta y la plantilla simplemente no pinta ese enlace.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

/** Escapa un valor para insertarlo como texto o atributo HTML. */
export function esc(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"'`]/g, (c) => ESCAPES[c] ?? c);
}

/** Revierte `esc` (para `textContent`, que no interpreta entidades). */
export function unesc(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#96;/g, '`')
    .replace(/&amp;/g, '&');
}

/** Caracteres de control / espacios invisibles que algunos navegadores ignoran
 *  dentro de un esquema (`java\tscript:`). Cualquier enlace que los traiga se
 *  rechaza en bloque. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\uFEFF]/;

function absoluteHttp(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!url.hostname) return null;
  return url.toString();
}

function internalPath(raw: string): string | null {
  // "/ruta" sí; "//host" (protocol-relative) y "/\host" no.
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null;
  return raw;
}

/** Enlace seguro y YA escapado para `href="..."`, o `null` si no es aceptable. */
export function safeHref(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value || CONTROL_CHARS.test(value)) return null;
  const ok = internalPath(value) ?? absoluteHttp(value);
  return ok ? esc(ok) : null;
}

/** Fuente segura y YA escapada para `src="..."` de una imagen, o `null`. */
export function safeImgSrc(raw: string | null | undefined): string | null {
  // Nunca contenido mixto: una imagen http:// se pide por https:// (si el host
  // no tiene HTTPS, la imagen falla y la plantilla muestra la ilustración).
  const v = typeof raw === 'string' ? raw.trim().replace(/^http:\/\//i, 'https://') : raw;
  return safeHref(v);
}

/** `tel:` construido solo con dígitos y "+" inicial; `null` si no hay dígitos. */
export function telHref(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  return /\d{5,}/.test(digits) ? `tel:${digits}` : null;
}

/** `https://wa.me/<dígitos>` — misma construcción que el portal clásico. */
export function waHref(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/[^\d]/g, '');
  return digits.length >= 5 ? `https://wa.me/${digits}` : null;
}

const EMAIL = /^[^\s@<>"'`()\\,;:]+@[^\s@<>"'`()\\,;:]+\.[^\s@<>"'`()\\,;:]+$/;

/** `mailto:` solo para un correo con forma válida; `null` en otro caso. */
export function mailHref(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return EMAIL.test(value) ? `mailto:${esc(value)}` : null;
}
