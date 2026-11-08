import sharp, { type Sharp } from 'sharp';
import { detectSignatureImageType } from '../adoptions/adoption-contract-rules';

/** Tope de la imagen de firma ya decodificada (el cuerpo JSON ya trae su propio límite). */
export const SIGNATURE_IMAGE_MAX_BYTES = 512 * 1024;
const MAX_EDGE_PX = 1000;
/** Evita decodificar imágenes gigantes ("bombas" de píxeles). */
const INPUT_PIXEL_LIMIT = 40_000_000;
/** Un píxel es tinta si es al menos este tanto más oscuro que el papel. */
const INK_FACTOR = 0.75;
const PADDING_PX = 8;

export type SignatureMethod = 'drawn' | 'photo';

/** Motivo apto para mostrar al firmante; quien llama lo convierte en 400. */
export class SignatureImageError extends Error {}

/**
 * Valida y normaliza la imagen de una firma antes de cifrarla:
 * - el tipo real sale de los bytes (PNG o JPG), no de lo que diga el cliente;
 * - se decodifica con un tope de píxeles y se re-codifica a PNG, lo que
 *   descarta metadatos (EXIF, GPS) y cualquier contenido pegado al archivo;
 * - una FOTO de la firma en papel blanco se pasa a tinta negra sobre fondo
 *   transparente y se recorta a la firma; si no hay trazo claro, se rechaza.
 */
export async function normalizeSignatureImage(
  bytes: Buffer,
  method: SignatureMethod,
): Promise<Buffer> {
  if (bytes.length === 0) throw new SignatureImageError('La firma está vacía.');
  if (bytes.length > SIGNATURE_IMAGE_MAX_BYTES) {
    throw new SignatureImageError('La imagen de la firma pesa más de 512 KB.');
  }
  if (!detectSignatureImageType(bytes)) {
    throw new SignatureImageError('La firma debe ser una imagen PNG o JPG.');
  }
  try {
    const base = sharp(bytes, { limitInputPixels: INPUT_PIXEL_LIMIT, failOn: 'error' })
      .rotate()
      .resize({ width: MAX_EDGE_PX, height: MAX_EDGE_PX, fit: 'inside', withoutEnlargement: true });
    if (method === 'drawn') return await base.png().toBuffer();
    return await photoToInk(base);
  } catch (error) {
    if (error instanceof SignatureImageError) throw error;
    throw new SignatureImageError('No pudimos leer la imagen de la firma.');
  }
}

async function photoToInk(image: Sharp): Promise<Buffer> {
  const { data, info } = await image
    .flatten({ background: '#ffffff' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  // El papel domina la foto: su tono es la mediana. Así una hoja gris por la
  // luz sigue siendo papel y solo el trazo, más oscuro, queda como tinta.
  const histogram = new Array<number>(256).fill(0);
  for (let i = 0; i < width * height; i++) histogram[data[i * channels]]++;
  let paper = 0;
  for (let seen = 0; paper < 255 && seen + histogram[paper] < (width * height) / 2; paper++) {
    seen += histogram[paper];
  }
  const cut = paper * INK_FACTOR;
  const rgba = Buffer.alloc(width * height * 4);
  let ink = 0;
  let [minX, minY, maxX, maxY] = [width, height, -1, -1];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const level = data[i * channels];
      if (level >= cut) continue;
      // Tinta negra; la opacidad crece con lo oscuro del trazo (bordes suaves).
      rgba[i * 4 + 3] = Math.min(255, Math.round(((cut - level) * 255) / (cut * 0.5)));
      ink++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const ratio = ink / (width * height);
  if (ink === 0 || ratio < 0.001 || ratio > 0.5) {
    throw new SignatureImageError(
      'No encontramos una firma clara en la foto. Usa papel blanco, tinta oscura y buena luz.',
    );
  }
  const left = Math.max(0, minX - PADDING_PX);
  const top = Math.max(0, minY - PADDING_PX);
  return sharp(rgba, { raw: { width, height, channels: 4 } })
    .extract({
      left,
      top,
      width: Math.min(width, maxX + PADDING_PX + 1) - left,
      height: Math.min(height, maxY + PADDING_PX + 1) - top,
    })
    .png()
    .toBuffer();
}
