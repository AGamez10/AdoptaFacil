/**
 * Canales oficiales de contacto de AdoptaFácil (decisión D10 del dueño):
 * WhatsApp 302 852 8926 y adoptafacil.oficial@gmail.com. Un solo sitio para
 * que landing, onboarding, asistente y panel de plataforma nunca diverjan.
 */
export const OFFICIAL_WHATSAPP_DISPLAY = '302 852 8926';
export const OFFICIAL_EMAIL = 'adoptafacil.oficial@gmail.com';

const WHATSAPP_NUMBER = '573028528926';
/** El mismo número en formato internacional (datos estructurados). */
export const OFFICIAL_PHONE_E164 = `+${WHATSAPP_NUMBER}`;

/** Enlace `wa.me` con un mensaje prellenado opcional (lo edita la persona antes de enviar). */
export function officialWhatsappUrl(message?: string): string {
  const base = `https://wa.me/${WHATSAPP_NUMBER}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/** `mailto:` con asunto y cuerpo opcionales. */
export function officialMailtoUrl(subject?: string, body?: string): string {
  const params = new URLSearchParams();
  if (subject) params.set('subject', subject);
  if (body) params.set('body', body);
  const qs = params.toString().replace(/\+/g, '%20');
  return `mailto:${OFFICIAL_EMAIL}${qs ? `?${qs}` : ''}`;
}
