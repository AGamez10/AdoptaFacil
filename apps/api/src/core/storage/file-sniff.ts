import { sniffImageContentType } from './image-optimizer';

/**
 * Tipo REAL de un archivo según sus primeros bytes ("números mágicos"). El tipo
 * que manda el navegador (`mimetype` de multer) y la extensión del nombre los
 * elige quien sube el archivo, así que no sirven para decidir qué se guarda ni
 * con qué tipo se sirve: un `.pdf` puede traer HTML y un `.png` un ejecutable.
 *
 * Solo reconoce lo que la plataforma acepta (PDF, fotos y video). Cualquier otra
 * cosa devuelve `null` y quien llama la rechaza.
 */
export function sniffContentType(buffer: Buffer): string | null {
  if (buffer.length >= 5 && buffer.toString('latin1', 0, 5) === '%PDF-') {
    return 'application/pdf';
  }
  const image = sniffImageContentType(buffer);
  if (image) return image;
  // ISO BMFF (MP4 y MOV): una caja `ftyp` al inicio, con la marca en los bytes 8-11.
  if (buffer.length >= 12 && buffer.toString('latin1', 4, 8) === 'ftyp') {
    return buffer.toString('latin1', 8, 12) === 'qt  ' ? 'video/quicktime' : 'video/mp4';
  }
  // WebM (Matroska): cabecera EBML.
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return 'video/webm';
  }
  return null;
}

/** Tipos que el navegador puede mostrar EN LÍNEA sin ejecutar nada de la página:
 *  el visor de PDF y las imágenes. Todo lo demás se entrega como adjunto. */
const INLINE_CONTENT_TYPES: readonly string[] = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
];

export function isInlineContentType(contentType: string): boolean {
  return INLINE_CONTENT_TYPES.includes(contentType);
}

/** Extensión que corresponde a un tipo reconocido, para nombrar lo servido. */
export const EXTENSION_BY_CONTENT_TYPE: Readonly<Record<string, string>> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};
