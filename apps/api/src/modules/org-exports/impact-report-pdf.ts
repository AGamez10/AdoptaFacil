import { PDFDocument, StandardFonts } from 'pdf-lib';
import { stampPlatformDocumentNotice } from '../../core/legal/platform-document-notice';
import {
  MARGIN,
  MUTED,
  NAVY,
  PAGE_H,
  PAGE_W,
  ReportCanvas,
  TEAL,
  drawQr,
  type Fonts,
} from '../reports/report-pdf';
import { pdfText } from '../reports/report-text';
import { CAMPAIGN_CATEGORY_LABEL, CAMPAIGN_STATUS_LABEL, labelOf } from './export-labels';

/**
 * Reporte de impacto (planes Crece y Pro): un PDF para donantes, empresas y la
 * junta, con lo que la organización logró en un período. Solo CIFRAS
 * AGREGADAS de los registros de la propia organización: nunca el nombre, el
 * contacto ni el documento de un adoptante, donante o voluntario, y ninguna
 * fila por persona. Es un documento informativo: no es certificado de donación
 * ni tiene efecto tributario (eso lo emiten los reportes firmados de M13).
 */

export interface ImpactCampaign {
  title: string;
  category: string;
  status: string;
  goalAmount: number;
  raisedAmount: number;
}

export interface ImpactReportData {
  organization: { name: string; city?: string };
  /** `YYYY-MM-DD` en hora de Colombia, inclusivas. */
  period: { start: string; end: string };
  generatedAt: Date;
  /** Animales registrados en el período (ingresos/rescates). */
  animalsRegistered: number;
  /** Contratos de adopción firmados en el período. */
  adoptionsCompleted: number;
  /** Donaciones aprobadas en el período: cantidad, neto para la org y donantes distintos. */
  donations: { count: number; netTotal: number; donors: number };
  /** Atenciones veterinarias del período por tipo (vacunas, esterilizaciones…). */
  care: { vaccines: number; sterilizations: number; surgeries: number; treatments: number };
  volunteerHours: number;
  volunteers: number;
  /** Campañas con actividad en el período (creadas antes de terminar y vigentes al iniciar). */
  campaigns: ImpactCampaign[];
  /** Cómo están hoy los animales activos de la organización. */
  animalsToday: { available: number; inProcess: number; adopted: number };
  /** Portal público de la organización (para el QR), si tiene slug. */
  portalUrl?: string;
}

/** Campañas que caben en la tabla; el resto se resume en una línea. */
export const IMPACT_MAX_CAMPAIGNS = 12;

const money = (n: number): string => `$ ${Math.round(n).toLocaleString('es-CO')}`;
const count = (n: number): string => n.toLocaleString('es-CO');

function formatDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  }).format(date);
}

export async function renderImpactReportPdf(data: ImpactReportData): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const orgName = pdfText(data.organization.name, 120);
  pdf.setTitle(`Reporte de impacto · ${orgName}`);
  pdf.setAuthor(orgName);
  pdf.setProducer('AdoptaFácil');
  pdf.setCreator('AdoptaFácil');
  pdf.setCreationDate(data.generatedAt);
  pdf.setModificationDate(data.generatedAt);

  const font: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
  };
  const c = new ReportCanvas(pdf, font);

  // Encabezado: quién y qué período.
  c.text('REPORTE DE IMPACTO', MARGIN, 9, { font: font.bold, color: TEAL });
  c.y -= 24;
  c.text(orgName, MARGIN, 22, { font: font.bold, color: NAVY });
  c.y -= 18;
  const place = data.organization.city ? `${pdfText(data.organization.city, 60)} · ` : '';
  c.text(
    `${place}Del ${formatDay(data.period.start)} al ${formatDay(data.period.end)}`,
    MARGIN,
    11,
    { color: MUTED },
  );
  if (data.portalUrl) {
    const size = 56;
    const qrX = PAGE_W - MARGIN - size;
    const qrY = PAGE_H - MARGIN - size;
    drawQr(c.page, data.portalUrl, qrX, qrY, size);
    const caption = 'Conócenos y apóyanos';
    const w = font.regular.widthOfTextAtSize(caption, 8);
    c.text(caption, qrX - 8 - w, 8, { color: MUTED, y: qrY + size / 2 - 3 });
  }
  c.y -= 26;

  c.kpis([
    { label: 'Animales rescatados o recibidos', value: count(data.animalsRegistered) },
    { label: 'Adopciones con contrato firmado', value: count(data.adoptionsCompleted) },
    { label: 'Donaciones recibidas (neto)', value: money(data.donations.netTotal) },
    { label: 'Horas de voluntariado', value: count(Math.round(data.volunteerHours)) },
  ]);

  c.sectionTitle('Cuidado veterinario en el período');
  c.kpis([
    { label: 'Vacunas', value: count(data.care.vaccines) },
    { label: 'Esterilizaciones', value: count(data.care.sterilizations) },
    { label: 'Cirugías', value: count(data.care.surgeries) },
    { label: 'Tratamientos', value: count(data.care.treatments) },
  ]);

  c.sectionTitle('Quienes nos apoyaron');
  c.paragraph(
    `${count(data.donations.count)} ${data.donations.count === 1 ? 'donación aprobada' : 'donaciones aprobadas'} de ${count(data.donations.donors)} ${data.donations.donors === 1 ? 'persona' : 'personas'} distintas, y ${count(data.volunteers)} ${data.volunteers === 1 ? 'voluntario' : 'voluntarios'} con horas aprobadas. El neto es lo que llegó a la organización después de comisiones e impuestos.`,
    MARGIN,
    10,
    PAGE_W - MARGIN * 2,
    14,
  );

  c.sectionTitle('Campañas');
  const shown = data.campaigns.slice(0, IMPACT_MAX_CAMPAIGNS);
  c.table(
    [
      { header: 'Campaña', width: 260 },
      { header: 'Categoría', width: 110 },
      { header: 'Estado', width: 80 },
      { header: 'Meta', width: 90, align: 'right' },
      { header: 'Recaudado', width: 90, align: 'right' },
      { header: 'Avance', width: 60, align: 'right' },
    ],
    shown.map((k) => [
      pdfText(k.title, 120),
      labelOf(CAMPAIGN_CATEGORY_LABEL, k.category),
      labelOf(CAMPAIGN_STATUS_LABEL, k.status),
      money(k.goalAmount),
      money(k.raisedAmount),
      k.goalAmount > 0
        ? `${Math.min(999, Math.round((k.raisedAmount / k.goalAmount) * 100))} %`
        : '—',
    ]),
    { emptyText: 'Sin campañas en el período.' },
  );
  if (data.campaigns.length > shown.length) {
    c.paragraph(
      `Y ${data.campaigns.length - shown.length} campañas más.`,
      MARGIN,
      9,
      PAGE_W - MARGIN * 2,
      12,
      font.italic,
      MUTED,
    );
  }

  c.sectionTitle('Hoy');
  c.paragraph(
    `${count(data.animalsToday.available)} animales esperan un hogar, ${count(data.animalsToday.inProcess)} están en proceso de adopción y ${count(data.animalsToday.adopted)} ya fueron adoptados.`,
    MARGIN,
    10,
    PAGE_W - MARGIN * 2,
    14,
  );

  c.y -= 8;
  c.paragraph(
    `Cifras calculadas por AdoptaFácil el ${formatDateTime(data.generatedAt)} (hora de Colombia) a partir de los registros de la organización. Documento informativo: no es un certificado de donación ni tiene efecto tributario. No contiene datos personales de adoptantes, donantes ni voluntarios.`,
    MARGIN,
    8,
    PAGE_W - MARGIN * 2,
    11,
    font.italic,
    MUTED,
  );

  await stampPlatformDocumentNotice(pdf);
  return Buffer.from(await pdf.save());
}
