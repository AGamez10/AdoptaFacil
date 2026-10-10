/**
 * Saneamiento de TODA variable que termina impresa en un reporte (PDF o
 * Excel). Los datos vienen de usuarios (nombres de donantes, voluntarios,
 * colegios, descripciones), así que se tratan como no confiables:
 *
 * - PDF: las fuentes estándar de pdf-lib solo codifican WinAnsi (cp1252). Un
 *   emoji o un carácter fuera de ese juego hace que `drawText` LANCE y tumbe la
 *   generación entera; además los caracteres de control pueden romper el
 *   layout. Se normaliza (NFC), se eliminan controles y se reemplaza todo lo no
 *   codificable por `?`.
 * - Excel: una celda que empieza por `=`, `+`, `-`, `@`, tab o retorno de carro
 *   puede interpretarse como fórmula al abrir el archivo (inyección CSV/DDE).
 *   Se antepone un apóstrofo para que siempre sea texto.
 * - Ambos: longitud acotada, para que un valor enorme no desborde el documento.
 */

/** Caracteres de cp1252 por encima de 0x7F que no están en Latin-1. */
const CP1252_EXTRAS = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.split(''));

function isWinAnsi(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  if (code >= 0x20 && code <= 0x7e) return true;
  if (code >= 0xa0 && code <= 0xff) return true;
  return CP1252_EXTRAS.has(char);
}

const CONTROL_CHARS = new RegExp(
  // eslint-disable-next-line no-control-regex -- se buscan controles A PROPÓSITO para quitarlos.
  '[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2066-\\u2069\\ufeff]',
  'g',
);

// Espacios Unicode (p. ej. U+202F que usa Intl en algunas fechas) → espacio normal.
const UNICODE_SPACES = /[\u2000-\u200a\u202f\u205f\u3000]/g;

/**
 * Último filtro antes de `drawText`: garantiza que la cadena sea codificable
 * en WinAnsi (sin recortar). Lo usa el lienzo del PDF para TODO lo que dibuja,
 * incluidos los textos fijos y los formatos de fecha/moneda de Intl.
 */
export function toWinAnsi(value: string): string {
  let out = '';
  for (const char of value.replace(UNICODE_SPACES, ' ').replace(CONTROL_CHARS, '')) {
    out += isWinAnsi(char) ? char : '?';
  }
  return out;
}

/** Texto de usuario seguro para el PDF: una línea, sin controles, acotado. */
export function pdfText(value: unknown, maxLength = 200): string {
  if (value === null || value === undefined) return '';
  const normalized = toWinAnsi(
    String(value)
      .normalize('NFC')
      .replace(/[\r\n\t]+/g, ' '),
  )
    .replace(/\s{2,}/g, ' ')
    .trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** Texto seguro para una celda de Excel (nunca se evalúa como fórmula). */
export function sheetText(value: unknown, maxLength = 500): string {
  if (value === null || value === undefined) return '';
  let text = String(value)
    .normalize('NFC')
    .replace(/[\r\n]+/g, ' ')
    .replace(CONTROL_CHARS, '')
    .trim();
  if (text.length > maxLength) {
    text = `${text.slice(0, maxLength - 1)}…`;
  }
  return FORMULA_PREFIX.test(text) ? `'${text}` : text;
}

/** Oculta un número de documento dejando visibles solo los 4 últimos dígitos. */
export function maskDocument(value: string | null | undefined): string {
  if (!value) return '';
  const clean = value.replace(/\s+/g, '');
  if (clean.length <= 4) return '••••';
  return `••••${clean.slice(-4)}`;
}
