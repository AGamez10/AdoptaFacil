import {
  type PDFFont,
  type PDFImage,
  type PDFPage,
  PDFDocument,
  StandardFonts,
  rgb,
} from 'pdf-lib';
import QRCode from 'qrcode';
import type { LegalRepresentativeRole, OrgReportLegalEffect } from '@adoptafacil/contracts';
import type {
  DonationsReportPayload,
  OrgReportPayload,
  SocialServiceReportPayload,
} from './report-payloads';
import { SIGNER_ROLE_LABEL } from './report-legal-effect';
import { pdfText, toWinAnsi } from './report-text';

/**
 * Dibujo del PDF de un reporte (M13). Todo sale del snapshot sellado y TODA
 * variable pasa por `pdfText` antes de dibujarse. A4 apaisado: las tablas de
 * detalle tienen muchas columnas y así se leen sin letra diminuta.
 */

export interface RenderSigner {
  role: LegalRepresentativeRole;
  fullName: string;
  position: string;
  /** Bytes PNG/JPG ya descifrados, o null si no se pudieron leer. */
  image: Buffer | null;
}

export interface RenderReportInput {
  code: string;
  contentHash: string;
  createdAt: Date;
  legalEffect: OrgReportLegalEffect;
  payload: OrgReportPayload;
  signers: RenderSigner[];
  verifyUrl: string;
}

const PAGE_W = 841.89;
const PAGE_H = 595.28;
const MARGIN = 36;
const FOOTER_H = 34;

const NAVY = rgb(0.08, 0.16, 0.3);
const TEAL = rgb(0.05, 0.45, 0.42);
const INK = rgb(0.13, 0.13, 0.15);
const MUTED = rgb(0.42, 0.42, 0.45);
const LINE = rgb(0.85, 0.86, 0.88);
const ZEBRA = rgb(0.965, 0.97, 0.975);
const WHITE = rgb(1, 1, 1);

const EFFECT_STYLE: Record<
  OrgReportLegalEffect,
  { bg: ReturnType<typeof rgb>; fg: ReturnType<typeof rgb>; title: string }
> = {
  informative: {
    bg: rgb(1, 0.95, 0.85),
    fg: rgb(0.55, 0.33, 0),
    title: 'COMPROBANTE INFORMATIVO — SIN EFECTO LEGAL NI TRIBUTARIO',
  },
  signed: {
    bg: rgb(0.9, 0.94, 1),
    fg: NAVY,
    title: 'DOCUMENTO FIRMADO POR LA REPRESENTACIÓN LEGAL',
  },
  certified: {
    bg: rgb(0.88, 0.97, 0.92),
    fg: rgb(0.04, 0.4, 0.2),
    title: 'INFORME CERTIFICADO (ART. 125-2 DEL ESTATUTO TRIBUTARIO)',
  },
};

function effectExplanation(kind: OrgReportPayload['kind'], effect: OrgReportLegalEffect): string {
  if (effect === 'informative') {
    return 'Este documento resume información registrada en AdoptaFácil por la organización. No está firmado por un representante legal y no sirve como soporte legal ni tributario.';
  }
  if (effect === 'certified') {
    return 'Firmado por el representante legal y por el revisor fiscal o contador público de una ESAL con Régimen Tributario Especial vigente. Sirve como soporte de rendición de cuentas de las donaciones recibidas.';
  }
  return kind === 'social_service'
    ? 'Firmado por el representante legal. Hace constar las horas de servicio prestadas y verificadas por la organización (Resolución 4210 de 1996).'
    : 'Firmado por el representante legal de una organización formalizada. Sirve como soporte de rendición de cuentas; no reemplaza el certificado tributario de donación.';
}

const money = (n: number): string => `$ ${Math.round(n).toLocaleString('es-CO')}`;
const hours = (n: number): string => `${n.toLocaleString('es-CO', { maximumFractionDigits: 2 })} h`;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

/** Fecha corta para tablas: `08/09/2026` (hora de Colombia). */
function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
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

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const label = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('es-CO', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
}

interface Column {
  header: string;
  width: number;
  align?: 'left' | 'right';
}

/** Recorta `text` con "…" para que quepa en `maxWidth`. */
function fit(raw: string, font: PDFFont, size: number, maxWidth: number): string {
  const text = toWinAnsi(raw);
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}…`, size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = toWinAnsi(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(attempt, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = attempt;
    }
  }
  if (current) lines.push(current);
  return lines;
}

class ReportCanvas {
  page!: PDFPage;
  y = 0;
  readonly pages: PDFPage[] = [];

  constructor(
    readonly pdf: PDFDocument,
    readonly font: Fonts,
  ) {
    this.newPage();
  }

  newPage(): void {
    this.page = this.pdf.addPage([PAGE_W, PAGE_H]);
    this.pages.push(this.page);
    this.y = PAGE_H - MARGIN;
  }

  /** Garantiza `height` puntos libres sobre el pie; si no, salta de página. */
  ensure(height: number): boolean {
    if (this.y - height < MARGIN + FOOTER_H) {
      this.newPage();
      return true;
    }
    return false;
  }

  text(
    value: string,
    x: number,
    size: number,
    opts: { font?: PDFFont; color?: ReturnType<typeof rgb>; y?: number } = {},
  ): void {
    this.page.drawText(toWinAnsi(value), {
      x,
      y: opts.y ?? this.y,
      size,
      font: opts.font ?? this.font.regular,
      color: opts.color ?? INK,
    });
  }

  paragraph(
    value: string,
    x: number,
    size: number,
    maxWidth: number,
    lineHeight: number,
    font = this.font.regular,
    color = INK,
  ): void {
    for (const line of wrap(value, font, size, maxWidth)) {
      this.ensure(lineHeight);
      this.text(line, x, size, { font, color });
      this.y -= lineHeight;
    }
  }

  sectionTitle(value: string): void {
    this.ensure(40);
    this.y -= 8;
    this.text(value, MARGIN, 11.5, { font: this.font.bold, color: NAVY });
    this.y -= 6;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_W - MARGIN, y: this.y },
      thickness: 0.8,
      color: TEAL,
    });
    this.y -= 14;
  }

  table(
    columns: Column[],
    rows: string[][],
    opts: { size?: number; emptyText?: string } = {},
  ): void {
    const size = opts.size ?? 8.5;
    const rowH = size + 7;
    const totalW = columns.reduce((s, c) => s + c.width, 0);
    const scale = (PAGE_W - MARGIN * 2) / totalW;
    const widths = columns.map((c) => c.width * scale);

    const drawHeader = () => {
      this.page.drawRectangle({
        x: MARGIN,
        y: this.y - rowH + size * 0.2,
        width: PAGE_W - MARGIN * 2,
        height: rowH,
        color: NAVY,
      });
      let x = MARGIN;
      columns.forEach((col, i) => {
        const label = fit(col.header, this.font.bold, size, widths[i] - 8);
        const w = this.font.bold.widthOfTextAtSize(label, size);
        const tx = col.align === 'right' ? x + widths[i] - 4 - w : x + 4;
        this.text(label, tx, size, {
          font: this.font.bold,
          color: WHITE,
          y: this.y - rowH + 5 + size * 0.2,
        });
        x += widths[i];
      });
      this.y -= rowH;
    };

    this.ensure(rowH * 3);
    drawHeader();
    if (rows.length === 0) {
      this.y -= 4;
      this.text(opts.emptyText ?? 'Sin registros en el período.', MARGIN + 4, size + 0.5, {
        font: this.font.italic,
        color: MUTED,
        y: this.y - rowH + 5,
      });
      this.y -= rowH + 4;
      return;
    }
    rows.forEach((row, r) => {
      if (this.ensure(rowH)) drawHeader();
      if (r % 2 === 1) {
        this.page.drawRectangle({
          x: MARGIN,
          y: this.y - rowH + size * 0.2,
          width: PAGE_W - MARGIN * 2,
          height: rowH,
          color: ZEBRA,
        });
      }
      let x = MARGIN;
      columns.forEach((col, i) => {
        const label = fit(row[i] ?? '', this.font.regular, size, widths[i] - 8);
        const w = this.font.regular.widthOfTextAtSize(label, size);
        const tx = col.align === 'right' ? x + widths[i] - 4 - w : x + 4;
        this.text(label, tx, size, { y: this.y - rowH + 5 + size * 0.2 });
        x += widths[i];
      });
      this.y -= rowH;
    });
    this.page.drawLine({
      start: { x: MARGIN, y: this.y + size * 0.2 },
      end: { x: PAGE_W - MARGIN, y: this.y + size * 0.2 },
      thickness: 0.6,
      color: LINE,
    });
    this.y -= 6;
  }

  kpis(items: Array<{ label: string; value: string }>): void {
    const boxH = 46;
    this.ensure(boxH + 10);
    const gap = 10;
    const boxW = (PAGE_W - MARGIN * 2 - gap * (items.length - 1)) / items.length;
    items.forEach((item, i) => {
      const x = MARGIN + i * (boxW + gap);
      this.page.drawRectangle({
        x,
        y: this.y - boxH,
        width: boxW,
        height: boxH,
        color: ZEBRA,
        borderColor: LINE,
        borderWidth: 0.6,
      });
      this.text(fit(item.label, this.font.regular, 8.5, boxW - 16), x + 8, 8.5, {
        color: MUTED,
        y: this.y - 15,
      });
      this.text(fit(item.value, this.font.bold, 15, boxW - 16), x + 8, 15, {
        font: this.font.bold,
        color: NAVY,
        y: this.y - 36,
      });
    });
    this.y -= boxH + 12;
  }
}

function drawQr(page: PDFPage, text: string, x: number, y: number, size: number): void {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const cell = size / n;
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (qr.modules.get(row, col)) {
        page.drawRectangle({
          x: x + col * cell,
          y: y + size - (row + 1) * cell,
          width: cell + 0.15,
          height: cell + 0.15,
          color: INK,
        });
      }
    }
  }
}

function drawHeader(c: ReportCanvas, input: RenderReportInput, title: string): void {
  const { payload } = input;
  const org = payload.organization;
  const qrSize = 62;
  drawQr(c.page, input.verifyUrl, PAGE_W - MARGIN - qrSize, PAGE_H - MARGIN - qrSize, qrSize);

  const textMax = PAGE_W - MARGIN * 2 - qrSize - 20;
  c.y = PAGE_H - MARGIN - 12;
  c.text(fit(pdfText(org.name).toUpperCase(), c.font.bold, 14, textMax), MARGIN, 14, {
    font: c.font.bold,
    color: NAVY,
  });
  c.y -= 15;
  const orgLine = [
    org.nit ? `NIT ${pdfText(org.nit, 30)}` : null,
    org.city ? pdfText(org.city, 60) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  if (orgLine) {
    c.text(orgLine, MARGIN, 9.5, { color: MUTED });
    c.y -= 13;
  }
  c.text(
    `Folio ${input.code}  ·  Generado el ${formatDate(input.createdAt.toISOString())}`,
    MARGIN,
    9,
    {
      color: MUTED,
    },
  );
  c.y -= 26;
  c.text(title, MARGIN, 18, { font: c.font.bold, color: INK });
  c.y -= 16;
  c.text(
    `Período: del ${formatDay(payload.period.start)} al ${formatDay(payload.period.end)} (hora de Colombia)`,
    MARGIN,
    10.5,
    { color: MUTED },
  );
  c.y = Math.min(c.y - 14, PAGE_H - MARGIN - qrSize - 12);

  const style = EFFECT_STYLE[input.legalEffect];
  const explanation = effectExplanation(payload.kind, input.legalEffect);
  const lines = wrap(explanation, c.font.regular, 8.5, PAGE_W - MARGIN * 2 - 20);
  const boxH = 22 + lines.length * 11;
  c.page.drawRectangle({
    x: MARGIN,
    y: c.y - boxH,
    width: PAGE_W - MARGIN * 2,
    height: boxH,
    color: style.bg,
  });
  c.text(style.title, MARGIN + 10, 9.5, { font: c.font.bold, color: style.fg, y: c.y - 14 });
  lines.forEach((line, i) => {
    c.text(line, MARGIN + 10, 8.5, { color: style.fg, y: c.y - 27 - i * 11 });
  });
  c.y -= boxH + 14;
}

function drawDonations(c: ReportCanvas, p: DonationsReportPayload): void {
  c.kpis([
    { label: 'Donaciones aprobadas', value: String(p.totals.count) },
    { label: 'Valor donado', value: money(p.totals.amountCharged) },
    { label: 'Comisiones e IVA', value: money(p.totals.fees) },
    { label: 'Neto recibido por la organización', value: money(p.totals.net) },
  ]);

  c.sectionTitle('Resumen por destino');
  c.table(
    [
      { header: 'Destino de la donación', width: 60 },
      { header: 'Donaciones', width: 15, align: 'right' },
      { header: 'Neto recibido', width: 25, align: 'right' },
    ],
    p.byConcept.map((r) => [pdfText(r.concept, 120), String(r.count), money(r.net)]),
  );

  if (p.byMonth.length > 1) {
    c.sectionTitle('Resumen por mes');
    c.table(
      [
        { header: 'Mes', width: 60 },
        { header: 'Donaciones', width: 15, align: 'right' },
        { header: 'Neto recibido', width: 25, align: 'right' },
      ],
      p.byMonth.map((r) => [formatMonth(r.month), String(r.count), money(r.net)]),
    );
  }

  c.sectionTitle('Detalle de donaciones');
  c.table(
    [
      { header: 'Fecha', width: 9 },
      { header: 'Recibo', width: 8 },
      { header: 'Donante', width: 19 },
      { header: 'Documento', width: 9 },
      { header: 'Destino', width: 16 },
      { header: 'Valor donado', width: 11, align: 'right' },
      { header: 'Comisiones', width: 10, align: 'right' },
      { header: 'Neto', width: 11, align: 'right' },
      { header: 'Certificado', width: 17 },
    ],
    p.rows.map((r) => [
      formatShortDate(r.date),
      pdfText(r.receiptNo, 12),
      pdfText(r.donor, 80),
      pdfText(r.donorDocument, 20),
      pdfText(r.concept, 80),
      money(r.amountCharged),
      money(r.fees),
      money(r.net),
      pdfText(r.certificateCode, 30) || '-',
    ]),
    { emptyText: 'No hay donaciones aprobadas en este período.' },
  );
  c.y -= 4;
  c.paragraph(
    'Montos en pesos colombianos. "Neto" es lo que efectivamente recibe la organización después de la comisión de la plataforma, la de la pasarela y su IVA. Por protección de datos (Ley 1581 de 2012) los documentos de identidad se muestran parcialmente y las donaciones anónimas no revelan al donante.',
    MARGIN,
    8,
    PAGE_W - MARGIN * 2,
    11,
    c.font.italic,
    MUTED,
  );
}

function drawSocialService(c: ReportCanvas, p: SocialServiceReportPayload): void {
  c.kpis([
    { label: 'Voluntarios con horas en el período', value: String(p.totals.volunteers) },
    { label: 'Horas aprobadas en el período', value: hours(p.totals.hoursInPeriod) },
    { label: `Cumplen el mínimo de ${p.minHours} h`, value: String(p.totals.completed) },
    { label: 'Certificados emitidos', value: String(p.totals.certificates) },
  ]);

  const filterBits = [
    p.filters.studentServiceOnly ? 'solo servicio social estudiantil' : null,
    p.filters.schoolName ? `institución: ${pdfText(p.filters.schoolName, 80)}` : null,
  ].filter(Boolean);
  if (filterBits.length > 0) {
    c.paragraph(
      `Filtros aplicados: ${filterBits.join(' · ')}.`,
      MARGIN,
      9,
      PAGE_W - MARGIN * 2,
      12,
      c.font.italic,
      MUTED,
    );
    c.y -= 4;
  }

  c.sectionTitle('Resumen por institución educativa');
  c.table(
    [
      { header: 'Institución educativa', width: 60 },
      { header: 'Estudiantes / voluntarios', width: 20, align: 'right' },
      { header: 'Horas en el período', width: 20, align: 'right' },
    ],
    p.bySchool.map((r) => [pdfText(r.school, 120), String(r.volunteers), hours(r.hours)]),
  );

  c.sectionTitle('Detalle por voluntario');
  c.table(
    [
      { header: 'Voluntario', width: 17 },
      { header: 'Actividad', width: 16 },
      { header: 'Tipo', width: 9 },
      { header: 'Institución', width: 15 },
      { header: 'Convenio', width: 8 },
      { header: 'En período', width: 8, align: 'right' },
      { header: 'Acumuladas', width: 8, align: 'right' },
      { header: 'Estado', width: 13 },
      { header: 'Certificado', width: 8 },
    ],
    p.rows.map((r) => [
      pdfText(r.volunteerName, 80),
      pdfText(r.opportunity, 80),
      r.studentService ? 'Serv. social' : 'Voluntariado',
      pdfText(r.school, 80) || '-',
      pdfText(r.agreementCode, 30) || '-',
      hours(r.hoursInPeriod),
      hours(r.hoursTotal),
      pdfText(r.status, 40) + (r.pendingSessions > 0 ? ` · ${r.pendingSessions} pend.` : ''),
      pdfText(r.certificateNo, 12) || '-',
    ]),
    { emptyText: 'No hay horas aprobadas ni certificados en este período.' },
  );
  c.y -= 4;
  c.paragraph(
    `Solo se cuentan horas APROBADAS por la organización; las horas pendientes o rechazadas no suman. El servicio social estudiantil exige un mínimo de ${p.minHours} horas efectivas (Resolución 4210 de 1996, art. 6). El número de certificado permite consultar la constancia individual de cada estudiante.`,
    MARGIN,
    8,
    PAGE_W - MARGIN * 2,
    11,
    c.font.italic,
    MUTED,
  );
}

async function embedImage(pdf: PDFDocument, bytes: Buffer | null): Promise<PDFImage | null> {
  if (!bytes) return null;
  try {
    return await pdf.embedPng(bytes);
  } catch {
    try {
      return await pdf.embedJpg(bytes);
    } catch {
      return null;
    }
  }
}

/** "Revisora fiscal · T.P. 145872-T" — el cargo registrado si ya nombra el
 *  rol; si no, "Rol · cargo" (nunca "Revisor fiscal · Revisora fiscal"). */
function signerRoleLine(role: LegalRepresentativeRole, position: string): string {
  const label = SIGNER_ROLE_LABEL[role];
  const clean = pdfText(position, 80);
  if (!clean) return label;
  const keyword = label.split(' ')[0].toLowerCase().slice(0, 6);
  return clean.toLowerCase().includes(keyword) ? clean : `${label} · ${clean}`;
}

async function drawSignatures(c: ReportCanvas, input: RenderReportInput): Promise<void> {
  if (input.legalEffect === 'informative' || input.signers.length === 0) {
    c.ensure(40);
    c.y -= 10;
    c.paragraph(
      'Documento sin firmas: se genera como comprobante informativo de la gestión registrada en AdoptaFácil.',
      MARGIN,
      9,
      PAGE_W - MARGIN * 2,
      12,
      c.font.italic,
      MUTED,
    );
    return;
  }

  const statement =
    input.payload.kind === 'donations'
      ? 'Los suscritos hacen constar que la información de este informe corresponde a las donaciones recibidas por la entidad en el período indicado, tal como quedaron registradas en AdoptaFácil.'
      : 'El suscrito hace constar que las horas aquí relacionadas fueron prestadas en la organización y verificadas por ella en el período indicado.';
  const blockH = 120;
  c.ensure(blockH + 20);
  c.y -= 10;
  c.paragraph(statement, MARGIN, 9.5, PAGE_W - MARGIN * 2, 13);
  c.y -= 4;

  const images = await Promise.all(input.signers.map((s) => embedImage(c.pdf, s.image)));
  const count = input.signers.length;
  const blockW = 210;
  const gap = Math.max(20, (PAGE_W - MARGIN * 2 - blockW * count) / Math.max(1, count + 1));
  const lineY = c.y - 72;
  input.signers.forEach((signer, i) => {
    const x = MARGIN + gap + i * (blockW + gap);
    const image = images[i];
    if (image) {
      const maxW = 150;
      const maxH = 58;
      const ratio = Math.min(maxW / image.width, maxH / image.height, 1);
      const w = image.width * ratio;
      const h = image.height * ratio;
      c.page.drawImage(image, { x: x + (blockW - w) / 2, y: lineY + 3, width: w, height: h });
    }
    c.page.drawLine({
      start: { x, y: lineY },
      end: { x: x + blockW, y: lineY },
      thickness: 0.8,
      color: INK,
    });
    const name = fit(pdfText(signer.fullName, 120), c.font.bold, 10, blockW);
    const nameW = c.font.bold.widthOfTextAtSize(name, 10);
    c.text(name, x + (blockW - nameW) / 2, 10, { font: c.font.bold, y: lineY - 13 });
    const role = fit(signerRoleLine(signer.role, signer.position), c.font.regular, 8.5, blockW);
    const roleW = c.font.regular.widthOfTextAtSize(role, 8.5);
    c.text(role, x + (blockW - roleW) / 2, 8.5, { color: MUTED, y: lineY - 25 });
  });
  c.y = lineY - 40;
}

function drawFooters(c: ReportCanvas, input: RenderReportInput): void {
  const total = c.pages.length;
  c.pages.forEach((page, i) => {
    page.drawLine({
      start: { x: MARGIN, y: MARGIN + 16 },
      end: { x: PAGE_W - MARGIN, y: MARGIN + 16 },
      thickness: 0.5,
      color: LINE,
    });
    const left = fit(
      `Folio ${input.code} · SHA-256 ${input.contentHash} · Verifique en ${pdfText(input.verifyUrl, 160)}`,
      c.font.regular,
      7,
      PAGE_W - MARGIN * 2 - 80,
    );
    page.drawText(toWinAnsi(left), {
      x: MARGIN,
      y: MARGIN + 4,
      size: 7,
      font: c.font.regular,
      color: MUTED,
    });
    const right = `Página ${i + 1} de ${total}`;
    const w = c.font.regular.widthOfTextAtSize(right, 7.5);
    page.drawText(right, {
      x: PAGE_W - MARGIN - w,
      y: MARGIN + 4,
      size: 7.5,
      font: c.font.regular,
      color: MUTED,
    });
  });
}

export async function renderReportPdf(input: RenderReportInput): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const kindTitle =
    input.payload.kind === 'donations'
      ? 'Informe de donaciones recibidas'
      : 'Reporte de servicio social y voluntariado';
  pdf.setTitle(`${kindTitle} · ${input.code}`);
  pdf.setAuthor(pdfText(input.payload.organization.name));
  pdf.setProducer('AdoptaFácil');
  pdf.setCreator('AdoptaFácil');
  pdf.setCreationDate(input.createdAt);
  pdf.setModificationDate(input.createdAt);
  pdf.setSubject(`SHA-256 ${input.contentHash}`);

  const font: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
  };
  const c = new ReportCanvas(pdf, font);
  drawHeader(c, input, kindTitle);
  if (input.payload.kind === 'donations') drawDonations(c, input.payload);
  else drawSocialService(c, input.payload);
  await drawSignatures(c, input);
  drawFooters(c, input);
  return Buffer.from(await pdf.save());
}
