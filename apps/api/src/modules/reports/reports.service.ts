import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type OrgReport as OrgReportRow } from '@prisma/client';
import type {
  GenerateOrgReportInput,
  LegalRepresentativeRole,
  OrganizationLocation,
  OrgReport,
  OrgReportKind,
  OrgReportLegalEffect,
  OrgReportSigner,
  OrgReportSummary,
  OrgReportVerification,
  OrgReportsReadiness,
  Paginated,
  SocialServiceReportFilters,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { isUniqueConstraintViolation } from '../../core/errors/prisma-conflict.util';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LegalRepresentativeService } from '../org/legal-representative.service';
import { studentServiceMinHours } from '../volunteering/volunteer-certificate-eligibility';
import {
  SIGNER_ORDER,
  SIGNER_ROLE_LABEL,
  computeLegalEffect,
  defaultSignerRoles,
  nextStepsFor,
} from './report-legal-effect';
import {
  type OrgReportPayload,
  type ReportOrganizationSnapshot,
  buildDonationsPayload,
  buildSocialServicePayload,
} from './report-payloads';
import { resolveReportPeriod, type ReportPeriod } from './report-period';
import { renderReportPdf } from './report-pdf';
import { renderReportXlsx } from './report-xlsx';
import { REPORT_CODE_PATTERN, generateReportCode, sealHash } from './report-seal';

/** Firmante sellado en la fila (identificadores + hash, nunca la imagen). */
interface SealedSigner extends OrgReportSigner {
  legalRepresentativeId: string;
  signatureHash: string;
}

const CODE_MAX_ATTEMPTS = 3;
const MAX_LIST_LIMIT = 50;

function toContract(row: OrgReportRow, reused?: boolean): OrgReport {
  const signers = (row.signers as unknown as SealedSigner[]).map(
    ({ role, fullName, position }) => ({
      role,
      fullName,
      position,
    }),
  );
  return {
    id: row.id,
    organizationId: row.organizationId,
    kind: row.kind as OrgReportKind,
    code: row.code,
    periodStart: row.periodStart.toISOString().slice(0, 10),
    periodEnd: row.periodEnd.toISOString().slice(0, 10),
    filters: row.filters as unknown as SocialServiceReportFilters,
    legalEffect: row.legalEffect as OrgReportLegalEffect,
    signers,
    summary: row.summary as unknown as OrgReportSummary,
    contentHash: row.contentHash,
    generatedByUserId: row.generatedByUserId,
    createdAt: row.createdAt.toISOString(),
    ...(reused === undefined ? {} : { reused }),
  };
}

function summarize(payload: OrgReportPayload): OrgReportSummary {
  if (payload.kind === 'donations') {
    return {
      rowCount: payload.rows.length,
      netTotal: payload.totals.net,
      grossTotal: payload.totals.amountCharged,
    };
  }
  return {
    rowCount: payload.rows.length,
    approvedHours: payload.totals.hoursInPeriod,
    volunteers: payload.totals.volunteers,
  };
}

/** Solo los filtros que aplican a cada tipo, normalizados (idempotencia: dos
 *  peticiones equivalentes producen exactamente el mismo sello). */
function normalizeFilters(
  kind: OrgReportKind,
  filters: SocialServiceReportFilters | undefined,
): SocialServiceReportFilters {
  if (kind !== 'social_service') return {};
  const out: SocialServiceReportFilters = {};
  if (filters?.studentServiceOnly) out.studentServiceOnly = true;
  const school = filters?.schoolName?.trim();
  if (school) out.schoolName = school;
  return out;
}

/**
 * M13 · Reportes de donaciones y de servicio social de la organización.
 *
 * Cadena de seguridad: el controlador exige JWT + `@Roles` (deny-by-default);
 * aquí la organización SIEMPRE sale del contexto de tenant del JWT (nunca del
 * cuerpo de la petición) y toda lectura/escritura corre en `withOrgContext`
 * bajo RLS, más un filtro explícito por `organizationId` como defensa en
 * profundidad. Un usuario de la Org A no puede generar, listar ni descargar
 * nada de la Org B: la fila simplemente no existe para él (404).
 *
 * Generar es explícito (un clic del usuario, nunca automático) e idempotente:
 * mismo tipo + período + filtros + firmantes + datos ⇒ mismo sello ⇒ se
 * devuelve el reporte existente con el mismo folio, nunca un duplicado.
 */
@Injectable()
export class ReportsService {
  private readonly webBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    private readonly legalRepresentatives: LegalRepresentativeService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.webBaseUrl = String(config.get('WEB_BASE_URL') ?? 'http://localhost:5173').replace(
      /\/$/,
      '',
    );
  }

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  private verifyUrl(code: string): string {
    return `${this.webBaseUrl}/verificar/${encodeURIComponent(code)}`;
  }

  /** Firmantes vigentes (el más reciente por rol) con id y hash de la firma. */
  private async currentSigners(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<Map<LegalRepresentativeRole, SealedSigner>> {
    const rows = await tx.legalRepresentative.findMany({
      where: { organizationId },
      orderBy: { signedAt: 'desc' },
    });
    const byRole = new Map<LegalRepresentativeRole, SealedSigner>();
    for (const row of rows) {
      const role = row.role as LegalRepresentativeRole;
      if (byRole.has(role) || !SIGNER_ORDER.includes(role)) continue;
      byRole.set(role, {
        role,
        fullName: row.fullName,
        position: row.position,
        legalRepresentativeId: row.id,
        signatureHash: row.signatureHash,
      });
    }
    return byRole;
  }

  private async organizationSnapshot(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<{ snapshot: ReportOrganizationSnapshot; rteVigente: boolean }> {
    const [org, profile] = await Promise.all([
      tx.organization.findUniqueOrThrow({ where: { id: organizationId } }),
      tx.organizationProfile.findUnique({ where: { organizationId } }),
    ]);
    const location = profile?.location as OrganizationLocation | null | undefined;
    const snapshot: ReportOrganizationSnapshot = {
      name: org.name,
      formalizationState: profile?.formalizationState ?? 'informal',
    };
    if (profile?.nit) snapshot.nit = profile.nit;
    const city = location?.city?.trim();
    if (city) snapshot.city = city;
    return { snapshot, rteVigente: profile?.rteVigente === true };
  }

  async readiness(): Promise<OrgReportsReadiness> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const [{ snapshot, rteVigente }, signers, schoolRows] = await Promise.all([
        this.organizationSnapshot(tx, organizationId),
        this.currentSigners(tx, organizationId),
        tx.volunteerEnrollment.findMany({
          where: { organizationId, schoolName: { not: null } },
          select: { schoolName: true },
          distinct: ['schoolName'],
        }),
      ]);
      const registered = new Set(signers.keys());
      const effectFor = (kind: OrgReportKind) =>
        computeLegalEffect({
          kind,
          formalizationState: snapshot.formalizationState,
          rteVigente,
          hasNit: Boolean(snapshot.nit),
          signerRoles: defaultSignerRoles(kind, registered),
        });
      const schools = [
        ...new Set(schoolRows.map((r) => r.schoolName?.trim()).filter((s): s is string => !!s)),
      ].sort((a, b) => a.localeCompare(b, 'es'));
      return {
        formalizationState: snapshot.formalizationState,
        donationsLegalEffect: effectFor('donations'),
        socialServiceLegalEffect: effectFor('social_service'),
        signers: SIGNER_ORDER.map((role) => {
          const s = signers.get(role);
          return s
            ? { role, registered: true, fullName: s.fullName, position: s.position }
            : { role, registered: false };
        }),
        nextSteps: nextStepsFor({
          formalizationState: snapshot.formalizationState,
          rteVigente,
          hasNit: Boolean(snapshot.nit),
          registered,
        }),
        schools,
        studentServiceMinHours: studentServiceMinHours(),
      };
    });
  }

  async generate(actorUserId: string, input: GenerateOrgReportInput): Promise<OrgReport> {
    const organizationId = this.requireOrgId();
    const period = resolveReportPeriod(input.periodStart, input.periodEnd);
    const filters = normalizeFilters(input.kind, input.filters);

    // Una violación de unicidad aborta la transacción entera (Postgres), así
    // que se reintenta la generación completa: si fue una carrera con otra
    // petición idéntica, el reintento encuentra su fila (mismo sello) y la
    // devuelve; si fue un choque de folio, el reintento sortea otro.
    for (let attempt = 1; ; attempt++) {
      try {
        const { row, reused } = await this.generateOnce(
          organizationId,
          actorUserId,
          input,
          period,
          filters,
        );
        return toContract(row, reused);
      } catch (error) {
        if (isUniqueConstraintViolation(error) && attempt < CODE_MAX_ATTEMPTS) continue;
        throw error;
      }
    }
  }

  private generateOnce(
    organizationId: string,
    actorUserId: string,
    input: GenerateOrgReportInput,
    period: ReportPeriod,
    filters: SocialServiceReportFilters,
  ): Promise<{ row: OrgReportRow; reused: boolean }> {
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const [{ snapshot, rteVigente }, available] = await Promise.all([
        this.organizationSnapshot(tx, organizationId),
        this.currentSigners(tx, organizationId),
      ]);

      const registered = new Set(available.keys());
      let roles: LegalRepresentativeRole[];
      if (input.signerRoles && input.signerRoles.length > 0) {
        const requested = input.signerRoles;
        const missing = requested.filter((r) => !registered.has(r));
        if (missing.length > 0) {
          throw new BadRequestException(
            `No hay firma registrada para: ${missing.map((r) => SIGNER_ROLE_LABEL[r]).join(', ')}. ` +
              'Regístrala en Documentos → Representante legal.',
          );
        }
        roles = SIGNER_ORDER.filter((r) => requested.includes(r));
      } else {
        roles = defaultSignerRoles(input.kind, registered);
      }

      const legalEffect = computeLegalEffect({
        kind: input.kind,
        formalizationState: snapshot.formalizationState,
        rteVigente,
        hasNit: Boolean(snapshot.nit),
        signerRoles: roles,
      });
      // Un comprobante informativo NUNCA lleva firmas: no debe parecer un
      // documento con efecto legal.
      const signers: SealedSigner[] =
        legalEffect === 'informative'
          ? []
          : roles.map((r) => available.get(r)).filter((s): s is SealedSigner => !!s);

      const payload =
        input.kind === 'donations'
          ? await this.donationsPayload(tx, organizationId, snapshot, period)
          : await this.socialServicePayload(tx, organizationId, snapshot, period, filters);

      const contentHash = sealHash({
        kind: input.kind,
        period: { start: period.startDate, end: period.endDate },
        filters,
        legalEffect,
        signers,
        payload,
      });

      const existing = await tx.orgReport.findUnique({
        where: {
          organizationId_kind_contentHash: { organizationId, kind: input.kind, contentHash },
        },
      });
      if (existing) {
        return { row: existing, reused: true };
      }

      const summary = summarize(payload);
      const createdAt = new Date();
      const created = await this.insertReport(tx, {
        organizationId,
        kind: input.kind,
        code: generateReportCode(createdAt.getUTCFullYear()),
        period,
        filters,
        legalEffect,
        signers,
        payload,
        summary,
        contentHash,
        actorUserId,
        createdAt,
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'report.generated',
        entityType: 'org_report',
        entityId: created.id,
        // Sin datos personales: solo identificadores y agregados.
        metadata: {
          kind: input.kind,
          code: created.code,
          periodStart: period.startDate,
          periodEnd: period.endDate,
          legalEffect,
          rowCount: summary.rowCount,
        },
      });
      return { row: created, reused: false };
    });
  }

  private async insertReport(
    tx: Prisma.TransactionClient,
    data: {
      organizationId: string;
      kind: OrgReportKind;
      code: string;
      period: ReportPeriod;
      filters: SocialServiceReportFilters;
      legalEffect: OrgReportLegalEffect;
      signers: SealedSigner[];
      payload: OrgReportPayload;
      summary: OrgReportSummary;
      contentHash: string;
      actorUserId: string;
      createdAt: Date;
    },
  ): Promise<OrgReportRow> {
    return tx.orgReport.create({
      data: {
        organizationId: data.organizationId,
        kind: data.kind,
        code: data.code,
        periodStart: new Date(`${data.period.startDate}T00:00:00.000Z`),
        periodEnd: new Date(`${data.period.endDate}T00:00:00.000Z`),
        filters: data.filters as unknown as Prisma.InputJsonValue,
        legalEffect: data.legalEffect,
        signers: data.signers as unknown as Prisma.InputJsonValue,
        payload: data.payload as unknown as Prisma.InputJsonValue,
        summary: data.summary as unknown as Prisma.InputJsonValue,
        contentHash: data.contentHash,
        generatedByUserId: data.actorUserId,
        createdAt: data.createdAt,
      },
    });
  }

  private async donationsPayload(
    tx: Prisma.TransactionClient,
    organizationId: string,
    organization: ReportOrganizationSnapshot,
    period: ReportPeriod,
  ) {
    const range = { gte: period.fromUtc, lt: period.toUtcExclusive };
    const donations = await tx.donation.findMany({
      where: {
        organizationId,
        status: 'approved',
        OR: [{ receipt: { issuedAt: range } }, { receipt: null, updatedAt: range }],
      },
      include: {
        receipt: { select: { id: true, issuedAt: true } },
        certificate: { select: { code: true } },
      },
    });
    const campaignIds = [
      ...new Set(donations.filter((d) => d.conceptKind === 'campaign').map((d) => d.conceptId)),
    ];
    const animalIds = [
      ...new Set(donations.filter((d) => d.conceptKind === 'animal').map((d) => d.conceptId)),
    ];
    const [campaigns, animals] = await Promise.all([
      campaignIds.length
        ? tx.campaign.findMany({
            where: { organizationId, id: { in: campaignIds } },
            select: { id: true, title: true },
          })
        : Promise.resolve([]),
      animalIds.length
        ? tx.animal.findMany({
            where: { organizationId, id: { in: animalIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);
    return buildDonationsPayload({
      organization,
      period: { start: period.startDate, end: period.endDate },
      donations: donations.map((d) => ({
        id: d.id,
        conceptKind: d.conceptKind,
        conceptId: d.conceptId,
        amountCharged: d.amountCharged,
        breakdown: d.breakdown as unknown as {
          net: number;
          platformFee: number;
          platformIva: number;
          gatewayFee: number;
          gatewayIva: number;
        },
        payer: (d.payer as { fullName?: string; documentId?: string } | null) ?? null,
        anonymous: d.anonymous,
        approvedAt: d.receipt?.issuedAt ?? d.updatedAt,
        receiptId: d.receipt?.id,
        certificateCode: d.certificate?.code,
      })),
      campaignNames: new Map(campaigns.map((c) => [c.id, c.title])),
      animalNames: new Map(animals.map((a) => [a.id, a.name])),
    });
  }

  private async socialServicePayload(
    tx: Prisma.TransactionClient,
    organizationId: string,
    organization: ReportOrganizationSnapshot,
    period: ReportPeriod,
    filters: SocialServiceReportFilters,
  ) {
    const enrollments = await tx.volunteerEnrollment.findMany({
      where: { organizationId, status: { in: ['accepted', 'completed'] } },
      include: {
        opportunity: { select: { title: true } },
        serviceHours: { select: { date: true, hours: true, status: true } },
        certificate: { select: { id: true, issuedAt: true } },
      },
    });
    return buildSocialServicePayload({
      organization,
      period: {
        start: period.startDate,
        end: period.endDate,
        fromUtc: period.fromUtc,
        toUtcExclusive: period.toUtcExclusive,
      },
      filters,
      minHours: studentServiceMinHours(),
      enrollments: enrollments.map((e) => ({
        id: e.id,
        volunteerName: e.volunteerName,
        opportunityTitle: e.opportunity.title,
        appliesToStudentService: e.appliesToStudentService,
        schoolName: e.schoolName,
        schoolAgreementCode: e.schoolAgreementCode,
        hours: e.serviceHours,
        certificate: e.certificate ?? undefined,
      })),
    });
  }

  async list(limit: number, offset: number, kind?: string): Promise<Paginated<OrgReport>> {
    const organizationId = this.requireOrgId();
    const take = Math.min(
      Math.max(Number.isFinite(limit) && limit > 0 ? limit : 20, 1),
      MAX_LIST_LIMIT,
    );
    const skip = Math.max(Number.isFinite(offset) ? offset : 0, 0);
    const where: Prisma.OrgReportWhereInput = { organizationId };
    if (kind === 'donations' || kind === 'social_service') where.kind = kind;
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.orgReport.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
        tx.orgReport.count({ where }),
      ]);
      return { items: rows.map((r) => toContract(r)), total, limit: take, offset: skip };
    });
  }

  private async findOwn(id: string): Promise<OrgReportRow> {
    const organizationId = this.requireOrgId();
    const row = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.orgReport.findFirst({ where: { id, organizationId } }),
    );
    if (!row) {
      throw new NotFoundException('Reporte no encontrado.');
    }
    return row;
  }

  private async recordDownload(row: OrgReportRow, actorUserId: string, format: 'pdf' | 'xlsx') {
    await this.audit.record({
      organizationId: row.organizationId,
      actorUserId,
      action: 'report.downloaded',
      entityType: 'org_report',
      entityId: row.id,
      metadata: { code: row.code, format },
    });
  }

  /** PDF dibujado desde el snapshot sellado, con LAS firmas selladas (por id
   *  + hash), aunque después se hayan registrado firmas nuevas. */
  async renderPdf(id: string, actorUserId: string): Promise<{ filename: string; data: Buffer }> {
    const row = await this.findOwn(id);
    const sealed = row.signers as unknown as SealedSigner[];
    const signers = await Promise.all(
      sealed.map(async (s) => ({
        role: s.role,
        fullName: s.fullName,
        position: s.position,
        image: await this.legalRepresentatives.getSignatureImageById(
          row.organizationId,
          s.legalRepresentativeId,
          s.signatureHash,
        ),
      })),
    );
    const data = await renderReportPdf({
      code: row.code,
      contentHash: row.contentHash,
      createdAt: row.createdAt,
      legalEffect: row.legalEffect as OrgReportLegalEffect,
      payload: row.payload as unknown as OrgReportPayload,
      signers,
      verifyUrl: this.verifyUrl(row.code),
    });
    await this.recordDownload(row, actorUserId, 'pdf');
    return { filename: `${row.code}.pdf`, data };
  }

  async renderXlsx(id: string, actorUserId: string): Promise<{ filename: string; data: Buffer }> {
    const row = await this.findOwn(id);
    const data = await renderReportXlsx({
      code: row.code,
      contentHash: row.contentHash,
      createdAt: row.createdAt,
      legalEffect: row.legalEffect as OrgReportLegalEffect,
      payload: row.payload as unknown as OrgReportPayload,
      signers: (row.signers as unknown as SealedSigner[]).map(({ role, fullName, position }) => ({
        role,
        fullName,
        position,
      })),
      verifyUrl: this.verifyUrl(row.code),
    });
    await this.recordDownload(row, actorUserId, 'xlsx');
    return { filename: `${row.code}.xlsx`, data };
  }

  /** Verificación pública por folio (sin sesión) — superficie mínima. */
  async verifyPublic(code: string): Promise<OrgReportVerification> {
    const normalized = code.trim().toUpperCase();
    if (!REPORT_CODE_PATTERN.test(normalized)) {
      throw new NotFoundException('No existe ningún reporte con ese folio.');
    }
    const rows = await this.prisma.$queryRaw<Array<{ data: OrgReportVerification | null }>>(
      Prisma.sql`SELECT org_report_public(${normalized}) AS data`,
    );
    const data = rows[0]?.data;
    if (!data) {
      throw new NotFoundException('No existe ningún reporte con ese folio.');
    }
    return data;
  }
}
