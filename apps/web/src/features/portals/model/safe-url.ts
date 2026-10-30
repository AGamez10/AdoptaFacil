/**
 * Enlaces externos del portal público clásico. React no bloquea `javascript:`
 * en `href` (solo avisa en desarrollo), así que cualquier URL que venga del
 * perfil de la organización pasa por aquí: solo `http(s)` con host, sin
 * caracteres de control. La API ya rechaza otros esquemas al guardar; esto
 * cubre datos guardados antes de esa validación.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\uFEFF]/;

export function safeExternalUrl(raw: string | null | undefined): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim();
  if (!value || CONTROL_CHARS.test(value)) return undefined;
  try {
    const url = new URL(value);
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !url.hostname) return undefined;
    return value;
  } catch {
    return undefined;
  }
}
