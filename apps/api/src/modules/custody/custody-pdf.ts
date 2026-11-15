import {
  type PDFDocument as PdfDoc,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
} from 'pdf-lib';
import sharp from 'sharp';
import { stampPlatformDocumentNotice } from '../../core/legal/platform-document-notice';
import { toWinAnsi } from '../reports/report-text';

/**
 * Lienzo común de los documentos de custodia (actas, contrato, constancias,
 * estado de cuenta y reportes). Un solo motor para los siete tipos: cada
 * documento se describe como una lista de bloques y aquí solo se maqueta.
 *
 * - Encabezado institucional en la primera página: logo (si existe), nombre,
 *   NIT, dirección y contacto de la organización. Nada se inventa: lo que la
 *   organización no ha registrado simplemente no aparece.
 * - Pie en cada página: organización, documento, código y "Página X de Y".
 * - Todo texto pasa por `toWinAnsi` (las fuentes estándar no dibujan emojis).
 */

const NAVY = rgb(0.08, 0.16, 0.3);
const TEAL = rgb(0.05, 0.45, 0.42);
const INK = rgb(0.13, 0.13, 0.15);
const MUTED = rgb(0.42, 0.42, 0.45);
const LINE = rgb(0.85, 0.86, 0.88);
const PAPER = rgb(0.955, 0.965, 0.98);
const WARN_BG = rgb(1, 0.96, 0.86);
const WARN_LINE = rgb(0.85, 0.62, 0.1);

const A4: [number, number] = [595.28, 841.89];
const FOOTER_SPACE = 44;
const BODY = 10;
const LEADING = 14;

export interface CustodyPdfOrganization {
  name: string;
  legalName?: string;
  nit?: string;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
  /** Bytes del logo (cualquier formato de imagen); se omite si no se puede leer. */
  logo?: Buffer | null;
}

export interface CustodyPdfField {
  label: string;
  value: string;
}

export interface CustodyPdfColumn {
  header: string;
  /** Fracción del ancho útil (la suma de todas debe dar 1). */
  width: number;
  align?: 'left' | 'right';
  /** Columna de miniatura: la celda trae los bytes de la imagen, o null. */
  image?: boolean;
}

export type CustodyPdfCell = string | Buffer | null;

export type CustodyPdfBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string; muted?: boolean; bold?: boolean; size?: number }
  | { kind: 'fields'; items: CustodyPdfField[]; columns?: 1 | 2 }
  | { kind: 'clause'; number: string; title: string; text: string }
  | { kind: 'notice'; text: string; tone?: 'info' | 'warning' }
  | {
      kind: 'table';
      columns: CustodyPdfColumn[];
      rows: CustodyPdfCell[][];
      /** Última fila resaltada (totales). */
      totalRow?: string[];
      /** Texto cuando no hay filas. */
      empty?: string;
    }
  | { kind: 'photos'; images: Array<{ data: Buffer; caption?: string }> }
  | { kind: 'signatures'; signers: Array<{ role: string; name: string; detail?: string }> }
  | { kind: 'spacer'; size?: number };

export interface CustodyPdfSpec {
  organization: CustodyPdfOrganization;
  title: string;
  subtitle?: string;
  /** Código corto del documento (número de contrato, de constancia…). */
  code?: string;
  /** Texto de la fecha de generación, ya formateado. */
  generatedLabel: string;
  blocks: CustodyPdfBlock[];
  orientation?: 'portrait' | 'landscape';
  watermark?: string;
  /** Línea fija sobre el pie (p. ej. "No es una factura electrónica"). */
  footerNote?: string;
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
}

function clean(text: string): string {
  return toWinAnsi(text.normalize('NFC').replace(/\t/g, ' '));
}

/** Parte `text` en líneas que quepan; respeta saltos de línea y corta palabras eternas. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of clean(text).split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of words) {
      let piece = word;
      while (font.widthOfTextAtSize(piece, size) > maxWidth && piece.length > 1) {
        let cut = piece.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(piece.slice(0, cut), size) > maxWidth) cut -= 1;
        if (current) {
          lines.push(current);
          current = '';
        }
        lines.push(piece.slice(0, cut));
        piece = piece.slice(cut);
      }
      const attempt = current ? `${current} ${piece}` : piece;
      if (font.widthOfTextAtSize(attempt, size) <= maxWidth) {
        current = attempt;
      } else {
        if (current) lines.push(current);
        current = piece;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

/** Cualquier imagen → JPEG pequeño que pdf-lib sabe incrustar; null si no es imagen. */
async function toJpeg(data: Buffer, maxEdge: number, quality = 72): Promise<Buffer | null> {
  try {
    return await sharp(data, { limitInputPixels: 80_000_000 })
      .rotate()
      .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality })
      .toBuffer();
  } catch {
    return null;
  }
}

async function embed(pdf: PdfDoc, data: Buffer | null | undefined, maxEdge: number) {
  if (!data || data.length === 0) return null;
  const jpeg = await toJpeg(data, maxEdge);
  if (!jpeg) return null;
  try {
    return await pdf.embedJpg(jpeg);
  } catch {
    return null;
  }
}

class Canvas {
  page!: PDFPage;
  y = 0;
  readonly width: number;
  readonly height: number;
  readonly margin: number;
  readonly content: number;

  constructor(
    private readonly pdf: PdfDoc,
    readonly font: Fonts,
    landscape: boolean,
  ) {
    this.width = landscape ? A4[1] : A4[0];
    this.height = landscape ? A4[0] : A4[1];
    this.margin = landscape ? 36 : 50;
    this.content = this.width - this.margin * 2;
    this.newPage();
  }

  newPage(): void {
    this.page = this.pdf.addPage([this.width, this.height]);
    this.y = this.height - this.margin;
  }

  /** Abre página nueva si no caben `height` puntos. Devuelve true si la abrió. */
  ensure(height: number): boolean {
    if (this.y - height < this.margin + FOOTER_SPACE) {
      this.newPage();
      return true;
    }
    return false;
  }

  text(
    text: string,
    x: number,
    y: number,
    opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ): void {
    this.page.drawText(clean(text), {
      x,
      y,
      size: opts.size ?? BODY,
      font: opts.font ?? this.font.regular,
      color: opts.color ?? INK,
    });
  }

  lines(
    lines: string[],
    x: number,
    opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; leading?: number } = {},
  ): void {
    const leading = opts.leading ?? LEADING;
    for (const line of lines) {
      this.ensure(leading);
      this.text(line, x, this.y - (opts.size ?? BODY), opts);
      this.y -= leading;
    }
  }
}

function drawHeader(c: Canvas, spec: CustodyPdfSpec, logo: PDFImage | null): void {
  const org = spec.organization;
  const top = c.y;
  let textX = c.margin;
  const logoBox = 54;
  if (logo) {
    const scale = Math.min(logoBox / logo.width, logoBox / logo.height);
    const w = logo.width * scale;
    const h = logo.height * scale;
    c.page.drawImage(logo, { x: c.margin, y: top - h, width: w, height: h });
    textX = c.margin + logoBox + 12;
  }
  const rightWidth = 170;
  const textWidth = c.content - (textX - c.margin) - rightWidth;
  let y = top - 13;
  for (const line of wrap(org.legalName || org.name, c.font.bold, 13, textWidth).slice(0, 2)) {
    c.text(line, textX, y, { size: 13, font: c.font.bold, color: NAVY });
    y -= 16;
  }
  const details: string[] = [];
  if (org.legalName && org.legalName !== org.name) details.push(org.name);
  if (org.nit) details.push(`NIT ${org.nit}`);
  const place = [org.address, org.city].filter(Boolean).join(', ');
  if (place) details.push(place);
  const contact = [org.phone && `Tel. ${org.phone}`, org.email].filter(Boolean).join(' · ');
  if (contact) details.push(contact);
  for (const detail of details) {
    for (const line of wrap(detail, c.font.regular, 8.5, textWidth).slice(0, 2)) {
      c.text(line, textX, y + 3, { size: 8.5, color: MUTED });
      y -= 11;
    }
  }
  // Bloque derecho: código y fecha de generación.
  let ry = top - 11;
  const rx = c.width - c.margin - rightWidth;
  const right = (text: string, font: PDFFont, size: number, color = MUTED) => {
    for (const line of wrap(text, font, size, rightWidth)) {
      const w = font.widthOfTextAtSize(line, size);
      c.text(line, rx + rightWidth - w, ry, { size, font, color });
      ry -= size + 3.5;
    }
  };
  if (spec.code) right(spec.code, c.font.bold, 10, INK);
  right(spec.generatedLabel, c.font.regular, 8);

  c.y = Math.min(y, ry, top - (logo ? logoBox : 0)) - 6;
  c.page.drawLine({
    start: { x: c.margin, y: c.y },
    end: { x: c.width - c.margin, y: c.y },
    thickness: 1.2,
    color: NAVY,
  });
  c.y -= 22;

  for (const line of wrap(spec.title.toUpperCase(), c.font.bold, 14, c.content)) {
    const w = c.font.bold.widthOfTextAtSize(line, 14);
    c.text(line, c.margin + (c.content - w) / 2, c.y - 12, {
      size: 14,
      font: c.font.bold,
      color: NAVY,
    });
    c.y -= 18;
  }
  if (spec.subtitle) {
    for (const line of wrap(spec.subtitle, c.font.regular, 9.5, c.content)) {
      const w = c.font.regular.widthOfTextAtSize(line, 9.5);
      c.text(line, c.margin + (c.content - w) / 2, c.y - 9, { size: 9.5, color: MUTED });
      c.y -= 13;
    }
  }
  c.y -= 12;
}

function drawFields(c: Canvas, items: CustodyPdfField[], columns: 1 | 2): void {
  const gap = 10;
  const cellWidth = columns === 2 ? (c.content - gap) / 2 : c.content;
  const pad = 7;
  for (let i = 0; i < items.length; i += columns) {
    const row = items.slice(i, i + columns);
    const prepared = row.map((item) => ({
      label: clean(item.label).toUpperCase(),
      value: wrap(item.value || '—', c.font.regular, BODY, cellWidth - pad * 2),
    }));
    const height = Math.max(...prepared.map((p) => p.value.length)) * 13 + 22;
    c.ensure(height + 4);
    prepared.forEach((cell, index) => {
      const x = c.margin + index * (cellWidth + gap);
      c.page.drawRectangle({
        x,
        y: c.y - height,
        width: cellWidth,
        height,
        color: PAPER,
        borderColor: LINE,
        borderWidth: 0.5,
      });
      c.text(cell.label, x + pad, c.y - 11, { size: 6.5, font: c.font.bold, color: MUTED });
      let y = c.y - 24;
      for (const line of cell.value) {
        c.text(line, x + pad, y);
        y -= 13;
      }
    });
    c.y -= height + 4;
  }
  c.y -= 6;
}

function drawClause(c: Canvas, block: Extract<CustodyPdfBlock, { kind: 'clause' }>): void {
  const title = `${block.number}. ${block.title}.`;
  const titleLines = wrap(title, c.font.bold, BODY, c.content);
  c.ensure(LEADING * (titleLines.length + 2));
  c.lines(titleLines, c.margin, { font: c.font.bold, color: NAVY });
  c.lines(wrap(block.text, c.font.regular, BODY, c.content), c.margin);
  c.y -= 7;
}

function drawNotice(c: Canvas, text: string, tone: 'info' | 'warning'): void {
  const pad = 9;
  const lines = wrap(text, c.font.regular, 9, c.content - pad * 2 - 4);
  const height = lines.length * 12.5 + pad * 2 - 3;
  c.ensure(height + 8);
  c.page.drawRectangle({
    x: c.margin,
    y: c.y - height,
    width: c.content,
    height,
    color: tone === 'warning' ? WARN_BG : PAPER,
  });
  c.page.drawRectangle({
    x: c.margin,
    y: c.y - height,
    width: 3,
    height,
    color: tone === 'warning' ? WARN_LINE : TEAL,
  });
  let y = c.y - pad - 7;
  for (const line of lines) {
    c.text(line, c.margin + pad + 4, y, { size: 9 });
    y -= 12.5;
  }
  c.y -= height + 10;
}

function drawTable(
  c: Canvas,
  block: Extract<CustodyPdfBlock, { kind: 'table' }>,
  images: Map<Buffer, PDFImage | null>,
): void {
  const size = 8.5;
  const lead = 11;
  const pad = 5;
  const widths = block.columns.map((col) => col.width * c.content);
  const thumb = 30;

  const header = (): void => {
    const headerLines = block.columns.map((col, i) =>
      wrap(col.header, c.font.bold, 8, widths[i] - pad * 2),
    );
    const height = Math.max(...headerLines.map((l) => l.length)) * 10 + 9;
    c.page.drawRectangle({
      x: c.margin,
      y: c.y - height,
      width: c.content,
      height,
      color: NAVY,
    });
    let x = c.margin;
    headerLines.forEach((lines, i) => {
      let y = c.y - 11;
      for (const line of lines) {
        const w = c.font.bold.widthOfTextAtSize(line, 8);
        const tx = block.columns[i].align === 'right' ? x + widths[i] - pad - w : x + pad;
        c.text(line, tx, y, { size: 8, font: c.font.bold, color: rgb(1, 1, 1) });
        y -= 10;
      }
      x += widths[i];
    });
    c.y -= height;
  };

  c.ensure(60);
  header();

  if (block.rows.length === 0) {
    c.text(block.empty ?? 'Sin registros.', c.margin + pad, c.y - 14, { size: 9, color: MUTED });
    c.y -= 24;
    return;
  }

  block.rows.forEach((row, rowIndex) => {
    const cells = row.map((cell, i) =>
      block.columns[i].image || typeof cell !== 'string'
        ? []
        : wrap(cell, c.font.regular, size, widths[i] - pad * 2),
    );
    const hasImage = block.columns.some((col) => col.image);
    const height = Math.max(
      Math.max(...cells.map((l) => l.length), 1) * lead + 8,
      hasImage ? thumb + 8 : 0,
    );
    if (c.ensure(height)) header();
    if (rowIndex % 2 === 1) {
      c.page.drawRectangle({
        x: c.margin,
        y: c.y - height,
        width: c.content,
        height,
        color: PAPER,
      });
    }
    let x = c.margin;
    row.forEach((cell, i) => {
      if (block.columns[i].image) {
        const image = Buffer.isBuffer(cell) ? images.get(cell) : null;
        if (image) {
          const scale = Math.min(thumb / image.width, thumb / image.height);
          const w = image.width * scale;
          const h = image.height * scale;
          c.page.drawImage(image, {
            x: x + (widths[i] - w) / 2,
            y: c.y - 4 - h - (thumb - h) / 2,
            width: w,
            height: h,
          });
        } else {
          c.text('Sin foto', x + pad, c.y - height / 2 - 3, { size: 6.5, color: MUTED });
        }
      } else {
        let y = c.y - 12;
        for (const line of cells[i]) {
          const w = c.font.regular.widthOfTextAtSize(line, size);
          const tx = block.columns[i].align === 'right' ? x + widths[i] - pad - w : x + pad;
          c.text(line, tx, y, { size });
          y -= lead;
        }
      }
      x += widths[i];
    });
    c.y -= height;
    c.page.drawLine({
      start: { x: c.margin, y: c.y },
      end: { x: c.margin + c.content, y: c.y },
      thickness: 0.4,
      color: LINE,
    });
  });

  if (block.totalRow) {
    const height = 20;
    if (c.ensure(height)) header();
    c.page.drawRectangle({ x: c.margin, y: c.y - height, width: c.content, height, color: PAPER });
    let x = c.margin;
    block.totalRow.forEach((cell, i) => {
      const text = clean(cell);
      const w = c.font.bold.widthOfTextAtSize(text, 9);
      const tx = block.columns[i].align === 'right' ? x + widths[i] - pad - w : x + pad;
      c.text(text, tx, c.y - 13.5, { size: 9, font: c.font.bold, color: NAVY });
      x += widths[i];
    });
    c.y -= height;
  }
  c.y -= 12;
}

function drawPhotos(
  c: Canvas,
  photos: Array<{ data: Buffer; caption?: string }>,
  images: Map<Buffer, PDFImage | null>,
): void {
  const perRow = 3;
  const gap = 10;
  const box = (c.content - gap * (perRow - 1)) / perRow;
  const usable = photos.filter((p) => images.get(p.data));
  for (let i = 0; i < usable.length; i += perRow) {
    const row = usable.slice(i, i + perRow);
    const height = box * 0.75 + 16;
    c.ensure(height + 6);
    row.forEach((photo, index) => {
      const image = images.get(photo.data) as PDFImage;
      const x = c.margin + index * (box + gap);
      const maxH = box * 0.75;
      const scale = Math.min(box / image.width, maxH / image.height);
      const w = image.width * scale;
      const h = image.height * scale;
      c.page.drawRectangle({
        x,
        y: c.y - maxH,
        width: box,
        height: maxH,
        color: PAPER,
        borderColor: LINE,
        borderWidth: 0.5,
      });
      c.page.drawImage(image, {
        x: x + (box - w) / 2,
        y: c.y - maxH + (maxH - h) / 2,
        width: w,
        height: h,
      });
      if (photo.caption) {
        const caption = wrap(photo.caption, c.font.regular, 7.5, box)[0] ?? '';
        c.text(caption, x, c.y - maxH - 10, { size: 7.5, color: MUTED });
      }
    });
    c.y -= height + 6;
  }
  c.y -= 4;
}

function drawSignatures(
  c: Canvas,
  signers: Array<{ role: string; name: string; detail?: string }>,
): void {
  const gap = 36;
  const width = (c.content - gap) / 2;
  const height = 96;
  for (let i = 0; i < signers.length; i += 2) {
    c.ensure(height);
    const top = c.y;
    signers.slice(i, i + 2).forEach((signer, index) => {
      const x = c.margin + index * (width + gap);
      c.page.drawLine({
        start: { x, y: top - 46 },
        end: { x: x + width, y: top - 46 },
        thickness: 0.75,
        color: INK,
      });
      c.text(signer.role, x, top - 58, { size: 8, color: MUTED });
      c.text(wrap(signer.name || ' ', c.font.bold, 10, width)[0] ?? '', x, top - 71, {
        font: c.font.bold,
      });
      if (signer.detail) {
        c.text(wrap(signer.detail, c.font.regular, 8.5, width)[0] ?? '', x, top - 83, {
          size: 8.5,
          color: MUTED,
        });
      }
    });
    c.y = top - height;
  }
}

/** Dibuja el documento completo y devuelve sus bytes. */
export async function renderCustodyPdf(spec: CustodyPdfSpec): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(clean(`${spec.title} - ${spec.organization.name}`));
  pdf.setSubject(clean(spec.title));
  pdf.setProducer('AdoptaFácil');
  pdf.setCreator('AdoptaFácil');
  const font: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
  };

  // Imágenes incrustadas ANTES de dibujar (pdf-lib es asíncrono aquí) y de una
  // en una, para no tener todas descomprimidas a la vez.
  const images = new Map<Buffer, PDFImage | null>();
  for (const block of spec.blocks) {
    if (block.kind === 'photos') {
      for (const photo of block.images) images.set(photo.data, await embed(pdf, photo.data, 900));
    } else if (block.kind === 'table') {
      for (const row of block.rows) {
        for (const cell of row) {
          if (Buffer.isBuffer(cell)) images.set(cell, await embed(pdf, cell, 96));
        }
      }
    }
  }
  const logo = await embed(pdf, spec.organization.logo, 240);

  const c = new Canvas(pdf, font, spec.orientation === 'landscape');
  drawHeader(c, spec, logo);

  for (const block of spec.blocks) {
    switch (block.kind) {
      case 'heading': {
        c.ensure(46);
        c.y -= 4;
        c.text(block.text.toUpperCase(), c.margin, c.y - 9, {
          size: 9.5,
          font: font.bold,
          color: TEAL,
        });
        c.y -= 14;
        c.page.drawLine({
          start: { x: c.margin, y: c.y },
          end: { x: c.margin + c.content, y: c.y },
          thickness: 0.5,
          color: LINE,
        });
        c.y -= 9;
        break;
      }
      case 'paragraph': {
        const size = block.size ?? BODY;
        c.lines(
          wrap(block.text, block.bold ? font.bold : font.regular, size, c.content),
          c.margin,
          {
            size,
            font: block.bold ? font.bold : font.regular,
            color: block.muted ? MUTED : INK,
            leading: size + 4,
          },
        );
        c.y -= 6;
        break;
      }
      case 'fields':
        drawFields(c, block.items, block.columns ?? 2);
        break;
      case 'clause':
        drawClause(c, block);
        break;
      case 'notice':
        drawNotice(c, block.text, block.tone ?? 'info');
        break;
      case 'table':
        drawTable(c, block, images);
        break;
      case 'photos':
        drawPhotos(c, block.images, images);
        break;
      case 'signatures':
        drawSignatures(c, block.signers);
        break;
      case 'spacer':
        c.y -= block.size ?? 10;
        break;
    }
  }

  const pages = pdf.getPages();
  const left = [spec.organization.name, spec.title, spec.code].filter(Boolean).join(' · ');
  pages.forEach((page, index) => {
    const { width } = page.getSize();
    const margin = c.margin;
    page.drawLine({
      start: { x: margin, y: 40 },
      end: { x: width - margin, y: 40 },
      thickness: 0.4,
      color: LINE,
    });
    const pageText = `Página ${index + 1} de ${pages.length}`;
    const pageWidth = font.regular.widthOfTextAtSize(pageText, 7.5);
    const leftText = wrap(left, font.regular, 7.5, width - margin * 2 - pageWidth - 16)[0] ?? '';
    page.drawText(leftText, { x: margin, y: 30, size: 7.5, font: font.regular, color: MUTED });
    page.drawText(pageText, {
      x: width - margin - pageWidth,
      y: 30,
      size: 7.5,
      font: font.regular,
      color: MUTED,
    });
    if (spec.footerNote) {
      const note = wrap(spec.footerNote, font.italic, 6.5, width - margin * 2)[0] ?? '';
      page.drawText(note, { x: margin, y: 21, size: 6.5, font: font.italic, color: MUTED });
    }
    if (spec.watermark) {
      page.drawText(clean(spec.watermark), {
        x: width / 2 - 190,
        y: page.getSize().height / 2 - 120,
        size: 78,
        font: font.bold,
        color: rgb(0.85, 0.85, 0.85),
        opacity: 0.35,
        rotate: degrees(40),
      });
    }
  });

  await stampPlatformDocumentNotice(pdf);
  return Buffer.from(await pdf.save());
}
