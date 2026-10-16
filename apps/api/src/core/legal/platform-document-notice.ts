import { PLATFORM_DOCUMENT_NOTICE } from '@adoptafacil/contracts';
import { rgb, StandardFonts, type PDFDocument } from 'pdf-lib';

const SIZE = 6;
const SIDE = 24;
/** Líneas base: por debajo de todos los pies existentes (el más bajo está en y=20). */
const BASELINES = [13, 6];

/**
 * Estampa en el borde inferior de CADA página el aviso de documento generado
 * por la plataforma (Términos, sección 15): no reemplaza contador ni revisor
 * fiscal, y el certificado tributario de donación lo expide la organización.
 * Llamar justo antes de `pdf.save()`, cuando ya existen todas las páginas.
 */
export async function stampPlatformDocumentNotice(pdf: PDFDocument): Promise<void> {
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const page of pdf.getPages()) {
    const { width } = page.getSize();
    const lines = wrap(
      PLATFORM_DOCUMENT_NOTICE,
      (t) => font.widthOfTextAtSize(t, SIZE),
      width - SIDE * 2,
    );
    lines.slice(0, BASELINES.length).forEach((line, i) => {
      const w = font.widthOfTextAtSize(line, SIZE);
      page.drawText(line, {
        x: (width - w) / 2,
        y: BASELINES[i],
        size: SIZE,
        font,
        color: rgb(0.45, 0.45, 0.45),
      });
    });
  }
}

function wrap(text: string, measure: (t: string) => number, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measure(candidate) > maxWidth) {
      lines.push(current);
      current = word;
    } else current = candidate;
  }
  if (current) lines.push(current);
  return lines;
}
