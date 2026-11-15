import { COMMUNITY_MEDIA_LIMITS, type PostImageInput } from '@adoptafacil/contracts';
import type { ApiClient } from '../../../shell/api';

export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const;
export const MEDIA_ACCEPT = [...PHOTO_TYPES, ...VIDEO_TYPES].join(',');

export type MediaKind = 'image' | 'video';

export function mediaKindOf(file: { type: string }): MediaKind | null {
  if ((PHOTO_TYPES as readonly string[]).includes(file.type)) return 'image';
  if ((VIDEO_TYPES as readonly string[]).includes(file.type)) return 'video';
  return null;
}

/**
 * Revisa un archivo antes de subirlo y devuelve un mensaje claro (o `null`).
 * `current` son los que ya están elegidos, para respetar el total y el tope de videos.
 */
export function validateMedia(file: File, current: File[]): string | null {
  const kind = mediaKindOf(file);
  if (!kind) {
    return `“${file.name}” no se puede subir. Usa fotos JPG, PNG o WebP, o un video MP4, MOV o WebM.`;
  }
  if (current.length >= COMMUNITY_MEDIA_LIMITS.maxItems) {
    return `Puedes adjuntar hasta ${COMMUNITY_MEDIA_LIMITS.maxItems} archivos por publicación.`;
  }
  if (kind === 'video') {
    if (current.some((f) => mediaKindOf(f) === 'video')) {
      return 'Solo puedes adjuntar un video por publicación.';
    }
    if (file.size > COMMUNITY_MEDIA_LIMITS.maxVideoMb * 1024 * 1024) {
      return `El video pesa más de ${COMMUNITY_MEDIA_LIMITS.maxVideoMb} MB. Grábalo más corto o en menor calidad.`;
    }
  } else if (file.size > COMMUNITY_MEDIA_LIMITS.maxPhotoMb * 1024 * 1024) {
    return `La foto pesa más de ${COMMUNITY_MEDIA_LIMITS.maxPhotoMb} MB.`;
  }
  return null;
}

/** Duración de un video local, en segundos; `null` si el navegador no la lee. */
export function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    video.preload = 'metadata';
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}

/** "0:07" / "1:05" */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function toMediaInput(file: File, order: number): PostImageInput {
  return {
    filename: file.name,
    contentType: file.type as PostImageInput['contentType'],
    order,
  };
}

/** PUT de los bytes al destino reservado. Un video se comprime en el servidor. */
export async function uploadMedia(client: ApiClient, key: string, file: File): Promise<void> {
  const form = new FormData();
  form.append('file', file, file.name);
  const media = mediaKindOf(file) === 'video' ? '&media=post' : '';
  await client.request(`/storage/upload?key=${encodeURIComponent(key)}${media}`, {
    method: 'PUT',
    body: form,
  });
}
