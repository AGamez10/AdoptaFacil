import { PORTAL_COVER_VIDEO_TYPES } from '@adoptafacil/contracts';
import type { ApiClient } from '../../../shell/api';

/** Tope del video de portada (Historias): el mismo límite por archivo del
 *  almacenamiento (`STORAGE_MAX_FILE_MB`, 15 MB por defecto). */
export const COVER_VIDEO_MAX_MB = 15;

export const COVER_VIDEO_ACCEPT = PORTAL_COVER_VIDEO_TYPES.join(',');

/** Mensaje para el dueño si el archivo no sirve; `null` si está bien. */
export function validateCoverVideo(file: File): string | null {
  if (!(PORTAL_COVER_VIDEO_TYPES as readonly string[]).includes(file.type)) {
    return 'El video debe ser MP4 o WebM.';
  }
  if (file.size > COVER_VIDEO_MAX_MB * 1024 * 1024) {
    return `El video pesa más de ${COVER_VIDEO_MAX_MB} MB. Prueba con uno más corto o más liviano.`;
  }
  return null;
}

/**
 * Sube el video de portada a una llave PÚBLICA de la propia organización
 * (`POST /org/profile/uploads` + `PUT /storage/upload`, el mismo camino del
 * logo y la portada) y devuelve la llave para guardarla en el tema.
 */
export async function uploadCoverVideo(client: ApiClient, file: File): Promise<string> {
  const reserved = await client.request<{ key: string; url: string }>('/org/profile/uploads', {
    method: 'POST',
    json: { filename: file.name, contentType: file.type },
  });
  const form = new FormData();
  form.append('file', file, file.name);
  await client.request(`/storage/upload?key=${encodeURIComponent(reserved.key)}`, {
    method: 'PUT',
    body: form,
  });
  return reserved.key;
}
