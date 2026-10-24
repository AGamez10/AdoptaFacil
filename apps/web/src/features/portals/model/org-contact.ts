/**
 * Enlaces de contacto de una ORGANIZACIÓN en su portal, construidos solo a
 * partir de dígitos y correos válidos (nunca se interpola texto libre en un
 * `href`: cierra la familia de XSS por esquema `javascript:` del hallazgo
 * AF-010/SEC-012 para estos dos campos).
 */
export function orgWhatsappUrl(raw: string | undefined, message?: string): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  // Celular colombiano sin indicativo (10 dígitos que empiezan por 3).
  if (digits.length === 10 && digits.startsWith('3')) digits = `57${digits}`;
  if (digits.length < 10 || digits.length > 15) return null;
  const base = `https://wa.me/${digits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

const EMAIL = /^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}$/i;

export function orgMailtoUrl(raw: string | undefined): string | null {
  const email = raw?.trim();
  if (!email || !EMAIL.test(email)) return null;
  return `mailto:${email}`;
}
