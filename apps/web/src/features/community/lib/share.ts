/**
 * Enlaces para compartir publicaciones de la comunidad en redes. Siempre se
 * comparte el PUENTE `/p/<id>?s=<red>` (Caddy lo pasa a la API): los
 * rastreadores de WhatsApp, Facebook, X y LinkedIn no ejecutan JavaScript, así
 * que solo ese HTML les da título, descripción y la tarjeta con la marca. El
 * puente manda a la persona a la publicación con `utm_source` de la red.
 */

const API_BASE: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export type ShareNetwork =
  'whatsapp' | 'facebook' | 'x' | 'linkedin' | 'telegram' | 'copy' | 'native';

/** URL del puente para `network`. Con la API en el mismo origen (`/api`), el
 *  enlace corto `/p/<id>`; en desarrollo (API en otro origen), la ruta directa.
 *
 *  `/c/` NO: es la URL impresa bajo el QR de las bolsas de café
 *  (`/c/<código>`), que no puede cambiar. Antes los dos compartían `/c/` y el
 *  enlace de una publicación abría "Código no encontrado" del café. Los
 *  enlaces viejos `/c/<uuid>` siguen funcionando (ver `short-links.tsx`). */
export function shareLink(
  postId: string,
  network: ShareNetwork,
  origin = window.location.origin,
): string {
  const id = encodeURIComponent(postId);
  const base = API_BASE.startsWith('/')
    ? `${origin}/p/${id}`
    : `${API_BASE.replace(/\/+$/, '')}/public/share/p/${id}`;
  return `${base}?s=${network}`;
}

/** Página pública (canónica) de una publicación. */
export function publicPostPath(postId: string): string {
  return `/comunidad/publicacion/${encodeURIComponent(postId)}`;
}

export interface ShareTarget {
  network: Exclude<ShareNetwork, 'copy' | 'native'>;
  label: string;
  href: string;
}

/** Botones de cada red, con el texto ya preparado. */
export function shareTargets(postId: string, text: string, origin?: string): ShareTarget[] {
  const link = (network: ShareNetwork) => encodeURIComponent(shareLink(postId, network, origin));
  const message = encodeURIComponent(text);
  return [
    {
      network: 'whatsapp',
      label: 'WhatsApp',
      href: `https://wa.me/?text=${message}%20${link('whatsapp')}`,
    },
    {
      network: 'facebook',
      label: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${link('facebook')}`,
    },
    {
      network: 'x',
      label: 'X',
      href: `https://twitter.com/intent/tweet?text=${message}&url=${link('x')}`,
    },
    {
      network: 'linkedin',
      label: 'LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${link('linkedin')}`,
    },
    {
      network: 'telegram',
      label: 'Telegram',
      href: `https://t.me/share/url?url=${link('telegram')}&text=${message}`,
    },
  ];
}

/** Texto que acompaña el enlace (corto: el resto lo pone la tarjeta). */
export function shareText(post: { title?: string; body: string }): string {
  const head = (post.title ?? post.body).replace(/\s+/g, ' ').trim();
  const short = head.length > 90 ? `${head.slice(0, 89).replace(/\s+\S*$/, '')}…` : head;
  return `${short} · Míralo en AdoptaFácil`;
}
