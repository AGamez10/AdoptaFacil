/**
 * Correos con la marca de la organización (planes Crece y Pro). Piezas puras:
 * qué marca lleva un correo y cómo se arma el remitente, sin tocar la base.
 *
 * Lo que cambia con la marca:
 *  - el encabezado muestra el nombre de la organización (con "a través de
 *    AdoptaFácil" debajo, por transparencia);
 *  - la barra de color y el botón usan el color de su portal;
 *  - el remitente se ve como "Nombre de la organización vía AdoptaFácil" y las
 *    respuestas van al correo de contacto de la organización.
 *
 * Lo que NO cambia: la dirección real del remitente sigue siendo la de
 * AdoptaFácil (`SMTP_FROM`), así que no hace falta configurar SPF ni DKIM por
 * organización, y el pie legal (Ley 1581, baja de masivos) sigue igual.
 */
export interface EmailBrand {
  /** Barra de color del encabezado, `#RRGGBB`. */
  accent?: string;
  /** Fondo del botón, `#RRGGBB`, y su texto (par de contraste ya validado en el portal). */
  button?: string;
  buttonText?: string;
}

export interface OrgEmailBranding {
  organizationName: string;
  brand: EmailBrand;
  /** Nombre visible del remitente. */
  fromName: string;
  /** Correo de contacto de la organización, si es válido. */
  replyTo?: string;
}

/** Resuelve (y cuenta contra el tope del mes) la marca de una organización. */
export interface OrgEmailBrandingPort {
  /** `null` = el correo sale con la marca de AdoptaFácil (sin plan, tope agotado o error). */
  claim(organizationId: string): Promise<OrgEmailBranding | null>;
}

const HSL_RE = /^(\d{1,3}(?:\.\d+)?)\s+(\d{1,3}(?:\.\d+)?)%\s+(\d{1,3}(?:\.\d+)?)%$/;

/** Canal HSL crudo del portal (`"142 72% 29%"`) → `#rrggbb`; `undefined` si no es válido. */
export function hslChannelToHex(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = HSL_RE.exec(value.trim());
  if (!match) return undefined;
  const h = Number(match[1]) % 360;
  const s = Number(match[2]) / 100;
  const l = Number(match[3]) / 100;
  if (s > 1 || l > 1) return undefined;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

/** Colores del correo a partir de los tokens del portal (solo los que son válidos). */
export function brandFromPortalTokens(tokens: unknown): EmailBrand {
  const t = (tokens ?? {}) as Record<string, unknown>;
  const primary = hslChannelToHex(t['primary']);
  const primaryText = hslChannelToHex(t['primary-foreground']);
  return {
    ...(primary ? { accent: primary } : {}),
    // El botón solo cambia si viene el par completo (fondo + texto), que el
    // portal ya validó por contraste; si no, queda el de AdoptaFácil.
    ...(primary && primaryText ? { button: primary, buttonText: primaryText } : {}),
  };
}

/**
 * Nombre visible del remitente: sin saltos de línea, comillas ni `<>` (no se
 * puede inyectar una cabecera ni fingir otra dirección) y acotado.
 */
export function brandedFromName(organizationName: string): string {
  const clean = organizationName
    .normalize('NFC')
    .replace(/[\r\n\t"<>\\]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 60)
    .trim();
  return clean ? `${clean} vía AdoptaFácil` : 'AdoptaFácil';
}

const EMAIL_RE = /^[^\s@<>"(),;:\\]+@[^\s@<>"(),;:\\]+\.[^\s@<>"(),;:\\]{2,}$/;

/** Correo de contacto apto para "Responder a" (una sola dirección simple). */
export function safeReplyTo(value: string | null | undefined): string | undefined {
  const email = value?.trim();
  return email && email.length <= 254 && EMAIL_RE.test(email) ? email : undefined;
}

/** Mes calendario UTC, `YYYY-MM`. */
export function usageMonth(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}
