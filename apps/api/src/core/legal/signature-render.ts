import sharp from 'sharp';
import type { PDFDocument, PDFImage } from 'pdf-lib';

/**
 * Firma lista para dibujarse en un documento (PDF o Excel).
 *
 * La firma dibujada se guarda tal cual sale del lienzo (400×150, casi todo
 * vacío) y la foto puede traer márgenes de papel. Dibujar ese lienzo completo
 * dentro de la caja de firma dejaba el trazo diminuto, corrido a un lado y
 * flotando lejos de la línea. Aquí se recorta al trazo real para que cada
 * documento la pueda centrar y apoyar sobre la línea, igual que en pantalla.
 */
export interface RenderableSignature {
  /** PNG con fondo transparente, recortado al trazo. */
  png: Buffer;
  width: number;
  height: number;
}

const INPUT_PIXEL_LIMIT = 40_000_000;
/** Un píxel es tinta si es visible y no es (casi) blanco. */
const MIN_ALPHA = 24;
const PAPER_LEVEL = 225;
const PADDING_PX = 4;

export async function prepareSignature(
  raw: Buffer | Uint8Array | null | undefined,
): Promise<RenderableSignature | null> {
  if (!raw || raw.length < 4) return null;
  try {
    const { data, info } = await sharp(Buffer.from(raw), {
      limitInputPixels: INPUT_PIXEL_LIMIT,
      failOn: 'error',
    })
      .rotate()
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    let [minX, minY, maxX, maxY] = [width, height, -1, -1];
    let paperIsOpaque = false;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * channels;
        const alpha = data[i + 3];
        if (alpha < MIN_ALPHA) continue;
        const level = Math.min(data[i], data[i + 1], data[i + 2]);
        if (level >= PAPER_LEVEL) {
          paperIsOpaque = true;
          continue;
        }
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) {
      // Sin trazo reconocible: se respeta la imagen tal cual.
      const png = await sharp(data, { raw: { width, height, channels } }).png().toBuffer();
      return { png, width, height };
    }
    if (paperIsOpaque) {
      // Fondo de papel blanco (foto o PNG sin transparencia): el papel se
      // vuelve transparente para que la firma no tape la línea ni el texto.
      for (let p = 0; p < width * height; p++) {
        const i = p * channels;
        if (Math.min(data[i], data[i + 1], data[i + 2]) >= PAPER_LEVEL) data[i + 3] = 0;
      }
    }
    const left = Math.max(0, minX - PADDING_PX);
    const top = Math.max(0, minY - PADDING_PX);
    const w = Math.min(width, maxX + PADDING_PX + 1) - left;
    const h = Math.min(height, maxY + PADDING_PX + 1) - top;
    const png = await sharp(data, { raw: { width, height, channels } })
      .extract({ left, top, width: w, height: h })
      .png()
      .toBuffer();
    return { png, width: w, height: h };
  } catch {
    return null;
  }
}

/**
 * Tamaño con el que la firma cabe en `maxW × maxH` sin deformarse. Se permite
 * ampliar un poco (hasta `maxScale`) una firma pequeña para que se lea, sin
 * llegar a pixelarla.
 */
export function fitSignature(
  width: number,
  height: number,
  maxW: number,
  maxH: number,
  maxScale = 1.5,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const ratio = Math.min(maxW / width, maxH / height, maxScale);
  return { width: width * ratio, height: height * ratio };
}

/** Cuánto baja la firma por debajo de la línea: se superpone como una firma a mano. */
export const SIGNATURE_LINE_OVERLAP = 6;

/** Recorta e incrusta la firma; `null` si no es una imagen legible. */
export async function embedSignatureForPdf(
  pdf: PDFDocument,
  raw: Buffer | Uint8Array | null | undefined,
): Promise<PDFImage | null> {
  const prepared = await prepareSignature(raw);
  if (!prepared) return null;
  try {
    return await pdf.embedPng(Uint8Array.from(prepared.png));
  } catch {
    return null;
  }
}
