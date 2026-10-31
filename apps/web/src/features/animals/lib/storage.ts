import type { ApiClient } from '../../../shell/api';

/**
 * Feature-local storage helper (T-109a) for animal PHOTOS. Photos are PUBLIC
 * (served openly via GET /storage/public), so display needs no auth — only the
 * upload transfers bytes (PUT /storage/upload; the shell client attaches the JWT
 * and lets the browser set the multipart boundary for a FormData body).
 *
 * Clinical attachments (fix, T-ANIMALS-ATTACHMENTS-AUDIT) are the opposite:
 * PRIVATE objects (exam results, vaccination proof — never shown in the public
 * catalog), so they are SHOWN in place, never force-downloaded, with the shared
 * `src/lib/private-file-viewer.tsx` (Bearer fetch + type checked by bytes).
 *
 * HANDOFF(@fabian): a reusable file-upload primitive (input + validation +
 * progress) would live in packages/ui; kept local per T-109a's UI-boundary rule.
 */

/** MB ceiling — coherent with the backend STORAGE_MAX_FILE_MB default (T-108). */
export const MAX_UPLOAD_MB = 15;

/** Animal photos accept images only. */
export const PHOTO_ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

/** Clinical attachments accept PDF or images (exam results, vaccination proof,
 *  evidence photos). */
export const DOCUMENT_ACCEPT = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

/** Validate a file before uploading. Returns a plain-language error or `null`. */
export function validateUpload(
  file: File,
  accept: readonly string[] = PHOTO_ACCEPT,
  maxMb: number = MAX_UPLOAD_MB,
): string | null {
  if (!accept.includes(file.type)) {
    return accept.includes('application/pdf')
      ? 'Tipo de archivo no permitido. Sube un PDF o una imagen.'
      : 'Tipo de archivo no permitido. Sube una imagen (JPG, PNG, WEBP o GIF).';
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
