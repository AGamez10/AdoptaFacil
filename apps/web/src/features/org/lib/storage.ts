import type { ApiClient } from '../../../shell/api';

/**
 * Feature-local storage helpers (T-109a). Wire the real byte transfer to the
 * T-108 backend endpoints:
 *   - upload  → PUT /storage/upload?key=…  (multipart; the shell client attaches
 *               the JWT and, with a FormData body, lets the browser set the
 *               multipart boundary itself).
 *   - private files are SHOWN (never force-downloaded) with
 *     `src/lib/private-file-viewer.tsx`, over `ApiClient.requestBlob`.
 */

/** MB ceiling — coherent with the backend STORAGE_MAX_FILE_MB default (T-108). */
export const MAX_UPLOAD_MB = 15;

/** Legal documents accept PDF or images. */
export const DOCUMENT_ACCEPT = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

/** Profile images (logo/cover) accept images only (T-D05). */
export const IMAGE_ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

/**
 * Validate a file before uploading. Returns a plain-language error message
 * (RNF09) or `null` when the file is acceptable.
 */
export function validateUpload(
  file: File,
  accept: readonly string[],
  maxMb: number = MAX_UPLOAD_MB,
): string | null {
  if (!accept.includes(file.type)) {
    return 'Tipo de archivo no permitido. Sube un PDF o una imagen.';
  }
  if (file.size > maxMb * 1024 * 1024) {
    return `El archivo supera el límite de ${maxMb} MB.`;
  }
  return null;
}

/** PUT the file bytes to a reserved storage key (auth handled by the client). */
export async function uploadFileBytes(client: ApiClient, key: string, file: File): Promise<void> {
  const form = new FormData();
  form.append('file', file, file.name);
  await client.request(`/storage/upload?key=${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: form,
  });
}
