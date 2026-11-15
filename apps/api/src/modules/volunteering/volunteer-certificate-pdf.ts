import {
  degrees,
  type PDFDocument,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB,
  rgb,
  StandardFonts,
} from 'pdf-lib';
import type { VolunteerCertificate, VolunteerCertificateTemplate } from '@adoptafacil/contracts';
import { drawQr } from '../reports/report-pdf';
import { SIGNATURE_LINE_OVERLAP, fitSignature } from '../../core/legal/signature-render';

/**
 * PDF del certificado de voluntariado: dos plantillas con el MISMO contenido
 * verificable (código público + QR a `/verificar/<código>`, firma congelada,
 * NIT y ciudad de la organización) y anexos con la bitácora en tabla y el
 * registro fotográfico de la jornada.
 *
 *  - `huellitas`: cálida, con los colores de la marca y huellitas: lo que un
 *    voluntario quiere mostrar.
 *  - `clasica`: diploma formal (marfil, azul y dorado) para colegios y
 *    empresas.
 *
 * Todo texto variable llega ya saneado para WinAnsi (fuentes estándar).
 * Nada se dibuja por debajo de y=26: ahí va el aviso de la plataforma.
 */

export interface CertificateSigner {
  fullName: string;
  position: string;
  isLegalRepresentative: boolean;
}

export interface CertificatePhoto {
  image: PDFImage;
  /** "12 de noviembre de 2026". */
  caption: string;
}

export interface CertificatePdfInput {
  template: VolunteerCertificateTemplate;
  row: VolunteerCertificate;
  signer: CertificateSigner | null;
  signatureImage: PDFImage | null;
  logo: PDFImage | null;
  city?: string;
  nit?: string;
  /** Código público; ausente solo si algo impidió leerlo (nunca se inventa). */
  verificationCode?: string;
  verifyUrl?: string;
  photos: CertificatePhoto[];
  /** Fotos registradas en total (puede haber más de las que se imprimen). */
  totalPhotos: number;
}

interface Fonts {
  serif: PDFFont;
  serifBold: PDFFont;
  serifItalic: PDFFont;
  serifBoldItalic: PDFFont;
  sans: PDFFont;
  sansBold: PDFFont;
  sansOblique: PDFFont;
}

interface Palette {
  primary: RGB;
  primaryDark: RGB;
  accent: RGB;
  accentDark: RGB;
  ink: RGB;
  muted: RGB;
  paper: RGB;
  soft: RGB;
}

const WHITE = rgb(1, 1, 1);
const DANGER = rgb(0.7, 0.1, 0.1);

const PALETTES: Record<VolunteerCertificateTemplate, Palette> = {
  // Marca AdoptaFácil: teal + coral sobre blanco.
  huellitas: {
    primary: rgb(0.112, 0.588, 0.525),
    primaryDark: rgb(0.06, 0.36, 0.33),
    accent: rgb(1, 0.54, 0.4),
    accentDark: rgb(0.82, 0.36, 0.24),
    ink: rgb(0.12, 0.17, 0.24),
    muted: rgb(0.4, 0.44, 0.48),
    paper: rgb(1, 1, 1),
    soft: rgb(0.93, 0.98, 0.97),
  },
  // Diploma: azul noche + dorado sobre marfil.
  clasica: {
    primary: rgb(0.1, 0.19, 0.34),
    primaryDark: rgb(0.06, 0.12, 0.24),
    accent: rgb(0.72, 0.56, 0.22),
    accentDark: rgb(0.55, 0.41, 0.13),
    ink: rgb(0.13, 0.13, 0.13),
    muted: rgb(0.4, 0.4, 0.4),
    paper: rgb(0.995, 0.985, 0.955),
    soft: rgb(0.97, 0.95, 0.9),
  },
};

const LANDSCAPE: [number, number] = [841.89, 595.28];
const PORTRAIT: [number, number] = [595.28, 841.89];
/** Línea más baja permitida (debajo va el aviso de la plataforma). */
const SAFE_BOTTOM = 28;

export async function embedCertificateFonts(pdf: PDFDocument): Promise<Fonts> {
  return {
    serif: await pdf.embedFont(StandardFonts.TimesRoman),
    serifBold: await pdf.embedFont(StandardFonts.TimesRomanBold),
    serifItalic: await pdf.embedFont(StandardFonts.TimesRomanItalic),
    serifBoldItalic: await pdf.embedFont(StandardFonts.TimesRomanBoldItalic),
    sans: await pdf.embedFont(StandardFonts.Helvetica),
    sansBold: await pdf.embedFont(StandardFonts.HelveticaBold),
    sansOblique: await pdf.embedFont(StandardFonts.HelveticaOblique),
  };
}

export async function renderVolunteerCertificate(
  pdf: PDFDocument,
  input: CertificatePdfInput,
): Promise<void> {
  const font = await embedCertificateFonts(pdf);
  const palette = PALETTES[input.template];
  if (input.template === 'clasica') {
    drawClassicPage(pdf, font, palette, input);
  } else {
    drawPawsPage(pdf, font, palette, input);
  }
  if (input.row.bitacora.length > 0) {
    drawBitacoraAnnex(pdf, font, palette, input);
  }
  if (input.photos.length > 0) {
    drawPhotoAnnex(pdf, font, palette, input);
  }
}

// ---------------------------------------------------------------------------
// Texto común (mismo contenido en las dos plantillas)
// ---------------------------------------------------------------------------

/** Un instante (p. ej. la emisión) en hora Colombia. */
export function formatCO(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Un día calendario guardado como medianoche UTC (fecha de sesión, inicio y
 *  fin de la jornada). En hora Colombia caería el día ANTERIOR: se lee en UTC. */
export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** "20 horas" / "1 hora" / "2,5 horas". */
export function hoursLabel(hours: number): string {
  const value = Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace('.', ',');
  return `${value} ${hours === 1 ? 'hora' : 'horas'}`;
}

function signerRoleOf(signer: CertificateSigner | null): string {
  // Una ESAL formalizada certifica por medio de su representante legal; un
  // grupo informal o en proceso, por medio de su responsable. Sin firmante
  // congelado (certificado antiguo) no se supone ninguna figura.
  if (!signer) return 'quien firma por la organización';
  return signer.isLegalRepresentative ? 'su representante legal' : 'su responsable';
}

function certificateTitle(row: VolunteerCertificate): string {
  return row.appliesToStudentService
    ? 'Constancia de Servicio Social Estudiantil'
    : 'Certificado de Voluntariado';
}

function bodyText(row: VolunteerCertificate): string {
  const guardian = row.guardianName
    ? ` con la autorización de su acudiente ${row.guardianName}` +
      (row.guardianDocument ? ` (documento ${row.guardianDocument})` : '') +
      ','
    : '';
  const period =
    row.periodStart.slice(0, 10) === row.periodEnd.slice(0, 10)
      ? `el ${formatDay(row.periodStart)}`
      : `entre el ${formatDay(row.periodStart)} y el ${formatDay(row.periodEnd)}`;
  const sessions = row.bitacora.length;
  const sessionsText =
    sessions > 0 ? ` en ${sessions} ${sessions === 1 ? 'jornada' : 'jornadas'}` : '';
  return (
    `participó como voluntario(a) en "${row.opportunityTitle}",${guardian} ${period}, ` +
    `y completó ${hoursLabel(row.totalApprovedHours)} de servicio${sessionsText}, ` +
    'verificadas y aprobadas por la organización.'
  );
}

function studentServiceText(row: VolunteerCertificate): string | null {
  if (!row.appliesToStudentService) return null;
  return (
    'Válido como servicio social estudiantil obligatorio (Resolución 4210 de 1996, art. 6°).' +
    (row.schoolName
      ? ` Institución educativa: ${row.schoolName}` +
        (row.schoolAgreementCode ? ` (convenio ${row.schoolAgreementCode})` : '') +
        '.'
      : '')
  );
}

function issuedText(row: VolunteerCertificate, city?: string): string {
  return city
    ? `Expedido en ${city}, el ${formatCO(row.issuedAt)}`
    : `Expedido el ${formatCO(row.issuedAt)}`;
}

function disclaimerText(row: VolunteerCertificate, signer: CertificateSigner | null): string {
  return (
    `Expide: ${row.organizationName}, por medio de ${signerRoleOf(signer)}. AdoptaFácil genera el ` +
    'documento con lo que registró la organización; no lo certifica ni lo firma.'
  );
}

// ---------------------------------------------------------------------------
// Primitivas de dibujo
// ---------------------------------------------------------------------------

export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
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

/** Recorta con "…" para que quepa en `maxWidth`. */
export function fitWidth(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut.trimEnd()}…`;
}

/** Tamaño de letra que hace caber `text` en una línea, entre `min` y `max`. */
function fitSize(text: string, font: PDFFont, max: number, min: number, maxWidth: number): number {
  let size = max;
  while (size > min && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.5;
  return size;
}

function centerX(page: PDFPage, text: string, font: PDFFont, size: number, cx?: number): number {
  const mid = cx ?? page.getWidth() / 2;
  return mid - font.widthOfTextAtSize(text, size) / 2;
}

function drawCentered(
  page: PDFPage,
  text: string,
  y: number,
  font: PDFFont,
  size: number,
  color: RGB,
  cx?: number,
): void {
  page.drawText(text, { x: centerX(page, text, font, size, cx), y, size, font, color });
}

function drawParagraph(
  page: PDFPage,
  text: string,
  y: number,
  opts: {
    font: PDFFont;
    size: number;
    maxWidth: number;
    lineHeight: number;
    color: RGB;
    cx?: number;
  },
): number {
  let cursor = y;
  for (const line of wrapText(text, opts.font, opts.size, opts.maxWidth)) {
    drawCentered(page, line, cursor, opts.font, opts.size, opts.color, opts.cx);
    cursor -= opts.lineHeight;
  }
  return cursor;
}

function rule(
  page: PDFPage,
  cx: number,
  y: number,
  width: number,
  color: RGB,
  thickness = 1,
): void {
  page.drawLine({
    start: { x: cx - width / 2, y },
    end: { x: cx + width / 2, y },
    thickness,
    color,
  });
}

/** Huellita: almohadilla + 4 dedos, rotable. */
export function drawPaw(
  page: PDFPage,
  cx: number,
  cy: number,
  size: number,
  color: RGB,
  opacity: number,
  rotation = 0,
): void {
  const rad = (rotation * Math.PI) / 180;
  const place = (dx: number, dy: number) => ({
    x: cx + (dx * Math.cos(rad) - dy * Math.sin(rad)) * size,
    y: cy + (dx * Math.sin(rad) + dy * Math.cos(rad)) * size,
  });
  const pad = place(0, -0.18);
  page.drawEllipse({
    ...pad,
    xScale: 0.34 * size,
    yScale: 0.27 * size,
    color,
    opacity,
    rotate: degrees(rotation),
  });
  for (const [dx, dy] of [
    [-0.4, 0.2],
    [-0.15, 0.42],
    [0.15, 0.42],
    [0.4, 0.2],
  ] as const) {
    page.drawEllipse({
      ...place(dx, dy),
      xScale: 0.12 * size,
      yScale: 0.155 * size,
      color,
      opacity,
      rotate: degrees(rotation + dx * -40),
    });
  }
}

/** Logo de la organización dentro de un círculo; sin logo, sus iniciales. */
function drawLogoBadge(
  page: PDFPage,
  input: CertificatePdfInput,
  font: Fonts,
  cx: number,
  cy: number,
  radius: number,
  ring: RGB,
  fill: RGB,
  initialsColor: RGB,
): void {
  page.drawCircle({ x: cx, y: cy, size: radius, color: fill, borderColor: ring, borderWidth: 2 });
  if (input.logo) {
    const box = radius * 1.35;
    const scale = Math.min(box / input.logo.width, box / input.logo.height);
    const w = input.logo.width * scale;
    const h = input.logo.height * scale;
    page.drawImage(input.logo, { x: cx - w / 2, y: cy - h / 2, width: w, height: h });
    return;
  }
  const initials =
    input.row.organizationName
      .split(/\s+/)
      .filter((w) => w.length > 2 || /^[A-Z]/.test(w))
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || 'AF';
  const size = radius * 0.8;
  drawCentered(page, initials, cy - size * 0.35, font.serifBold, size, initialsColor, cx);
}

/** Bloque de firma: imagen sobre la línea, nombre, cargo y organización. */
function drawSignatureBlock(
  page: PDFPage,
  input: CertificatePdfInput,
  font: Fonts,
  palette: Palette,
  x: number,
  lineY: number,
  width: number,
): void {
  const { signer, signatureImage, row } = input;
  const cx = x + width / 2;
  if (signatureImage) {
    const size = fitSignature(signatureImage.width, signatureImage.height, width - 30, 54);
    page.drawImage(signatureImage, {
      x: cx - size.width / 2,
      y: lineY - SIGNATURE_LINE_OVERLAP / 2,
      width: size.width,
      height: size.height,
    });
  } else {
    // Sin firma registrada no se simula una: el documento lo dice de frente.
    drawCentered(
      page,
      signer
        ? 'Firma no verificable: el certificado queda sin firma'
        : 'SIN FIRMA: emitido antes de congelar el firmante',
      lineY + 12,
      font.sansBold,
      7.5,
      DANGER,
      cx,
    );
  }
  page.drawLine({
    start: { x, y: lineY },
    end: { x: x + width, y: lineY },
    thickness: 0.8,
    color: palette.ink,
  });
  drawCentered(
    page,
    fitWidth(signer?.fullName ?? 'Firma de la organización', font.sansBold, 10.5, width),
    lineY - 14,
    font.sansBold,
    10.5,
    palette.ink,
    cx,
  );
  if (signer) {
    drawCentered(
      page,
      fitWidth(signer.position, font.sans, 9, width),
      lineY - 26,
      font.sans,
      9,
      palette.muted,
      cx,
    );
  }
  drawCentered(
    page,
    fitWidth(
      signer
        ? `${signer.isLegalRepresentative ? 'Representante legal' : 'Responsable'} · ${row.organizationName}`
        : `Por ${row.organizationName}`,
      font.sans,
      7.5,
      width,
    ),
    lineY - (signer ? 37 : 26),
    font.sans,
    7.5,
    palette.muted,
    cx,
  );
}

/** QR + código + cómo verificar. `x,y` = esquina inferior izquierda del QR. */
function drawVerification(
  page: PDFPage,
  input: CertificatePdfInput,
  font: Fonts,
  palette: Palette,
  x: number,
  y: number,
  qrSize: number,
  textWidth: number,
): void {
  if (!input.verificationCode || !input.verifyUrl) return;
  page.drawRectangle({
    x: x - 4,
    y: y - 4,
    width: qrSize + 8,
    height: qrSize + 8,
    color: WHITE,
    borderColor: palette.accent,
    borderWidth: 0.8,
  });
  drawQr(page, input.verifyUrl, x, y, qrSize);
  const tx = x + qrSize + 12;
  let ty = y + qrSize - 8;
  page.drawText('VERIFICA ESTE CERTIFICADO', {
    x: tx,
    y: ty,
    size: 7.5,
    font: font.sansBold,
    color: palette.primaryDark,
  });
  ty -= 13;
  page.drawText(input.verificationCode, {
    x: tx,
    y: ty,
    size: 10.5,
    font: font.sansBold,
    color: palette.ink,
  });
  ty -= 12;
  for (const line of wrapText(
    `Escanea el código QR o entra a ${input.verifyUrl.replace(/\/[^/]*$/, '')} y escribe el código.`,
    font.sans,
    7,
    textWidth,
  ).slice(0, 3)) {
    page.drawText(line, { x: tx, y: ty, size: 7, font: font.sans, color: palette.muted });
    ty -= 9;
  }
}

// ---------------------------------------------------------------------------
// Plantilla "huellitas"
// ---------------------------------------------------------------------------

function drawPawsPage(pdf: PDFDocument, font: Fonts, p: Palette, input: CertificatePdfInput): void {
  const { row } = input;
  const [W, H] = LANDSCAPE;
  const page = pdf.addPage(LANDSCAPE);
  const cx = W / 2;

  // Fondo y marco redondeado.
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: p.paper });
  page.drawRectangle({
    x: 18,
    y: 26,
    width: W - 36,
    height: H - 44,
    borderColor: p.primary,
    borderWidth: 2,
    color: p.paper,
  });
  // Banda superior con ondas.
  const bandH = 104;
  page.drawRectangle({ x: 18, y: H - 18 - bandH, width: W - 36, height: bandH, color: p.primary });
  const waveTop = H - 18 - bandH;
  page.drawSvgPath(
    `M 0 0 C ${W * 0.15} 26 ${W * 0.3} -18 ${W * 0.48} 6 C ${W * 0.66} 30 ${W * 0.8} -14 ${W - 36} 8 L ${W - 36} -2 L 0 -2 Z`,
    { x: 18, y: waveTop + 2, color: p.primary },
  );
  page.drawSvgPath(
    `M 0 8 C ${W * 0.18} 30 ${W * 0.34} -10 ${W * 0.52} 12 C ${W * 0.7} 32 ${W * 0.84} -6 ${W - 36} 14`,
    { x: 18, y: waveTop - 2, borderColor: p.accent, borderWidth: 2.5 },
  );

  // Huellitas decorativas (marca de agua suave).
  const trail: Array<[number, number, number, number]> = [
    [62, 210, 16, -20],
    [92, 250, 19, -10],
    [64, 296, 23, 5],
    [96, 346, 18, -15],
    [W - 64, 226, 15, 20],
    [W - 60, 330, 17, -5],
  ];
  for (const [x, y, s, r] of trail) drawPaw(page, x, y, s, p.primary, 0.1, r);
  for (const [x, y, s, r] of [
    [W - 130, H - 52, 20, 18],
    [W - 92, H - 82, 15, 30],
    [W - 176, H - 92, 13, 8],
  ] as const) {
    drawPaw(page, x, y, s, WHITE, 0.22, r);
  }

  // Membrete en la banda: logo + organización + NIT/ciudad.
  const logoR = 34;
  drawLogoBadge(page, input, font, 74, H - 18 - bandH / 2, logoR, WHITE, WHITE, p.primaryDark);
  const orgSize = fitSize(row.organizationName, font.sansBold, 20, 12, W - 340);
  page.drawText(row.organizationName, {
    x: 124,
    y: H - 18 - bandH / 2 + 4,
    size: orgSize,
    font: font.sansBold,
    color: WHITE,
  });
  const orgMeta = [input.nit ? `NIT ${input.nit}` : null, input.city ?? null]
    .filter(Boolean)
    .join('  ·  ');
  if (orgMeta) {
    page.drawText(orgMeta, {
      x: 124,
      y: H - 18 - bandH / 2 - 14,
      size: 9.5,
      font: font.sans,
      color: rgb(0.88, 0.97, 0.95),
    });
  }

  // Título.
  let y = H - 18 - bandH - 58;
  const title = certificateTitle(row).toUpperCase();
  drawCentered(
    page,
    title,
    y,
    font.sansBold,
    fitSize(title, font.sansBold, 26, 16, W - 200),
    p.primaryDark,
  );
  y -= 22;
  drawPaw(page, cx, y + 3, 11, p.accent, 1, 0);
  rule(page, cx - 70, y + 3, 100, p.accent, 1.2);
  rule(page, cx + 70, y + 3, 100, p.accent, 1.2);
  y -= 26;

  drawCentered(
    page,
    fitWidth(
      `${row.organizationName}, por medio de ${signerRoleOf(input.signer)}, reconoce con gratitud a`,
      font.serifItalic,
      13,
      W - 220,
    ),
    y,
    font.serifItalic,
    13,
    p.muted,
  );
  y -= 40;
  const nameSize = fitSize(row.volunteerName, font.serifBoldItalic, 34, 20, W - 240);
  drawCentered(page, row.volunteerName, y, font.serifBoldItalic, nameSize, p.accentDark);
  y -= 14;
  rule(
    page,
    cx,
    y,
    Math.min(420, font.serifBoldItalic.widthOfTextAtSize(row.volunteerName, nameSize) + 60),
    p.primary,
    0.8,
  );
  y -= 24;

  // Sello de horas (derecha) + cuerpo (centro).
  const sealX = W - 112;
  const sealY = y - 16;
  page.drawCircle({ x: sealX, y: sealY, size: 44, color: p.accent });
  page.drawCircle({
    x: sealX,
    y: sealY,
    size: 38,
    borderColor: WHITE,
    borderWidth: 1.2,
    borderDashArray: [2, 2],
  });
  const hoursValue = Number.isInteger(row.totalApprovedHours)
    ? String(row.totalApprovedHours)
    : row.totalApprovedHours.toFixed(1).replace('.', ',');
  drawCentered(
    page,
    hoursValue,
    sealY - 2,
    font.sansBold,
    fitSize(hoursValue, font.sansBold, 26, 14, 60),
    WHITE,
    sealX,
  );
  drawCentered(
    page,
    row.totalApprovedHours === 1 ? 'HORA' : 'HORAS',
    sealY - 16,
    font.sansBold,
    8.5,
    WHITE,
    sealX,
  );
  drawPaw(page, sealX, sealY + 24, 8, WHITE, 0.9, 0);

  y = drawParagraph(page, bodyText(row), y, {
    font: font.serif,
    size: 13,
    maxWidth: W - 400,
    lineHeight: 18,
    color: p.ink,
  });
  const student = studentServiceText(row);
  if (student) {
    y -= 4;
    y = drawParagraph(page, student, y, {
      font: font.serifItalic,
      size: 10.5,
      maxWidth: W - 400,
      lineHeight: 14,
      color: p.muted,
    });
  }
  y -= 14;
  drawCentered(
    page,
    'Gracias por darles tu tiempo: cada hora cuenta para ellos.',
    Math.max(y, 176),
    font.sansOblique,
    10.5,
    p.primary,
  );

  // Pie: verificación (izq.), fecha (centro), firma (der.).
  const footY = 78;
  drawVerification(page, input, font, p, 44, footY - 14, 66, 170);
  drawCentered(page, issuedText(row, input.city), footY + 26, font.sans, 9.5, p.muted);
  for (const [i, line] of wrapText(
    disclaimerText(row, input.signer),
    font.sans,
    7,
    250,
  ).entries()) {
    drawCentered(page, line, footY + 10 - i * 9, font.sans, 7, p.muted);
  }
  drawSignatureBlock(page, input, font, p, W - 290, footY + 22, 230);
}

// ---------------------------------------------------------------------------
// Plantilla "clasica"
// ---------------------------------------------------------------------------

function drawClassicPage(
  pdf: PDFDocument,
  font: Fonts,
  p: Palette,
  input: CertificatePdfInput,
): void {
  const { row } = input;
  const [W, H] = LANDSCAPE;
  const page = pdf.addPage(LANDSCAPE);
  const cx = W / 2;

  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: p.paper });
  // Marco triple: azul grueso, dorado fino, azul fino.
  page.drawRectangle({
    x: 20,
    y: 28,
    width: W - 40,
    height: H - 48,
    borderColor: p.primary,
    borderWidth: 5,
  });
  page.drawRectangle({
    x: 30,
    y: 38,
    width: W - 60,
    height: H - 68,
    borderColor: p.accent,
    borderWidth: 1.2,
  });
  page.drawRectangle({
    x: 35,
    y: 43,
    width: W - 70,
    height: H - 78,
    borderColor: p.primary,
    borderWidth: 0.4,
  });
  // Ornamentos en las esquinas (rombos dorados) y huellita discreta.
  for (const [x, y] of [
    [30, 38],
    [W - 30, 38],
    [30, H - 30],
    [W - 30, H - 30],
  ] as const) {
    page.drawSvgPath('M 0 -9 L 9 0 L 0 9 L -9 0 Z', { x, y, color: p.accent });
    page.drawSvgPath('M 0 -4 L 4 0 L 0 4 L -4 0 Z', { x, y, color: p.paper });
  }
  // Marca de agua: huella grande y tenue al centro.
  drawPaw(page, cx, H / 2 - 10, 190, p.accent, 0.06, 0);

  // Membrete.
  let y = H - 92;
  drawLogoBadge(page, input, font, cx, y, 30, p.accent, p.paper, p.primary);
  y -= 48;
  const orgName = row.organizationName.toUpperCase();
  drawCentered(
    page,
    orgName,
    y,
    font.serifBold,
    fitSize(orgName, font.serifBold, 15, 10, W - 200),
    p.primary,
  );
  y -= 13;
  const orgMeta = [input.nit ? `NIT ${input.nit}` : null, input.city ?? null]
    .filter(Boolean)
    .join('  ·  ');
  if (orgMeta) {
    drawCentered(page, orgMeta, y, font.sans, 8.5, p.muted);
    y -= 10;
  }
  y -= 26;

  const title = certificateTitle(row).toUpperCase();
  drawCentered(
    page,
    title,
    y,
    font.serifBold,
    fitSize(title, font.serifBold, 27, 17, W - 180),
    p.primary,
  );
  y -= 14;
  rule(page, cx, y, 260, p.accent, 1.2);
  page.drawSvgPath('M 0 -4 L 4 0 L 0 4 L -4 0 Z', { x: cx, y, color: p.accent });
  y -= 30;

  drawCentered(
    page,
    fitWidth(
      `${row.organizationName}, por medio de ${signerRoleOf(input.signer)}, hace constar que`,
      font.serifItalic,
      13,
      W - 220,
    ),
    y,
    font.serifItalic,
    13,
    p.muted,
  );
  y -= 40;
  const nameSize = fitSize(row.volunteerName, font.serifBoldItalic, 32, 20, W - 220);
  drawCentered(page, row.volunteerName, y, font.serifBoldItalic, nameSize, p.ink);
  y -= 14;
  rule(page, cx, y, 380, p.primary, 0.6);
  y -= 26;

  y = drawParagraph(page, bodyText(row), y, {
    font: font.serif,
    size: 13,
    maxWidth: W - 260,
    lineHeight: 18,
    color: p.ink,
  });
  const student = studentServiceText(row);
  if (student) {
    y -= 4;
    drawParagraph(page, student, y, {
      font: font.serifItalic,
      size: 10.5,
      maxWidth: W - 260,
      lineHeight: 14,
      color: p.muted,
    });
  }

  // Pie: verificación (izq.), sello dorado (centro), firma (der.).
  const footY = 116;
  drawVerification(page, input, font, p, 58, footY - 52, 62, 150);
  drawCentered(page, issuedText(row, input.city), footY + 44, font.serifItalic, 10.5, p.muted);

  // Sello con las horas.
  const sealY = footY - 2;
  page.drawCircle({ x: cx, y: sealY, size: 38, color: p.accent });
  page.drawCircle({ x: cx, y: sealY, size: 33, borderColor: p.paper, borderWidth: 1 });
  page.drawCircle({ x: cx, y: sealY, size: 29, borderColor: p.paper, borderWidth: 0.4 });
  const hoursValue = Number.isInteger(row.totalApprovedHours)
    ? String(row.totalApprovedHours)
    : row.totalApprovedHours.toFixed(1).replace('.', ',');
  drawCentered(
    page,
    hoursValue,
    sealY + 1,
    font.serifBold,
    fitSize(hoursValue, font.serifBold, 22, 12, 46),
    p.paper,
    cx,
  );
  drawCentered(
    page,
    row.totalApprovedHours === 1 ? 'HORA' : 'HORAS',
    sealY - 12,
    font.sansBold,
    7,
    p.paper,
    cx,
  );
  for (const [i, line] of wrapText(
    disclaimerText(row, input.signer),
    font.sans,
    6.5,
    400,
  ).entries()) {
    drawCentered(page, line, sealY - 52 - i * 8, font.sans, 6.5, p.muted);
  }

  drawSignatureBlock(page, input, font, p, W - 300, footY + 12, 230);
}

// ---------------------------------------------------------------------------
// Anexos
// ---------------------------------------------------------------------------

function annexHeader(
  page: PDFPage,
  font: Fonts,
  p: Palette,
  input: CertificatePdfInput,
  title: string,
): number {
  const [W, H] = PORTRAIT;
  page.drawRectangle({ x: 0, y: H - 70, width: W, height: 70, color: p.primary });
  drawPaw(page, W - 60, H - 36, 22, WHITE, 0.25, 15);
  page.drawText(title, { x: 44, y: H - 36, size: 15, font: font.sansBold, color: WHITE });
  const sub = fitWidth(
    `${input.row.volunteerName} · ${input.row.opportunityTitle} · ${input.row.organizationName}`,
    font.sans,
    9,
    W - 150,
  );
  page.drawText(sub, { x: 44, y: H - 52, size: 9, font: font.sans, color: rgb(0.92, 0.96, 0.96) });
  if (input.verificationCode) {
    page.drawText(`Anexo del certificado ${input.verificationCode}`, {
      x: 44,
      y: SAFE_BOTTOM + 6,
      size: 7.5,
      font: font.sans,
      color: p.muted,
    });
  }
  return H - 100;
}

function drawBitacoraAnnex(
  pdf: PDFDocument,
  font: Fonts,
  p: Palette,
  input: CertificatePdfInput,
): void {
  const [W] = PORTRAIT;
  const left = 44;
  const right = W - 44;
  const cols = { date: left, hours: left + 118, activity: left + 170, supervisor: right - 120 };
  const activityWidth = cols.supervisor - cols.activity - 10;
  let page = pdf.addPage(PORTRAIT);
  let y = annexHeader(page, font, p, input, 'Bitácora de horas certificadas');

  const header = (): void => {
    page.drawRectangle({ x: left, y: y - 6, width: right - left, height: 22, color: p.soft });
    for (const [label, x] of [
      ['FECHA', cols.date + 6],
      ['HORAS', cols.hours],
      ['ACTIVIDAD REALIZADA', cols.activity],
      ['APROBÓ', cols.supervisor],
    ] as const) {
      page.drawText(label, { x, y: y + 1, size: 8, font: font.sansBold, color: p.primaryDark });
    }
    y -= 26;
  };
  header();

  input.row.bitacora.forEach((entry, index) => {
    const lines = wrapText(entry.description, font.sans, 9, activityWidth).slice(0, 6);
    const rowH = Math.max(lines.length, 1) * 11 + 8;
    if (y - rowH < SAFE_BOTTOM + 30) {
      page = pdf.addPage(PORTRAIT);
      y = annexHeader(page, font, p, input, 'Bitácora de horas certificadas (cont.)');
      header();
    }
    if (index % 2 === 1) {
      page.drawRectangle({
        x: left,
        y: y - rowH + 10,
        width: right - left,
        height: rowH,
        color: p.soft,
        opacity: 0.5,
      });
    }
    page.drawText(formatDay(entry.date), {
      x: cols.date + 6,
      y,
      size: 9,
      font: font.sans,
      color: p.ink,
    });
    page.drawText(hoursLabel(entry.hours), {
      x: cols.hours,
      y,
      size: 9,
      font: font.sansBold,
      color: p.ink,
    });
    lines.forEach((line, i) =>
      page.drawText(line, {
        x: cols.activity,
        y: y - i * 11,
        size: 9,
        font: font.sans,
        color: p.ink,
      }),
    );
    page.drawText(fitWidth(entry.supervisorName ?? '—', font.sans, 8.5, right - cols.supervisor), {
      x: cols.supervisor,
      y,
      size: 8.5,
      font: font.sans,
      color: p.muted,
    });
    y -= rowH;
  });

  page.drawLine({
    start: { x: left, y: y + 6 },
    end: { x: right, y: y + 6 },
    thickness: 0.8,
    color: p.primary,
  });
  y -= 10;
  page.drawText(
    `Total certificado: ${hoursLabel(input.row.totalApprovedHours)} en ${input.row.bitacora.length} ${
      input.row.bitacora.length === 1 ? 'sesión aprobada' : 'sesiones aprobadas'
    }.`,
    { x: left, y, size: 10, font: font.sansBold, color: p.primaryDark },
  );
  y -= 14;
  for (const line of wrapText(
    'Solo se certifican horas aprobadas por la organización; las pendientes o rechazadas no cuentan.',
    font.sans,
    8,
    right - left,
  )) {
    page.drawText(line, { x: left, y, size: 8, font: font.sans, color: p.muted });
    y -= 10;
  }
}

function drawPhotoAnnex(
  pdf: PDFDocument,
  font: Fonts,
  p: Palette,
  input: CertificatePdfInput,
): void {
  const [W] = PORTRAIT;
  const page = pdf.addPage(PORTRAIT);
  let y = annexHeader(page, font, p, input, 'Registro fotográfico de la jornada');
  const gap = 14;
  const columns = 2;
  const cellW = (W - 88 - gap * (columns - 1)) / columns;
  const cellH = 200;
  input.photos.forEach((photo, index) => {
    const col = index % columns;
    if (col === 0 && index > 0) y -= cellH + 38;
    const x = 44 + col * (cellW + gap);
    const top = y;
    page.drawRectangle({
      x,
      y: top - cellH,
      width: cellW,
      height: cellH,
      color: p.soft,
      borderColor: p.primary,
      borderWidth: 0.6,
    });
    const scale = Math.min((cellW - 12) / photo.image.width, (cellH - 12) / photo.image.height);
    const w = photo.image.width * scale;
    const h = photo.image.height * scale;
    page.drawImage(photo.image, {
      x: x + (cellW - w) / 2,
      y: top - cellH + (cellH - h) / 2,
      width: w,
      height: h,
    });
    page.drawText(fitWidth(photo.caption, font.sans, 8.5, cellW), {
      x,
      y: top - cellH - 13,
      size: 8.5,
      font: font.sans,
      color: p.muted,
    });
  });
  y -= cellH + 44;
  const shown = input.photos.length;
  const note =
    input.totalPhotos > shown
      ? `Se muestran ${shown} de ${input.totalPhotos} fotos que la persona adjuntó a sus sesiones aprobadas.`
      : 'Fotos que la persona adjuntó a sus sesiones aprobadas, guardadas sin cambios desde que se subieron.';
  page.drawText(fitWidth(note, font.sans, 8, W - 88), {
    x: 44,
    y: Math.max(y, SAFE_BOTTOM + 20),
    size: 8,
    font: font.sans,
    color: p.muted,
  });
}
