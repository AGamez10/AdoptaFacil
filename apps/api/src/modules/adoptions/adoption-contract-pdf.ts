import {
  type PDFDocument as PDFDocumentType,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
} from 'pdf-lib';
import {
  buildAdoptionContractDocument,
  type AdoptionContractBlock,
  type AdoptionContractPayload,
  type AdoptionContractSigner,
  type AdoptionContractStatus,
} from '@adoptafacil/contracts';

/**
 * PDF del Contrato de Adopción. El TEXTO legal no vive aquí: sale de
 * `buildAdoptionContractDocument` (packages/contracts), la misma fuente que usa
 * la vista previa de la web, en la versión de plantilla con que se generó el
 * contrato (`payload.templateVersion`). Este archivo solo maqueta: párrafos,
 * cajas de datos, bloque de firmas de TODOS los firmantes y un pie con la
 * huella SHA-256 en cada página.
 */

// Las fuentes estándar de PDF solo codifican WinAnsi (Latin-1 + algunos signos).
// Cualquier otro carácter (emoji, otros alfabetos, controles) haría que pdf-lib
// lance al dibujar, así que todo texto variable pasa por `pdfSafe`.
const WIN_ANSI_EXTRA = new Set(
  Array.from('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ').map((c) => c.codePointAt(0) as number),
);

/** Normaliza y deja solo caracteres que las fuentes estándar pueden dibujar. */
export function pdfSafe(text: string): string {
  let out = '';
  for (const ch of text.normalize('NFC')) {
    const code = ch.codePointAt(0) as number;
    if (code === 0x09 || code === 0x0a || code === 0x0d) {
      out += ' ';
    } else if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) {
      out += ch;
    } else if (WIN_ANSI_EXTRA.has(code)) {
      out += ch;
    } else if (code < 0x20 || (code >= 0x7f && code < 0xa0)) {
      // controles: se eliminan
    } else {
      out += '?';
    }
  }
  return out;
}

function formatCO(isoUtc: string): string {
  return new Date(isoUtc).toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const INK = rgb(0.12, 0.12, 0.12);
const MUTED = rgb(0.4, 0.4, 0.4);
const NAVY = rgb(0.08, 0.16, 0.3);
const PAGE_SIZE: [number, number] = [595.28, 841.89]; // A4 vertical
const MARGIN = 54;
const FOOTER_SPACE = 28;
const CONTENT_WIDTH = PAGE_SIZE[0] - MARGIN * 2;
const BODY_SIZE = 10.5;
const BODY_LEADING = 14.5;

interface ContractFonts {
  serif: PDFFont;
  serifBold: PDFFont;
  sans: PDFFont;
  sansBold: PDFFont;
}

/** Word-wraps `text` to fit within `maxWidth` at `size` — pdf-lib never wraps
 *  on its own. A single word longer than the line (a hash, an email) is cut. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  const push = (word: string): void => {
    let rest = word;
    while (font.widthOfTextAtSize(rest, size) > maxWidth && rest.length > 1) {
      let cut = rest.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut -= 1;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    current = rest;
  };
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(attempt, size) <= maxWidth) {
      current = attempt;
      continue;
    }
    if (current) lines.push(current);
    push(word);
  }
  if (current) lines.push(current);
  return lines;
}

/** Cursor de escritura: abre página nueva automáticamente si el contenido no
 *  cabe, así el contrato nunca se corta a medias. */
class Cursor {
  page: PDFPage;
  y: number;
  constructor(
    private readonly pdf: PDFDocumentType,
    readonly font: ContractFonts,
  ) {
    this.page = pdf.addPage(PAGE_SIZE);
    this.y = PAGE_SIZE[1] - MARGIN;
  }

  ensureSpace(height: number): void {
    if (this.y - height < MARGIN + FOOTER_SPACE) {
      this.page = this.pdf.addPage(PAGE_SIZE);
      this.y = PAGE_SIZE[1] - MARGIN;
    }
  }

  title(text: string): void {
    const lines = wrapText(pdfSafe(text), this.font.serifBold, 16, CONTENT_WIDTH);
    this.ensureSpace(lines.length * 20 + 24);
    for (const line of lines) {
      this.page.drawText(line, {
        x: MARGIN,
        y: this.y,
        size: 16,
        font: this.font.serifBold,
        color: NAVY,
      });
      this.y -= 20;
    }
    this.y += 6;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: MARGIN + CONTENT_WIDTH, y: this.y },
      thickness: 1,
      color: NAVY,
    });
    this.y -= 22;
  }

  heading(text: string): void {
    const lines = wrapText(pdfSafe(text), this.font.sansBold, 11.5, CONTENT_WIDTH);
    this.ensureSpace(lines.length * 16 + BODY_LEADING * 2);
    for (const line of lines) {
      this.page.drawText(line, {
        x: MARGIN,
        y: this.y,
        size: 11.5,
        font: this.font.sansBold,
        color: NAVY,
      });
      this.y -= 16;
    }
    this.y -= 2;
  }

  paragraph(
    text: string,
    opts?: { indent?: number; size?: number; color?: ReturnType<typeof rgb> },
  ): void {
    const indent = opts?.indent ?? 0;
    const size = opts?.size ?? BODY_SIZE;
    const lines = wrapText(pdfSafe(text), this.font.serif, size, CONTENT_WIDTH - indent);
    for (const line of lines) {
      this.ensureSpace(BODY_LEADING);
      this.page.drawText(line, {
        x: MARGIN + indent,
        y: this.y,
        size,
        font: this.font.serif,
        color: opts?.color ?? INK,
      });
      this.y -= BODY_LEADING;
    }
  }

  /** Un ítem "Título: cuerpo" — título en negrita y el cuerpo a continuación. */
  clause(title: string, body: string): void {
    const label = `${pdfSafe(title)}: `;
    const labelWidth = this.font.sansBold.widthOfTextAtSize(label, BODY_SIZE);
    const indent = 12;
    const words = pdfSafe(body).split(/\s+/).filter(Boolean);
    let firstLine = '';
    let i = 0;
    const firstMax = CONTENT_WIDTH - indent - labelWidth;
    for (; i < words.length; i++) {
      const attempt = firstLine ? `${firstLine} ${words[i]}` : words[i];
      if (this.font.serif.widthOfTextAtSize(attempt, BODY_SIZE) > firstMax) break;
      firstLine = attempt;
    }
    this.ensureSpace(BODY_LEADING * 2);
    this.page.drawText(label, {
      x: MARGIN + indent,
      y: this.y,
      size: BODY_SIZE,
      font: this.font.sansBold,
      color: INK,
    });
    if (firstLine) {
      this.page.drawText(firstLine, {
        x: MARGIN + indent + labelWidth,
        y: this.y,
        size: BODY_SIZE,
        font: this.font.serif,
        color: INK,
      });
    }
    this.y -= BODY_LEADING;
    const rest = words.slice(i).join(' ');
    if (rest) this.paragraph(rest, { indent });
    this.y -= 3;
  }

  /** Caja gris de "Etiqueta: valor" con los valores envueltos (un estado de
   *  salud largo nunca se sale de la página). */
  fields(fields: Array<{ label: string; value: string }>): void {
    const labelWidth = 170;
    const valueWidth = CONTENT_WIDTH - labelWidth - 20;
    const rows = fields.map((f) => ({
      label: pdfSafe(`${f.label}:`),
      lines: wrapText(pdfSafe(f.value), this.font.serif, BODY_SIZE, valueWidth),
      labelLines: wrapText(pdfSafe(`${f.label}:`), this.font.sansBold, BODY_SIZE, labelWidth - 8),
    }));
    for (const row of rows) {
      const height = Math.max(row.lines.length, row.labelLines.length, 1) * BODY_LEADING + 6;
      this.ensureSpace(height);
      this.page.drawRectangle({
        x: MARGIN,
        y: this.y - height + BODY_LEADING - 2,
        width: CONTENT_WIDTH,
        height,
        color: rgb(0.97, 0.97, 0.98),
        borderColor: rgb(0.85, 0.85, 0.88),
        borderWidth: 0.5,
      });
      let y = this.y;
      for (const l of row.labelLines) {
        this.page.drawText(l, {
          x: MARGIN + 8,
          y,
          size: BODY_SIZE,
          font: this.font.sansBold,
          color: INK,
        });
        y -= BODY_LEADING;
      }
      y = this.y;
      for (const l of row.lines) {
        this.page.drawText(l, {
          x: MARGIN + labelWidth,
          y,
          size: BODY_SIZE,
          font: this.font.serif,
          color: INK,
        });
        y -= BODY_LEADING;
      }
      this.y -= height;
    }
    this.y -= 6;
  }

  block(block: AdoptionContractBlock): void {
    if (block.kind === 'paragraph') {
      this.paragraph(block.text);
      this.y -= 4;
    } else if (block.kind === 'clause') {
      this.clause(block.title, block.text);
    } else {
      this.fields(block.fields);
    }
  }

  gap(amount = 10): void {
    this.y -= amount;
  }
}

/** Incrusta una firma PNG o JPEG; `null` si los bytes no son una imagen válida
 *  (una firma rota nunca impide generar el documento). */
async function embedSignature(
  pdf: PDFDocumentType,
  bytes: Buffer | null,
): Promise<PDFImage | null> {
  if (!bytes || bytes.length < 4) return null;
  try {
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return await pdf.embedPng(bytes);
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      return await pdf.embedJpg(bytes);
    }
  } catch {
    return null;
  }
  return null;
}

export interface RenderAdoptionContractPdfInput {
  payload: AdoptionContractPayload;
  signers: AdoptionContractSigner[];
  /** Bytes de la imagen de firma por id de firmante (`null` = sin firma aún). */
  signatureImages: Record<string, Buffer | null>;
  /** Para el pie de página. */
  contractId?: string;
  status?: AdoptionContractStatus;
  contentHash?: string;
}

/**
 * Renderiza el contrato COMPLETO como PDF multipágina: texto legal de la
 * versión de plantilla del contrato, firmas de todos los firmantes (líneas en
 * blanco para los pendientes) y, en cada página, un pie con el id del
 * contrato, la versión del texto y la huella SHA-256 (o "BORRADOR" mientras no
 * está sellado, con marca de agua).
 */
export async function renderAdoptionContractPdf(
  input: RenderAdoptionContractPdfInput,
): Promise<Buffer> {
  const { payload, signers } = input;
  const doc = buildAdoptionContractDocument(payload, signers);
  const pdf = await PDFDocument.create();
  pdf.setTitle(pdfSafe(`${doc.title} — ${payload.animal.name}`));
  pdf.setSubject('Contrato de adopción');
  pdf.setProducer('AdoptaFácil');
  pdf.setCreator('AdoptaFácil');
  const font: ContractFonts = {
    serif: await pdf.embedFont(StandardFonts.TimesRoman),
    serifBold: await pdf.embedFont(StandardFonts.TimesRomanBold),
    sans: await pdf.embedFont(StandardFonts.Helvetica),
    sansBold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  // Incrustadas ANTES de dibujar (pdf-lib es async aquí).
  const images = new Map<string, PDFImage | null>();
  for (const signer of signers) {
    images.set(signer.id, await embedSignature(pdf, input.signatureImages[signer.id] ?? null));
  }

  const cursor = new Cursor(pdf, font);
  cursor.title(doc.title);

  for (const section of doc.sections) {
    cursor.heading(section.heading);
    for (const block of section.blocks) cursor.block(block);
    cursor.gap(6);
  }

  const signedDate = signers
    .map((s) => s.signedAt)
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1);
  cursor.paragraph(
    `Firmado en ${doc.signatureCity}, el ${signedDate ? formatCO(signedDate) : '______'}.`,
  );
  cursor.gap(16);

  // Bloque de firmas: dos columnas, todas las partes (incluidos testigos y
  // responsables firmantes, que la versión anterior omitía).
  const columnGap = 30;
  const blockWidth = (CONTENT_WIDTH - columnGap) / 2;
  const rowHeight = 104;
  for (let i = 0; i < signers.length; i += 2) {
    cursor.ensureSpace(rowHeight);
    const topY = cursor.y;
    for (let j = 0; j < 2 && i + j < signers.length; j++) {
      const signer = signers[i + j];
      const page = cursor.page;
      const x = MARGIN + j * (blockWidth + columnGap);
      const image = images.get(signer.id) ?? null;
      if (image && signer.signedAt) {
        const drawWidth = Math.min(140, image.width || 140);
        const drawHeight = Math.min(42, (drawWidth / (image.width || 1)) * (image.height || 42));
        page.drawImage(image, { x, y: topY - 44, width: drawWidth, height: drawHeight });
      }
      page.drawLine({
        start: { x, y: topY - 48 },
        end: { x: x + blockWidth, y: topY - 48 },
        thickness: 0.75,
        color: INK,
      });
      page.drawText(pdfSafe(doc.signerLabels[signer.role] ?? signer.role), {
        x,
        y: topY - 61,
        size: 9,
        font: font.sans,
        color: MUTED,
      });
      const nameLines = wrapText(pdfSafe(signer.fullName), font.sansBold, 10, blockWidth);
      page.drawText(nameLines[0] ?? '', {
        x,
        y: topY - 75,
        size: 10,
        font: font.sansBold,
        color: INK,
      });
      page.drawText(
        pdfSafe(
          signer.signedAt
            ? `Firma electrónica · ${formatCO(signer.signedAt)}`
            : 'Pendiente de firma',
        ),
        { x, y: topY - 88, size: 8.5, font: font.sans, color: MUTED },
      );
    }
    cursor.y = topY - rowHeight;
  }

  // Pie y marca de agua en cada página.
  const sealed = input.status === 'signed' && Boolean(input.contentHash);
  const pages = pdf.getPages();
  const idText = input.contractId ? `Contrato ${input.contractId.slice(0, 8)}` : 'Contrato';
  const versionText = `texto ${doc.templateVersion}`;
  const hashText = sealed
    ? `Huella SHA-256: ${input.contentHash}`
    : 'BORRADOR — sin sello, sin valor como contrato firmado';
  pages.forEach((page, index) => {
    const footer = pdfSafe(`${idText} · ${versionText} · página ${index + 1} de ${pages.length}`);
    page.drawText(footer, { x: MARGIN, y: 30, size: 7.5, font: font.sans, color: MUTED });
    page.drawText(pdfSafe(hashText), {
      x: MARGIN,
      y: 20,
      size: 6.5,
      font: font.sans,
      color: MUTED,
    });
    if (!sealed) {
      page.drawText('BORRADOR', {
        x: 115,
        y: 240,
        size: 80,
        font: font.sansBold,
        color: rgb(0.85, 0.85, 0.85),
        opacity: 0.35,
        rotate: degrees(40),
      });
    }
  });

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
