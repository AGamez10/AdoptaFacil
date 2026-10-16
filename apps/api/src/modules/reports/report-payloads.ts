import type { SocialServiceReportFilters } from '@adoptafacil/contracts';
import { maskDocument } from './report-text';

/**
 * Snapshots sellados de cada reporte. Son el CONTENIDO del documento: el PDF
 * y el Excel se dibujan siempre desde aquí (nunca desde datos vivos), y su
 * SHA-256 es el `contentHash` impreso en el pie. Funciones puras: reciben
 * filas ya leídas bajo RLS y no tocan la base de datos.
 *
 * Minimización de datos (Ley 1581): no se incluyen correos, teléfonos ni datos
 * de acudientes; el documento del donante va enmascarado; una donación anónima
 * nunca revela al donante.
 */

export interface ReportOrganizationSnapshot {
  name: string;
  nit?: string;
  city?: string;
  formalizationState: string;
}

// ---------------------------------------------------------------------------
// Donaciones
// ---------------------------------------------------------------------------

export interface DonationSourceRow {
  id: string;
  conceptKind: string;
  conceptId: string;
  amountCharged: number;
  breakdown: {
    net: number;
    platformFee: number;
    platformIva: number;
    gatewayFee: number;
    gatewayIva: number;
  };
  payer: { fullName?: string; documentId?: string } | null;
  /** Cuenta del donante, si donó con sesión; solo así puede constar su consentimiento. */
  donorUserId?: string | null;
  anonymous: boolean;
  /** Fecha de aprobación (emisión del recibo) o, en su defecto, de actualización. */
  approvedAt: Date;
  receiptId?: string;
  certificateCode?: string;
}

export interface DonationReportRow {
  date: string;
  receiptNo: string;
  donor: string;
  donorDocument: string;
  concept: string;
  amountCharged: number;
  fees: number;
  net: number;
  certificateCode: string;
}

export interface DonationsReportPayload {
  version: 1;
  kind: 'donations';
  organization: ReportOrganizationSnapshot;
  period: { start: string; end: string };
  rows: DonationReportRow[];
  totals: { count: number; amountCharged: number; fees: number; net: number };
  byConcept: Array<{ concept: string; count: number; net: number }>;
  byMonth: Array<{ month: string; count: number; net: number }>;
}

function conceptLabel(
  kind: string,
  id: string,
  names: { campaigns: Map<string, string>; animals: Map<string, string> },
): string {
  if (kind === 'campaign') return `Campaña: ${names.campaigns.get(id) ?? 'sin nombre'}`;
  if (kind === 'animal') return `Animal: ${names.animals.get(id) ?? 'sin nombre'}`;
  return 'Donación general';
}

/** Mes en hora de Colombia (`YYYY-MM`). */
function colombiaMonth(date: Date): string {
  return new Date(date.getTime() - 5 * 3600_000).toISOString().slice(0, 7);
}

export function buildDonationsPayload(input: {
  organization: ReportOrganizationSnapshot;
  period: { start: string; end: string };
  donations: DonationSourceRow[];
  campaignNames: Map<string, string>;
  animalNames: Map<string, string>;
  /** Personas con consentimiento vigente para esta organización; sin él, no se identifica. */
  consentedUserIds?: ReadonlySet<string>;
}): DonationsReportPayload {
  const consented = input.consentedUserIds ?? new Set<string>();
  const sorted = [...input.donations].sort(
    (a, b) => a.approvedAt.getTime() - b.approvedAt.getTime() || a.id.localeCompare(b.id),
  );
  const names = { campaigns: input.campaignNames, animals: input.animalNames };
  const rows: DonationReportRow[] = sorted.map((d) => {
    const b = d.breakdown;
    const fees = b.platformFee + b.platformIva + b.gatewayFee + b.gatewayIva;
    // Solo se identifica al donante con cuenta, no anónimo y con consentimiento vigente.
    const identified = !d.anonymous && !!d.donorUserId && consented.has(d.donorUserId);
    return {
      date: d.approvedAt.toISOString(),
      receiptNo: (d.receiptId ?? d.id).slice(0, 8).toUpperCase(),
      donor: d.anonymous
        ? 'Donante anónimo'
        : identified
          ? d.payer?.fullName?.trim() || 'Donante'
          : 'Donante',
      donorDocument: identified ? maskDocument(d.payer?.documentId) : '',
      concept: conceptLabel(d.conceptKind, d.conceptId, names),
      amountCharged: d.amountCharged,
      fees,
      net: b.net,
      certificateCode: d.certificateCode ?? '',
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      count: acc.count + 1,
      amountCharged: acc.amountCharged + r.amountCharged,
      fees: acc.fees + r.fees,
      net: acc.net + r.net,
    }),
    { count: 0, amountCharged: 0, fees: 0, net: 0 },
  );

  const conceptMap = new Map<string, { count: number; net: number }>();
  const monthMap = new Map<string, { count: number; net: number }>();
  rows.forEach((r, i) => {
    const c = conceptMap.get(r.concept) ?? { count: 0, net: 0 };
    conceptMap.set(r.concept, { count: c.count + 1, net: c.net + r.net });
    const month = colombiaMonth(sorted[i].approvedAt);
    const m = monthMap.get(month) ?? { count: 0, net: 0 };
    monthMap.set(month, { count: m.count + 1, net: m.net + r.net });
  });

  return {
    version: 1,
    kind: 'donations',
    organization: input.organization,
    period: input.period,
    rows,
    totals,
    byConcept: [...conceptMap.entries()]
      .map(([concept, v]) => ({ concept, ...v }))
      .sort((a, b) => b.net - a.net || a.concept.localeCompare(b.concept)),
    byMonth: [...monthMap.entries()]
      .map(([month, v]) => ({ month, ...v }))
      .sort((a, b) => a.month.localeCompare(b.month)),
  };
}

// ---------------------------------------------------------------------------
// Servicio social / voluntariado
// ---------------------------------------------------------------------------

export interface EnrollmentSourceRow {
  id: string;
  volunteerUserId?: string;
  volunteerName: string;
  opportunityTitle: string;
  appliesToStudentService: boolean;
  schoolName: string | null;
  schoolAgreementCode: string | null;
  hours: Array<{ date: Date; hours: number; status: string }>;
  certificate?: { id: string; issuedAt: Date };
}

export interface SocialServiceReportRow {
  volunteerName: string;
  opportunity: string;
  studentService: boolean;
  school: string;
  agreementCode: string;
  hoursInPeriod: number;
  hoursTotal: number;
  pendingSessions: number;
  missingHours: number;
  status: string;
  certificateNo: string;
}

export interface SocialServiceReportPayload {
  version: 1;
  kind: 'social_service';
  organization: ReportOrganizationSnapshot;
  period: { start: string; end: string };
  filters: SocialServiceReportFilters;
  minHours: number;
  rows: SocialServiceReportRow[];
  totals: { volunteers: number; hoursInPeriod: number; certificates: number; completed: number };
  bySchool: Array<{ school: string; volunteers: number; hours: number }>;
  /** Voluntarios que habrían figurado pero no autorizaron el uso de sus datos (solo el conteo). */
  omittedWithoutConsent?: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function buildSocialServicePayload(input: {
  organization: ReportOrganizationSnapshot;
  period: { start: string; end: string; fromUtc: Date; toUtcExclusive: Date };
  filters: SocialServiceReportFilters;
  minHours: number;
  enrollments: EnrollmentSourceRow[];
  /** Personas con consentimiento vigente para esta organización. */
  consentedUserIds?: ReadonlySet<string>;
}): SocialServiceReportPayload {
  const consented = input.consentedUserIds ?? new Set<string>();
  let omittedWithoutConsent = 0;
  const { fromUtc, toUtcExclusive } = input.period;
  const inPeriod = (d: Date) => d >= fromUtc && d < toUtcExclusive;
  const school = input.filters.schoolName?.trim();

  const rows: SocialServiceReportRow[] = [];
  for (const e of input.enrollments) {
    if (input.filters.studentServiceOnly && !e.appliesToStudentService) continue;
    if (school && (e.schoolName ?? '').trim() !== school) continue;

    const approved = e.hours.filter((h) => h.status === 'approved');
    const hoursInPeriod = round2(
      approved.filter((h) => inPeriod(h.date)).reduce((s, h) => s + h.hours, 0),
    );
    const certifiedInPeriod = e.certificate ? inPeriod(e.certificate.issuedAt) : false;
    if (hoursInPeriod === 0 && !certifiedInPeriod) continue;
    if (!e.volunteerUserId || !consented.has(e.volunteerUserId)) {
      omittedWithoutConsent += 1;
      continue;
    }

    const hoursTotal = round2(approved.reduce((s, h) => s + h.hours, 0));
    const missingHours = e.appliesToStudentService
      ? round2(Math.max(0, input.minHours - hoursTotal))
      : 0;
    const status = e.certificate
      ? 'Certificado emitido'
      : e.appliesToStudentService && missingHours > 0
        ? `En curso (faltan ${missingHours.toLocaleString('es-CO')} h)`
        : 'Cumple, sin certificar';

    rows.push({
      volunteerName: e.volunteerName,
      opportunity: e.opportunityTitle,
      studentService: e.appliesToStudentService,
      school: e.schoolName?.trim() ?? '',
      agreementCode: e.schoolAgreementCode?.trim() ?? '',
      hoursInPeriod,
      hoursTotal,
      pendingSessions: e.hours.filter((h) => h.status === 'pending').length,
      missingHours,
      status,
      certificateNo: e.certificate ? e.certificate.id.slice(0, 8).toUpperCase() : '',
    });
  }

  rows.sort(
    (a, b) =>
      a.school.localeCompare(b.school, 'es') ||
      a.volunteerName.localeCompare(b.volunteerName, 'es') ||
      a.opportunity.localeCompare(b.opportunity, 'es'),
  );

  const schoolMap = new Map<string, { volunteers: number; hours: number }>();
  for (const r of rows) {
    const key = r.school || 'Sin institución educativa';
    const v = schoolMap.get(key) ?? { volunteers: 0, hours: 0 };
    schoolMap.set(key, { volunteers: v.volunteers + 1, hours: round2(v.hours + r.hoursInPeriod) });
  }

  return {
    version: 1,
    kind: 'social_service',
    organization: input.organization,
    period: { start: input.period.start, end: input.period.end },
    filters: input.filters,
    minHours: input.minHours,
    rows,
    totals: {
      volunteers: rows.length,
      hoursInPeriod: round2(rows.reduce((s, r) => s + r.hoursInPeriod, 0)),
      certificates: rows.filter((r) => r.certificateNo).length,
      completed: rows.filter((r) => r.studentService && r.missingHours === 0).length,
    },
    bySchool: [...schoolMap.entries()]
      .map(([s, v]) => ({ school: s, ...v }))
      .sort((a, b) => a.school.localeCompare(b.school, 'es')),
    omittedWithoutConsent,
  };
}

export type OrgReportPayload = DonationsReportPayload | SocialServiceReportPayload;
