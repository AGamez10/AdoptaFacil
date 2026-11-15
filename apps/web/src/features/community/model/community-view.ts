import { PostType } from '@adoptafacil/contracts';

/** Etiquetas legibles (es-CO) de los tipos de publicación — enum CERRADO del
 *  contrato (M11). No se inventan tipos fuera del enum. */
export const TYPE_LABELS: Record<PostType, string> = {
  [PostType.General]: 'General',
  [PostType.Campaign]: 'Campaña',
  [PostType.Notice]: 'Aviso',
  [PostType.Event]: 'Evento',
};

/** Variante de badge semántica por tipo. */
export function typeVariant(type: PostType): 'secondary' | 'success' | 'warning' | 'default' {
  switch (type) {
    case PostType.Campaign:
      return 'success';
    case PostType.Notice:
      return 'warning';
    case PostType.Event:
      return 'default';
    case PostType.General:
      return 'secondary';
  }
}

/** Presenta un ISO-8601 UTC en hora Colombia (UTC en almacenamiento, CO en UI). */
export function formatBogota(isoUtc: string): string {
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) return isoUtc;
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

/** "1 comentario" / "3 comentarios" — pluralización simple es-CO. */
export function commentCountLabel(count: number): string {
  return count === 1 ? '1 comentario' : `${count} comentarios`;
}

/** "1 me gusta" / "3 me gusta" — "me gusta" no pluraliza en es-CO. */
export function likeCountLabel(count: number): string {
  return `${count} me gusta`;
}

/** Enlace al detalle de una publicación. */
export function postDetailHref(id: string): string {
  return `/comunidad/${encodeURIComponent(id)}`;
}

/** Recorta el cuerpo de una publicación para la tarjeta del feed. */
export function excerpt(body: string, maxLength = 220): string {
  if (body.length <= maxLength) return body;
  return `${body.slice(0, maxLength).trimEnd()}…`;
}

/** "hace 3 h", "hace 2 días" o la fecha corta si ya pasó una semana. */
export function timeAgo(isoUtc: string, now: Date = new Date()): string {
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) return isoUtc;
  const seconds = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));
  if (seconds < 60) return 'hace un momento';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? 'hace 1 día' : `hace ${days} días`;
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}
