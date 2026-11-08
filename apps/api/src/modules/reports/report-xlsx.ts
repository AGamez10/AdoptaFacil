import * as ExcelJS from 'exceljs';
import QRCode from 'qrcode';
import {
  PLATFORM_DOCUMENT_NOTICE,
  type OrgReportLegalEffect,
  type OrgReportSigner,
} from '@adoptafacil/contracts';
import type {
  AccountingReportPayload,
  DonationsReportPayload,
  OrgReportPayload,
  SocialServiceReportPayload,
} from './report-payloads';
import { SIGNER_ROLE_LABEL } from './report-legal-effect';
import {
  paymentTypeLabel,
  reportBanner,
  reportTitle,
  signatureStatement,
  signerRoleLine,
} from './report-pdf';
import { sheetText } from './report-text';
import { fitSignature, prepareSignature } from '../../core/legal/signature-render';

/**
 * Versión Excel del reporte (para el contador o el colegio), salida del mismo
 * snapshot sellado que el PDF y con su MISMO diseño:
 *
 * - Hoja "Reporte": el documento tal como se ve en el PDF (encabezado con QR,
 *   franja de valor legal, indicadores, tablas, constancia y FIRMAS con su
 *   imagen apoyada sobre la línea), lista para imprimir en A4 apaisado a una
 *   página de ancho.
 * - Hojas de datos ("Donaciones", "Libro auxiliar", "Voluntarios"…): las mismas
 *   filas como tabla con filtros, para sumar y cruzar.
 *
 * Toda celda de texto pasa por `sheetText` (nunca se evalúa como fórmula); los
 * montos y horas van como números reales para que se puedan sumar y filtrar.
 */

export interface RenderXlsxSigner extends OrgReportSigner {
  /** Bytes PNG/JPG ya descifrados de la firma aprobada; null si no aplica. */
  image?: Buffer | null;
}

export interface RenderXlsxInput {
  code: string;
  contentHash: string;
  createdAt: Date;
  legalEffect: OrgReportLegalEffect;
  payload: OrgReportPayload;
  signers: RenderXlsxSigner[];
  verifyUrl: string;
  /** Borrador sin emitir (faltan firmas o fue rechazado). */
  draft?: 'pending_signatures' | 'rejected';
}

/* ── Paleta: la misma del PDF ─────────────────────────────────────────── */
const NAVY = 'FF14294D';
const TEAL = 'FF0D736B';
const INK = 'FF212126';
const MUTED = 'FF6B6B73';
const LINE = 'FFD9DBE0';
const ZEBRA = 'FFF6F7F9';
const WHITE = 'FFFFFFFF';
const FONT = 'Arial';

const BANNER: Record<OrgReportLegalEffect | 'draft', { bg: string; fg: string }> = {
  informative: { bg: 'FFFFF2D9', fg: 'FF8C5400' },
  signed: { bg: 'FFE6F0FF', fg: NAVY },
  certified: { bg: 'FFE0F7EB', fg: 'FF0A6633' },
  draft: { bg: 'FFFFEBEB', fg: 'FF991A1A' },
};

const MONEY = '"$" #,##0;-"$" #,##0';
const HOURS = '#,##0.##" h";-#,##0.##" h";"0 h"';
const INT = '#,##0';
const DATE = 'dd/mm/yyyy';
const DATETIME = 'dd/mm/yyyy hh:mm';

type CellValue = string | number | Date | null;
type Fmt = 'money' | 'hours' | 'int' | 'date' | 'datetime' | 'text';
const NUM_FMT: Record<Exclude<Fmt, 'text'>, string> = {
  money: MONEY,
  hours: HOURS,
  int: INT,
  date: DATE,
  datetime: DATETIME,
};

interface Col {
  header: string;
  /** Peso relativo del ancho (mismos pesos que el PDF). */
  width: number;
  fmt?: Fmt;
  /** Solo hoja de datos: clave estable. */
  key?: string;
}

function colombiaDate(iso: string): Date {
  // Excel no maneja zonas horarias: se guarda la fecha/hora de Colombia.
  return new Date(new Date(iso).getTime() - 5 * 3600_000);
}

function formatDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('es-CO', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const label = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('es-CO', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const thin = (argb: string): Partial<ExcelJS.Border> => ({ style: 'thin', color: { argb } });

/** Ancho aproximado en píxeles de una columna de Excel (ancho en caracteres). */
const colPx = (chars: number) => Math.round(chars * 7 + 5);
/** Alto en píxeles de una fila (alto en puntos). */
const rowPx = (pt: number) => Math.round((pt * 96) / 72);
const EMU_PER_PX = 9525;

/**
 * Hoja "Reporte": el documento con el mismo diseño del PDF sobre una cuadrícula
 * de N columnas (las de la tabla de detalle). Las tablas más angostas funden
 * columnas para ocupar el mismo ancho.
 */
class DocumentSheet {
  r = 1;
  readonly n: number;
  readonly widths: number[];
  private readonly rowHeights = new Map<number, number>();

  constructor(
    readonly wb: ExcelJS.Workbook,
    readonly ws: ExcelJS.Worksheet,
    weights: number[],
    totalChars = 150,
  ) {
    const sum = weights.reduce((a, b) => a + b, 0);
    this.widths = weights.map((w) => Math.max(8, Math.round((w / sum) * totalChars)));
    this.n = weights.length;
    this.widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  }

  private height(row: number, pt: number): void {
    this.ws.getRow(row).height = pt;
    this.rowHeights.set(row, pt);
  }

  /** Funde [c1..c2] de la fila y devuelve la celda principal ya con estilo. */
  merged(
    row: number,
    c1: number,
    c2: number,
    value: CellValue,
    style: {
      font?: Partial<ExcelJS.Font>;
      fill?: string;
      align?: 'left' | 'right' | 'center';
      wrap?: boolean;
      fmt?: string;
      border?: Partial<ExcelJS.Borders>;
      valign?: 'top' | 'middle' | 'bottom';
    } = {},
  ): ExcelJS.Cell {
    if (c2 > c1) this.ws.mergeCells(row, c1, row, c2);
    const cell = this.ws.getCell(row, c1);
    cell.value = value;
    cell.font = { name: FONT, size: 10, color: { argb: INK }, ...style.font };
    cell.alignment = {
      horizontal: style.align ?? 'left',
      vertical: style.valign ?? 'middle',
      wrapText: style.wrap ?? false,
      indent: style.align === 'right' || style.align === 'center' ? 0 : 1,
    };
    if (style.fmt) cell.numFmt = style.fmt;
    for (let c = c1; c <= c2; c++) {
      const each = this.ws.getCell(row, c);
      if (style.fill) {
        each.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.fill } };
      }
      if (style.border) {
        each.border = {
          ...(style.border.top ? { top: style.border.top } : {}),
          ...(style.border.bottom ? { bottom: style.border.bottom } : {}),
          ...(c === c1 && style.border.left ? { left: style.border.left } : {}),
          ...(c === c2 && style.border.right ? { right: style.border.right } : {}),
        };
      }
    }
    return cell;
  }

  /** Alto de fila para un texto envuelto en [c1..c2] (Excel no ajusta celdas fundidas). */
  private wrappedHeight(text: string, c1: number, c2: number, size: number): number {
    let chars = 0;
    for (let c = c1; c <= c2; c++) chars += this.widths[c - 1];
    const perLine = Math.max(10, Math.floor(chars * (10 / size) * 1.15));
    const lines = Math.max(
      1,
      text
        .split('\n')
        .reduce((acc, part) => acc + Math.ceil(Math.max(1, part.length) / perLine), 0),
    );
    return Math.ceil(lines * size * 1.4 + 6);
  }

  gap(pt = 8): void {
    this.height(this.r, pt);
    this.r++;
  }

  async header(input: RenderXlsxInput): Promise<void> {
    const { payload } = input;
    const org = payload.organization;
    const last = Math.max(1, this.n - 2);
    this.merged(this.r, 1, last, sheetText(org.name).toUpperCase(), {
      font: { bold: true, size: 15, color: { argb: NAVY } },
    });
    this.height(this.r++, 22);
    const orgLine = [
      org.nit ? `NIT ${sheetText(org.nit)}` : null,
      org.city ? sheetText(org.city) : null,
    ]
      .filter(Boolean)
      .join(' · ');
    if (orgLine) {
      this.merged(this.r, 1, last, orgLine, { font: { size: 10, color: { argb: MUTED } } });
      this.height(this.r++, 15);
    }
    this.merged(
      this.r,
      1,
      last,
      `Folio ${input.code}  ·  Generado el ${formatDate(input.createdAt)}`,
      { font: { size: 9.5, color: { argb: MUTED } } },
    );
    this.height(this.r++, 15);
    this.gap(6);
    this.merged(this.r, 1, last, reportTitle(payload.kind), {
      font: { bold: true, size: 18, color: { argb: INK } },
    });
    this.height(this.r++, 28);
    this.merged(
      this.r,
      1,
      last,
      `Período: del ${formatDay(payload.period.start)} al ${formatDay(payload.period.end)} (hora de Colombia)`,
      { font: { size: 10.5, color: { argb: MUTED } } },
    );
    this.height(this.r++, 16);

    // QR de verificación arriba a la derecha, como en el PDF.
    try {
      const qr = await QRCode.toBuffer(input.verifyUrl, {
        errorCorrectionLevel: 'M',
        margin: 0,
        width: 220,
      });
      const id = this.wb.addImage({ buffer: qr as unknown as ExcelJS.Buffer, extension: 'png' });
      const size = 92;
      const totalPx = this.widths.reduce((s, w) => s + colPx(w), 0);
      this.place(id, totalPx - size - 4, 2, 1, size, size);
    } catch {
      // Sin QR antes que sin documento: el enlace va igual en el pie.
    }
    this.gap(10);

    const banner = reportBanner(payload.kind, input.legalEffect, input.draft);
    const colors = BANNER[input.draft ? 'draft' : input.legalEffect];
    this.merged(this.r, 1, this.n, banner.title, {
      fill: colors.bg,
      font: { bold: true, size: 10, color: { argb: colors.fg } },
      valign: 'bottom',
    });
    this.height(this.r++, 20);
    this.merged(this.r, 1, this.n, banner.explanation, {
      fill: colors.bg,
      font: { size: 9, color: { argb: colors.fg } },
      wrap: true,
      valign: 'top',
    });
    this.height(this.r, this.wrappedHeight(banner.explanation, 1, this.n, 9) + 4);
    this.r++;
    this.gap(12);
  }

  /** Reparte N columnas en `parts` tramos lo más parejos posible. */
  private spans(parts: number): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    const base = Math.floor(this.n / parts);
    let extra = this.n - base * parts;
    let c = 1;
    for (let i = 0; i < parts; i++) {
      const w = base + (extra-- > 0 ? 1 : 0);
      out.push([c, c + w - 1]);
      c += w;
    }
    return out;
  }

  kpis(items: Array<{ label: string; value: number | string; fmt?: Fmt }>): void {
    const spans = this.spans(items.length);
    const labelRow = this.r;
    const valueRow = this.r + 1;
    items.forEach((item, i) => {
      const [c1, c2] = spans[i];
      const side = { left: thin(LINE), right: thin(LINE) };
      this.merged(labelRow, c1, c2, sheetText(item.label), {
        fill: ZEBRA,
        font: { size: 9, color: { argb: MUTED } },
        border: { top: thin(LINE), ...side },
        valign: 'bottom',
      });
      this.merged(
        valueRow,
        c1,
        c2,
        typeof item.value === 'string' ? sheetText(item.value) : item.value,
        {
          fill: ZEBRA,
          font: { bold: true, size: 16, color: { argb: NAVY } },
          border: { bottom: thin(LINE), ...side },
          fmt: item.fmt && item.fmt !== 'text' ? NUM_FMT[item.fmt] : undefined,
          align: 'left',
        },
      );
    });
    this.height(labelRow, 22);
    this.height(valueRow, 30);
    this.r += 2;
    this.gap(12);
  }

  section(title: string): void {
    this.gap(6);
    this.merged(this.r, 1, this.n, title, {
      font: { bold: true, size: 12, color: { argb: NAVY } },
      border: { bottom: { style: 'medium', color: { argb: TEAL } } },
      valign: 'bottom',
    });
    this.height(this.r++, 22);
    this.gap(6);
  }

  /**
   * Tabla con el estilo del PDF: encabezado azul, filas cebra y bordes finos.
   * Una tabla de k columnas sobre N: la primera funde las columnas que sobran.
   */
  table(cols: Col[], rows: CellValue[][], emptyText = 'Sin registros en el período.'): void {
    const k = cols.length;
    const spans: Array<[number, number]> = [];
    let c = 1;
    cols.forEach((_, i) => {
      const w = i === 0 ? this.n - (k - 1) : 1;
      spans.push([c, c + w - 1]);
      c += w;
    });
    const isNum = (f?: Fmt) => f !== undefined && f !== 'text';
    cols.forEach((col, i) => {
      this.merged(this.r, spans[i][0], spans[i][1], col.header, {
        fill: NAVY,
        font: { bold: true, size: 9, color: { argb: WHITE } },
        align: isNum(col.fmt) ? 'right' : 'left',
        wrap: true,
      });
    });
    this.height(this.r++, 30);
    if (rows.length === 0) {
      this.merged(this.r, 1, this.n, emptyText, {
        font: { italic: true, size: 9, color: { argb: MUTED } },
        border: { bottom: thin(LINE) },
      });
      this.height(this.r++, 20);
      this.gap(6);
      return;
    }
    rows.forEach((row, r) => {
      cols.forEach((col, i) => {
        const raw = row[i];
        const value = typeof raw === 'string' ? sheetText(raw) : raw;
        this.merged(this.r, spans[i][0], spans[i][1], value ?? '-', {
          fill: r % 2 === 1 ? ZEBRA : undefined,
          font: { size: 9 },
          align: isNum(col.fmt) && value !== null ? 'right' : 'left',
          fmt: col.fmt && col.fmt !== 'text' ? NUM_FMT[col.fmt] : undefined,
          border: { bottom: thin(LINE) },
        });
      });
      this.height(this.r++, 17);
    });
    this.gap(6);
  }

  note(text: string, opts: { italic?: boolean; size?: number; color?: string } = {}): void {
    const size = opts.size ?? 8.5;
    this.merged(this.r, 1, this.n, sheetText(text, 2000), {
      font: { italic: opts.italic ?? true, size, color: { argb: opts.color ?? MUTED } },
      wrap: true,
      valign: 'top',
    });
    this.height(this.r, this.wrappedHeight(text, 1, this.n, size));
    this.r++;
  }

  /** Imagen en (x, fila) con medidas en píxeles, anclada a celda (no se deforma). */
  place(
    imageId: number,
    xPx: number,
    row: number,
    yOffsetPx: number,
    widthPx: number,
    heightPx: number,
  ): void {
    let col = 0;
    let x = Math.max(0, xPx);
    while (col < this.n - 1 && x >= colPx(this.widths[col])) {
      x -= colPx(this.widths[col]);
      col++;
    }
    this.ws.addImage(imageId, {
      tl: {
        nativeCol: col,
        nativeColOff: Math.round(x * EMU_PER_PX),
        nativeRow: row - 1,
        nativeRowOff: Math.round(Math.max(0, yOffsetPx) * EMU_PER_PX),
      } as unknown as ExcelJS.Anchor,
      ext: { width: widthPx, height: heightPx },
      editAs: 'oneCell',
    });
  }

  async signatures(input: RenderXlsxInput): Promise<void> {
    this.gap(10);
    if (input.draft) {
      const names = input.signers
        .map((s) => `${sheetText(s.fullName)} (${SIGNER_ROLE_LABEL[s.role]})`)
        .join('; ');
      this.note(
        input.draft === 'rejected'
          ? 'Un firmante rechazó este documento: no se emitirá. Genera uno nuevo después de corregirlo.'
          : `Pendiente de la aprobación de: ${names || 'los firmantes requeridos'}.`,
        { italic: false, size: 9.5, color: INK },
      );
      return;
    }
    if (input.legalEffect === 'informative' || input.signers.length === 0) {
      this.note(
        'Documento sin firmas: se genera como comprobante informativo de la gestión registrada en AdoptaFácil.',
        { size: 9.5 },
      );
      return;
    }
    const statement = signatureStatement(input.payload.kind);
    // Constancia + firmas (~ texto, aire, firma, nombre y cargo) en la misma hoja impresa.
    this.keepTogether(this.wrappedHeight(statement, 1, this.n, 10) + 8 + 54 + 18 + 15);
    this.note(statement, { italic: false, size: 10, color: INK });
    this.gap(8);

    const count = input.signers.length;
    // Bloques parejos; con más de uno, cada línea deja una columna de aire.
    const blocks =
      count === 1
        ? [this.centered(Math.max(3, Math.round(this.n / 3)))]
        : this.spans(count).map(([c1, c2]): [number, number] =>
            c2 - c1 >= 2 ? [c1, c2 - 1] : [c1, c2],
          );
    const imageRow = this.r;
    const imageRowPt = 54;
    this.height(imageRow, imageRowPt);
    const prepared = await Promise.all(input.signers.map((s) => prepareSignature(s.image)));
    input.signers.forEach((signer, i) => {
      const [c1, c2] = blocks[i];
      this.merged(imageRow, c1, c2, '', {
        border: { bottom: { style: 'thin', color: { argb: INK } } },
      });
      this.merged(imageRow + 1, c1, c2, sheetText(signer.fullName), {
        font: { bold: true, size: 10 },
        align: 'center',
      });
      this.merged(imageRow + 2, c1, c2, sheetText(signerRoleLine(signer.role, signer.position)), {
        font: { size: 9, color: { argb: MUTED } },
        align: 'center',
      });
      const sig = prepared[i];
      if (!sig) return;
      let startPx = 0;
      for (let c = 1; c < c1; c++) startPx += colPx(this.widths[c - 1]);
      let blockPx = 0;
      for (let c = c1; c <= c2; c++) blockPx += colPx(this.widths[c - 1]);
      const size = fitSignature(
        sig.width,
        sig.height,
        Math.min(230, blockPx - 12),
        rowPx(imageRowPt) - 4,
      );
      const w = Math.round(size.width);
      const h = Math.round(size.height);
      const id = this.wb.addImage({
        buffer: sig.png as unknown as ExcelJS.Buffer,
        extension: 'png',
      });
      // Apoyada sobre la línea (borde inferior de la fila), que la cruza apenas.
      this.place(id, startPx + (blockPx - w) / 2, imageRow, rowPx(imageRowPt) - h + 6, w, h);
    });
    this.height(imageRow + 1, 18);
    this.height(imageRow + 2, 15);
    this.r = imageRow + 3;
  }

  /**
   * Si un bloque de `blockPt` puntos quedaría partido entre dos hojas impresas
   * (A4 apaisado, ajustado a una página de ancho), salta de página antes.
   */
  private keepTogether(blockPt: number): void {
    const totalPx = this.widths.reduce((sum, w) => sum + colPx(w), 0);
    const printableWPx = (11.69 - 0.8) * 96;
    const printableHPt = (8.27 - 1.1 - 0.3) * 72;
    const scale = Math.min(1, printableWPx / totalPx);
    const pageHPt = printableHPt / scale;
    let used = 0;
    for (let row = 1; row < this.r; row++) used += this.rowHeights.get(row) ?? 15;
    const pos = used % pageHPt;
    if (pos > 0 && pos + blockPt > pageHPt) this.ws.getRow(this.r - 1).addPageBreak();
  }

  private centered(span: number): [number, number] {
    const c1 = 1 + Math.floor((this.n - span) / 2);
    return [c1, c1 + span - 1];
  }

  footer(input: RenderXlsxInput): void {
    this.gap(14);
    this.merged(
      this.r,
      1,
      this.n,
      `Folio ${input.code} · SHA-256 ${input.contentHash} · Verifique en ${sheetText(input.verifyUrl)}`,
      { font: { size: 8, color: { argb: MUTED } }, border: { top: thin(LINE) }, wrap: true },
    );
    this.height(this.r++, 26);
    this.note(PLATFORM_DOCUMENT_NOTICE, { italic: false, size: 7.5 });
  }

  /** Impresión: A4 apaisado, una página de ancho, sin cuadrícula. */
  finish(code: string): void {
    this.ws.views = [{ showGridLines: false, zoomScale: 100 }];
    this.ws.pageSetup = {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.2, footer: 0.25 },
      printArea: `A1:${this.ws.getColumn(this.n).letter}${this.r}`,
    };
    this.ws.headerFooter = {
      oddFooter: `&L&8&K6B6B73Folio ${code}&R&8&K6B6B73Página &P de &N`,
    };
  }
}

/* ── Contenido por tipo (mismo orden y textos que el PDF) ─────────────── */

const DONATION_COLS: Col[] = [
  { header: 'Fecha', width: 9, fmt: 'date' },
  { header: 'Recibo', width: 8 },
  { header: 'Donante', width: 19 },
  { header: 'Documento', width: 9 },
  { header: 'Destino', width: 16 },
  { header: 'Valor donado', width: 11, fmt: 'money' },
  { header: 'Tarifa MP', width: 10, fmt: 'money' },
  { header: 'Neto', width: 11, fmt: 'money' },
  { header: 'Certificado', width: 17 },
];

const ACCOUNTING_COLS: Col[] = [
  { header: 'Folio', width: 6, fmt: 'int' },
  { header: 'Fecha', width: 9, fmt: 'date' },
  { header: 'Tipo', width: 10 },
  { header: 'Destinación', width: 15 },
  { header: 'Forma de pago', width: 13 },
  { header: 'Pago en pasarela', width: 12 },
  { header: 'Bruto', width: 10, fmt: 'money' },
  { header: 'Comisión', width: 8, fmt: 'money' },
  { header: 'Neto', width: 9, fmt: 'money' },
  { header: 'Ajuste', width: 8 },
];

const SOCIAL_COLS: Col[] = [
  { header: 'Voluntario', width: 16 },
  { header: 'Actividad', width: 14 },
  { header: 'Tipo', width: 8 },
  { header: 'Institución', width: 13 },
  { header: 'Convenio', width: 7 },
  { header: 'Jornadas', width: 6, fmt: 'int' },
  { header: 'Aprobadas', width: 7, fmt: 'hours' },
  { header: 'Por aprobar', width: 7, fmt: 'hours' },
  { header: 'Acumuladas', width: 7, fmt: 'hours' },
  { header: 'Estado', width: 9 },
  { header: 'Certificado', width: 6 },
];

function drawDonations(d: DocumentSheet, p: DonationsReportPayload): void {
  d.kpis([
    { label: 'Donaciones aprobadas', value: p.totals.count, fmt: 'int' },
    { label: 'Valor donado', value: p.totals.amountCharged, fmt: 'money' },
    { label: 'Tarifa de Mercado Pago e IVA', value: p.totals.fees, fmt: 'money' },
    { label: 'Neto recibido por la organización', value: p.totals.net, fmt: 'money' },
  ]);
  d.section('Resumen por destino');
  d.table(
    [
      { header: 'Destino de la donación', width: 60 },
      { header: 'Donaciones', width: 15, fmt: 'int' },
      { header: 'Neto recibido', width: 25, fmt: 'money' },
    ],
    p.byConcept.map((r) => [r.concept, r.count, r.net]),
  );
  if (p.byMonth.length > 1) {
    d.section('Resumen por mes');
    d.table(
      [
        { header: 'Mes', width: 60 },
        { header: 'Donaciones', width: 15, fmt: 'int' },
        { header: 'Neto recibido', width: 25, fmt: 'money' },
      ],
      p.byMonth.map((r) => [formatMonth(r.month), r.count, r.net]),
    );
  }
  d.section('Detalle de donaciones');
  d.table(
    DONATION_COLS,
    p.rows.map((r) => [
      colombiaDate(r.date),
      r.receiptNo,
      r.donor,
      r.donorDocument,
      r.concept,
      r.amountCharged,
      r.fees,
      r.net,
      r.certificateCode || null,
    ]),
    'No hay donaciones aprobadas en este período.',
  );
  d.note(
    'Montos en pesos colombianos. "Neto" es lo que efectivamente recibe la organización después de la tarifa de Mercado Pago y su IVA; AdoptaFácil no cobra comisión por donación. Las donaciones reembolsadas o contracargadas no se cuentan. Por protección de datos (Ley 1581 de 2012) los documentos de identidad se muestran parcialmente y las donaciones anónimas no revelan al donante.',
  );
}

function drawAccounting(d: DocumentSheet, p: AccountingReportPayload): void {
  const t = p.totals;
  d.kpis([
    { label: `Donaciones del mes (${t.donationCount})`, value: t.donationsGrossCop, fmt: 'money' },
    { label: 'Reembolsos y contracargos', value: t.refundsCop + t.chargebacksCop, fmt: 'money' },
    { label: 'Tarifa de Mercado Pago', value: t.feesCop, fmt: 'money' },
    { label: 'Neto informado por la pasarela', value: t.netCop, fmt: 'money' },
  ]);
  d.section('Cierre y conciliación');
  d.note(
    `Mes cerrado el ${formatDate(new Date(p.close.closedAt))}. Último folio del libro: ${p.close.lastSeq}. ` +
      `Huella SHA-256 de los renglones: ${p.close.entriesHash}. ` +
      (p.reconciliation.balanced
        ? 'La conciliación contra Mercado Pago cuadró sin descuadres.'
        : `La conciliación contra Mercado Pago tenía descuadres al cerrar: ${p.reconciliation.counts.missing_in_gateway} faltan en Mercado Pago, ${p.reconciliation.counts.missing_in_platform} faltan en AdoptaFácil, ${p.reconciliation.counts.status_mismatch} con otro estado y ${p.reconciliation.counts.amount_mismatch} con otro monto.`) +
      (p.close.note ? ` Nota de la organización: ${p.close.note}` : ''),
    { italic: false, size: 9.5, color: INK },
  );
  d.section('Resumen por destinación');
  d.table(
    [
      { header: 'Destinación', width: 70 },
      { header: 'Valor (bruto, neto de reversos)', width: 30, fmt: 'money' },
    ],
    [
      ['Libre (sin destinación)', t.byDestination.general],
      ['Para un animal', t.byDestination.animal],
      ['Para una campaña', t.byDestination.campaign],
    ],
  );
  d.section('Libro auxiliar del mes');
  d.table(
    ACCOUNTING_COLS,
    p.rows.map((r) => [
      r.seq,
      colombiaDate(r.occurredAt),
      r.type,
      r.destination,
      paymentTypeLabel(r.paymentType),
      r.gatewayPaymentId || null,
      r.gross,
      r.fee,
      r.net,
      r.adjustment || null,
    ]),
    'No hubo movimientos en este mes.',
  );
  d.note(
    'Montos en pesos colombianos. Las donaciones suman y los reembolsos y contracargos restan. La comisión es la que informó la pasarela y la asume la organización; AdoptaFácil no cobra comisión por donación ni recibe el dinero. "-" significa que la pasarela no informó el dato. Este libro es un auxiliar de apoyo: la contabilidad oficial, los estados financieros y las declaraciones le corresponden al contador o revisor fiscal.',
  );
}

function drawSocialService(d: DocumentSheet, p: SocialServiceReportPayload): void {
  d.kpis([
    { label: 'Voluntarios con horas en el período', value: p.totals.volunteers, fmt: 'int' },
    { label: 'Horas aprobadas en el período', value: p.totals.hoursInPeriod, fmt: 'hours' },
    ...(p.totals.pendingHoursInPeriod
      ? [
          {
            label: 'Horas por aprobar',
            value: p.totals.pendingHoursInPeriod,
            fmt: 'hours' as const,
          },
        ]
      : []),
    { label: `Cumplen el mínimo de ${p.minHours} h`, value: p.totals.completed, fmt: 'int' },
    { label: 'Certificados emitidos', value: p.totals.certificates, fmt: 'int' },
  ]);
  const filterBits = [
    p.filters.studentServiceOnly ? 'solo servicio social estudiantil' : null,
    p.filters.schoolName ? `institución: ${p.filters.schoolName}` : null,
  ].filter(Boolean);
  if (filterBits.length > 0) d.note(`Filtros aplicados: ${filterBits.join(' · ')}.`, { size: 9 });
  d.section('Resumen por institución educativa');
  d.table(
    [
      { header: 'Institución educativa', width: 60 },
      { header: 'Estudiantes / voluntarios', width: 20, fmt: 'int' },
      { header: 'Horas en el período', width: 20, fmt: 'hours' },
    ],
    p.bySchool.map((r) => [r.school, r.volunteers, r.hours]),
  );
  d.section('Detalle por voluntario');
  d.table(
    SOCIAL_COLS,
    p.rows.map((r) => [
      r.volunteerName,
      r.opportunity,
      r.studentService ? 'Serv. social' : 'Voluntariado',
      r.school || null,
      r.agreementCode || null,
      r.sessionsInPeriod ?? null,
      r.hoursInPeriod,
      r.pendingHoursInPeriod ?? null,
      r.hoursTotal,
      r.status + (r.pendingSessions > 0 ? ` · ${r.pendingSessions} pend.` : ''),
      r.certificateNo || null,
    ]),
    'Nadie registró horas ni recibió certificado en este período.',
  );
  if (p.anonymizedWithoutConsent && p.anonymizedWithoutConsent > 0) {
    d.note(
      `${p.anonymizedWithoutConsent} persona(s) figuran sin nombre, institución ni fotos porque no han autorizado el uso de sus datos en este tipo de documentos; sus horas sí se cuentan.`,
    );
  }
  if (p.omittedWithoutConsent && p.omittedWithoutConsent > 0) {
    d.note(
      `No se incluyen ${p.omittedWithoutConsent} voluntario(s) que no han autorizado el uso de sus datos en este tipo de documentos.`,
    );
  }
  d.note(
    `"Aprobadas" son las horas que la organización ya verificó; "Por aprobar" son horas registradas por el voluntario que aún no se deciden y no suman al total acumulado. Las rechazadas no figuran. El servicio social estudiantil exige un mínimo de ${p.minHours} horas efectivas (Resolución 4210 de 1996, art. 6). El número de certificado permite consultar la constancia individual de cada estudiante.`,
  );
}

/* ── Hojas de datos (tabla filtrable, con el mismo estilo) ────────────── */

interface DataCol {
  header: string;
  key: string;
  width: number;
  fmt?: Fmt;
}

function dataSheet(
  wb: ExcelJS.Workbook,
  name: string,
  cols: DataCol[],
  rows: Array<Record<string, CellValue | undefined>>,
  code: string,
  extraNotes: string[] = [],
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
  });
  ws.columns = cols.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
    style: {
      font: { name: FONT, size: 10, color: { argb: INK } },
      ...(c.fmt && c.fmt !== 'text' ? { numFmt: NUM_FMT[c.fmt] } : {}),
    },
  }));
  const head = ws.getRow(1);
  head.height = 32;
  cols.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.font = { name: FONT, bold: true, size: 10, color: { argb: WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = {
      vertical: 'middle',
      wrapText: true,
      horizontal: c.fmt && c.fmt !== 'text' ? 'right' : 'left',
    };
    cell.border = { bottom: thin(NAVY) };
  });
  rows.forEach((values, r) => {
    const row = ws.addRow(
      Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, typeof v === 'string' ? sheetText(v) : v]),
      ),
    );
    row.height = 18;
    cols.forEach((_, i) => {
      const cell = row.getCell(i + 1);
      cell.border = { bottom: thin(LINE) };
      cell.alignment = { vertical: 'middle' };
      if (r % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
      }
    });
  });
  for (const note of extraNotes) {
    const row = ws.addRow([sheetText(note)]);
    row.getCell(1).font = { name: FONT, italic: true, size: 9, color: { argb: MUTED } };
  }
  const lastCol = ws.getColumn(cols.length).letter;
  ws.autoFilter = { from: 'A1', to: `${lastCol}1` };
  ws.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: '1:1',
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.2, footer: 0.25 },
  };
  ws.headerFooter = {
    oddHeader: `&L&9&K14294D${name}&R&8&K6B6B73Folio ${code}`,
    oddFooter: '&R&8&K6B6B73Página &P de &N',
  };
  return ws;
}

export async function renderReportXlsx(input: RenderXlsxInput): Promise<Buffer> {
  const { payload } = input;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AdoptaFácil';
  wb.created = input.createdAt;
  wb.title = `${reportTitle(payload.kind)} · ${input.code}`;
  wb.subject = `SHA-256 ${input.contentHash}`;

  const cols =
    payload.kind === 'donations'
      ? DONATION_COLS
      : payload.kind === 'accounting'
        ? ACCOUNTING_COLS
        : SOCIAL_COLS;
  const doc = new DocumentSheet(
    wb,
    wb.addWorksheet('Reporte', {
      properties: { tabColor: { argb: NAVY } },
    }),
    cols.map((c) => c.width),
  );
  await doc.header(input);
  if (payload.kind === 'donations') drawDonations(doc, payload);
  else if (payload.kind === 'accounting') drawAccounting(doc, payload);
  else drawSocialService(doc, payload);
  await doc.signatures(input);
  doc.footer(input);
  doc.finish(input.code);

  if (payload.kind === 'donations') {
    dataSheet(
      wb,
      'Donaciones',
      [
        { header: 'Fecha', key: 'date', width: 18, fmt: 'datetime' },
        { header: 'Recibo', key: 'receipt', width: 12 },
        { header: 'Donante', key: 'donor', width: 32 },
        { header: 'Documento', key: 'doc', width: 14 },
        { header: 'Destino', key: 'concept', width: 34 },
        { header: 'Valor donado', key: 'amount', width: 15, fmt: 'money' },
        { header: 'Tarifa de Mercado Pago e IVA', key: 'fees', width: 16, fmt: 'money' },
        { header: 'Neto recibido', key: 'net', width: 15, fmt: 'money' },
        { header: 'Certificado', key: 'cert', width: 24 },
      ],
      payload.rows.map((r) => ({
        date: colombiaDate(r.date),
        receipt: r.receiptNo,
        donor: r.donor,
        doc: r.donorDocument,
        concept: r.concept,
        amount: r.amountCharged,
        fees: r.fees,
        net: r.net,
        cert: r.certificateCode,
      })),
      input.code,
    );
    dataSheet(
      wb,
      'Por destino',
      [
        { header: 'Destino', key: 'concept', width: 40 },
        { header: 'Donaciones', key: 'count', width: 12, fmt: 'int' },
        { header: 'Neto recibido', key: 'net', width: 16, fmt: 'money' },
      ],
      payload.byConcept.map((r) => ({ concept: r.concept, count: r.count, net: r.net })),
      input.code,
    );
  } else if (payload.kind === 'accounting') {
    dataSheet(
      wb,
      'Libro auxiliar',
      [
        { header: 'Folio', key: 'seq', width: 8, fmt: 'int' },
        { header: 'Fecha', key: 'date', width: 18, fmt: 'datetime' },
        { header: 'Tipo', key: 'type', width: 14 },
        { header: 'Destinación', key: 'destination', width: 30 },
        { header: 'Forma de pago', key: 'paymentType', width: 18 },
        { header: 'Pago en pasarela', key: 'payment', width: 18 },
        { header: 'Bruto', key: 'gross', width: 14, fmt: 'money' },
        { header: 'Comisión', key: 'fee', width: 12, fmt: 'money' },
        { header: 'Neto', key: 'net', width: 14, fmt: 'money' },
        { header: 'Ajuste', key: 'adjustment', width: 18 },
      ],
      payload.rows.map((r) => ({
        seq: r.seq,
        date: colombiaDate(r.occurredAt),
        type: r.type,
        destination: r.destination,
        paymentType: r.paymentType,
        payment: r.gatewayPaymentId,
        gross: r.gross,
        fee: r.fee,
        net: r.net,
        adjustment: r.adjustment,
      })),
      input.code,
    );
  } else {
    const notes: string[] = [];
    if (payload.anonymizedWithoutConsent && payload.anonymizedWithoutConsent > 0) {
      notes.push(
        `${payload.anonymizedWithoutConsent} persona(s) figuran sin nombre por no autorizar el uso de sus datos; sus horas sí se cuentan.`,
      );
    }
    if (payload.omittedWithoutConsent && payload.omittedWithoutConsent > 0) {
      notes.push(
        `No se incluyen ${payload.omittedWithoutConsent} voluntario(s) sin autorización de uso de datos.`,
      );
    }
    dataSheet(
      wb,
      'Voluntarios',
      [
        { header: 'Voluntario', key: 'name', width: 30 },
        { header: 'Actividad', key: 'opportunity', width: 30 },
        { header: 'Tipo', key: 'type', width: 16 },
        { header: 'Institución educativa', key: 'school', width: 30 },
        { header: 'Convenio', key: 'agreement', width: 14 },
        { header: 'Horas en el período', key: 'period', width: 13, fmt: 'hours' },
        { header: 'Horas totales', key: 'total', width: 13, fmt: 'hours' },
        { header: 'Sesiones pendientes', key: 'pending', width: 13, fmt: 'int' },
        { header: 'Estado', key: 'status', width: 26 },
        { header: 'Certificado', key: 'cert', width: 14 },
        { header: 'Jornadas en el período', key: 'sessions', width: 13, fmt: 'int' },
        { header: 'Horas por aprobar', key: 'pendingHours', width: 13, fmt: 'hours' },
        { header: 'Fotos de la jornada', key: 'photos', width: 12, fmt: 'int' },
      ],
      payload.rows.map((r) => ({
        name: r.volunteerName,
        opportunity: r.opportunity,
        type: r.studentService ? 'Servicio social' : 'Voluntariado',
        school: r.school,
        agreement: r.agreementCode,
        period: r.hoursInPeriod,
        total: r.hoursTotal,
        pending: r.pendingSessions,
        status: r.status,
        cert: r.certificateNo,
        sessions: r.sessionsInPeriod,
        pendingHours: r.pendingHoursInPeriod,
        photos: r.photos?.length ?? 0,
      })),
      input.code,
      notes,
    );
    dataSheet(
      wb,
      'Por institución',
      [
        { header: 'Institución educativa', key: 'school', width: 40 },
        { header: 'Estudiantes / voluntarios', key: 'volunteers', width: 14, fmt: 'int' },
        { header: 'Horas en el período', key: 'hours', width: 14, fmt: 'hours' },
      ],
      payload.bySchool.map((r) => ({ school: r.school, volunteers: r.volunteers, hours: r.hours })),
      input.code,
    );
  }

  const bytes = await wb.xlsx.writeBuffer();
  return Buffer.from(bytes as ArrayBuffer);
}
