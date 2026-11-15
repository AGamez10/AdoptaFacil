import { PORTAL_COVER_VIDEO_LIMITS, PORTAL_COVER_VIDEO_TYPES } from '@adoptafacil/contracts';
import type { ApiClient } from '../../../shell/api';

/** Peso máximo del archivo original: el servidor lo comprime antes de guardarlo. */
export const COVER_VIDEO_MAX_MB = PORTAL_COVER_VIDEO_LIMITS.maxMb;
export const COVER_VIDEO_MAX_SECONDS = PORTAL_COVER_VIDEO_LIMITS.maxSeconds;

export const COVER_VIDEO_ACCEPT = PORTAL_COVER_VIDEO_TYPES.join(',');

/** Mensaje para el dueño si el archivo no sirve; `null` si está bien. */
export function validateCoverVideo(file: File): string | null {
  if (!(PORTAL_COVER_VIDEO_TYPES as readonly string[]).includes(file.type)) {
    return 'El video debe ser MP4, WebM o MOV (el formato de la cámara del celular).';
  }
  if (file.size > COVER_VIDEO_MAX_MB * 1024 * 1024) {
    return `El video pesa más de ${COVER_VIDEO_MAX_MB} MB. Prueba con uno más corto o más liviano.`;
  }
  return null;
}

/**
 * Sube el video de portada a una llave PÚBLICA de la propia organización
 * (`POST /org/profile/uploads` + `PUT /storage/upload?media=portal`). El
 * servidor lo comprime a MP4 (hasta 720p) y le saca una imagen de portada; por
 * eso la llave siempre termina en `.mp4`, aunque el original sea MOV o WebM.
 */
export async function uploadCoverVideo(client: ApiClient, file: File): Promise<string> {
  const reserved = await client.request<{ key: string; url: string }>('/org/profile/uploads', {
    method: 'POST',
    json: { filename: 'portada.mp4', contentType: 'video/mp4' },
  });
  const form = new FormData();
  form.append('file', file, file.name);
  await client.request(`/storage/upload?key=${encodeURIComponent(reserved.key)}&media=portal`, {
    method: 'PUT',
    body: form,
  });
  return reserved.key;
}
