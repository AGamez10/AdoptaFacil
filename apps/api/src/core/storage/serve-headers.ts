import type { Response } from 'express';
import { EXTENSION_BY_CONTENT_TYPE, isInlineContentType, sniffContentType } from './file-sniff';

/**
 * Cabeceras de un archivo subido por un usuario. El tipo sale de los BYTES (las
 * claves conservan la extensión que eligió el cliente y las fotos se recomprimen
 * a WebP), nunca del nombre. Lo que el navegador sabe mostrar sin ejecutar nada
 * (PDF, imagen, video) va `inline`, para verlo sin descargarlo; cualquier otra
 * cosa, que no debería existir tras la validación de subida, va como adjunto
 * `application/octet-stream`. `sandbox` en la CSP aísla el archivo aunque se
 * abra directo: sin scripts, sin formularios y con un origen opaco.
 */
export function setServeHeaders(res: Response, key: string, data: Buffer): void {
  const sniffed = sniffContentType(data);
  const inline = sniffed !== null && isInlineContentType(sniffed);
  res.setHeader('Content-Type', inline ? sniffed : 'application/octet-stream');
  // También lo pone el middleware global; aquí no depende de él.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${servedFilename(key, sniffed)}"`,
  );
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox; frame-ancestors 'none'");
}

/** Nombre sugerido: el saneado de la clave (sin el uuid), con la extensión real. */
export function servedFilename(key: string, contentType: string | null): string {
  const last = key.split('/').pop() ?? 'archivo';
  const name = last.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '');
  const base = name.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[^a-z0-9._-]/gi, '') || 'archivo';
  const ext = contentType ? EXTENSION_BY_CONTENT_TYPE[contentType] : undefined;
  return ext ? `${base}.${ext}` : base;
}
