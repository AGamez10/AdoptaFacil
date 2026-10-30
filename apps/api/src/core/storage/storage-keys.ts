import { randomUUID } from 'node:crypto';
import type { StorageVisibility } from './storage.port';

/**
 * Storage KEY scheme + path-safety helpers (T-108). The key is the ONLY thing
 * consumers persist (`storageRef`); its shape lives here so adapters and the
 * serve endpoint agree, and NOTHING disk-specific leaks to the business modules.
 *
 * Key = `<visibility>/<organizationId>/<uuid>-<safeName>`, e.g.
 *   private/6f…/2a…-demanda.pdf   (legal document — served behind JWT+RBAC)
 *   public/6f…/9c…-firu.jpg       (animal photo — served openly)
 *
 * The uuid makes keys UNGUESSABLE; the visibility prefix lets the serve endpoint
 * pick the right access policy; the org segment scopes files per tenant on disk.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sanitize a filename to a safe key segment (no separators, lowercase). */
export function safeName(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? 'file';
  return (
    base
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'file'
  );
}

/** Build a fresh, unguessable storage key for an org asset. */
export function buildStorageKey(
  visibility: StorageVisibility,
  organizationId: string,
  filename: string,
): string {
  return `${visibility}/${organizationId}/${randomUUID()}-${safeName(filename)}`;
}

/**
 * Reject any key that could escape the tenant root (path traversal, absolute
 * paths, drive letters, NUL, backslashes). Throws — never returns a bad key.
 */
export function assertSafeRelativeKey(key: string): void {
  if (
    !key ||
    key.includes('..') ||
    key.includes('\\') ||
    key.includes('\0') ||
    key.includes(':') ||
    key.startsWith('/')
  ) {
    throw new Error('Unsafe storage key');
  }
}

/** Parse + validate a key. Returns null when malformed/unsafe (never throws). */
export function parseStorageKey(
  key: string,
): { visibility: StorageVisibility; organizationId: string } | null {
  try {
    assertSafeRelativeKey(key);
  } catch {
    return null;
  }
  const segments = key.split('/');
  if (segments.length < 3) {
    return null;
  }
  const [visibility, organizationId, ...rest] = segments;
  if (visibility !== 'public' && visibility !== 'private') {
    return null;
  }
  if (!UUID_RE.test(organizationId)) {
    return null;
  }
  if (rest.join('/').trim() === '') {
    return null;
  }
  return { visibility, organizationId };
}

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

/** Best-effort content type from the key's file extension (used on read). */
export function contentTypeFromKey(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() ?? '';
  return CONTENT_TYPE_BY_EXT[ext] ?? 'application/octet-stream';
}

/** Content types accepted on upload (images + PDF). */
export const ALLOWED_CONTENT_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
];

/**
 * Videos (portada de la plantilla Historias): solo a llaves PÚBLICAS, nunca a
 * documentos privados. Mismo límite de tamaño que cualquier archivo.
 */
export const PUBLIC_VIDEO_CONTENT_TYPES: readonly string[] = ['video/mp4', 'video/webm'];

/** ¿Se acepta este tipo de archivo para esta visibilidad? */
export function isAllowedUpload(contentType: string, visibility: StorageVisibility): boolean {
  if (ALLOWED_CONTENT_TYPES.includes(contentType)) return true;
  return visibility === 'public' && PUBLIC_VIDEO_CONTENT_TYPES.includes(contentType);
}

/**
 * Rango de bytes pedido (`Range: bytes=a-b`) sobre un archivo de `size` bytes.
 * Devuelve `null` si no hay rango (se sirve completo) y `'invalid'` si no se
 * puede cumplir (416). Solo un rango: los navegadores no piden varios para video.
 */
export function parseByteRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | 'invalid' | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === '' && match[2] === '')) return 'invalid';
  let start: number;
  let end: number;
  if (match[1] === '') {
    // Sufijo: los últimos N bytes.
    const suffix = Number(match[2]);
    if (suffix === 0) return 'invalid';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start >= size || start > end) return 'invalid';
  return { start, end };
}

/**
 * Serve URL for a persisted key. Public keys go through the CDN host when one
 * is configured (plan de escala, B2); private keys ALWAYS go to the API, where
 * JWT + RBAC + audit run before any byte leaves.
 */
export function resolveServeUrl(apiBaseUrl: string, cdnBaseUrl: string | undefined, key: string): string {
  const isPublic = key.startsWith('public/');
  const base = isPublic && cdnBaseUrl ? cdnBaseUrl : apiBaseUrl;
  return `${base}/storage/${isPublic ? 'public' : 'private'}?key=${encodeURIComponent(key)}`;
}
