import sharp from 'sharp';

/**
 * Fotos que se recomprimen a WebP al subirlas: lado mayor de hasta 1600 px y,
 * si hace falta, calidad más baja hasta quedar cerca de 400 KB. El GIF no se
 * toca (puede ser animado y WebP de una sola imagen lo pierde), y los PDF y los
 * videos nunca pasan por aquí.
 */
export const OPTIMIZABLE_IMAGE_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

export const IMAGE_MAX_EDGE_PX = 1600;
export const IMAGE_TARGET_MAX_BYTES = 400 * 1024;
/** Calidades WebP a probar, de la más alta a la más baja. */
const WEBP_QUALITIES: readonly number[] = [85, 75, 65];
/** Tope de píxeles de entrada: evita decodificar imágenes gigantes. */
const INPUT_PIXEL_LIMIT = 80_000_000;

export interface OptimizedImage {
  buffer: Buffer;
  contentType: string;
}

/**
 * Devuelve la imagen recomprimida, o los bytes originales si el tipo no se
 * optimiza o si WebP no sale más pequeño. Devuelve `null` si los bytes no son
 * una imagen decodificable: quien llama debe rechazar la subida.
 */
export async function optimizeImage(
  buffer: Buffer,
  contentType: string,
): Promise<OptimizedImage | null> {
  if (!OPTIMIZABLE_IMAGE_TYPES.includes(contentType)) {
    return { buffer, contentType };
  }
  let best: Buffer;
  try {
    best = await encodeWebp(buffer);
  } catch {
    return null;
  }
  if (best.length >= buffer.length) {
    return { buffer, contentType };
  }
  return { buffer: best, contentType: 'image/webp' };
}

async function encodeWebp(buffer: Buffer): Promise<Buffer> {
  let out: Buffer = Buffer.alloc(0);
  for (const quality of WEBP_QUALITIES) {
    out = await sharp(buffer, { limitInputPixels: INPUT_PIXEL_LIMIT })
      .rotate() // respeta la orientación EXIF y, al re-codificar, quita la metadata (GPS)
      .resize({
        width: IMAGE_MAX_EDGE_PX,
        height: IMAGE_MAX_EDGE_PX,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality })
      .toBuffer();
    if (out.length <= IMAGE_TARGET_MAX_BYTES) break;
  }
  return out;
}

/**
 * Tipo real de una imagen según sus primeros bytes. Se usa al servir: las claves
 * conservan la extensión que el cliente eligió (.jpg), pero los bytes pueden ser
 * WebP tras la compresión.
 */
export function sniffImageContentType(buffer: Buffer): string | null {
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return 'image/png';
  }
  const head = buffer.toString('ascii', 0, 6);
  if (head === 'GIF87a' || head === 'GIF89a') return 'image/gif';
  return null;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
