import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import {
  Prisma,
  type OrgReport as OrgReportRow,
  type OrgReportApproval as ApprovalRecord,
} from '@prisma/client';
import {
  Role,
  SIGNATURE_CONSENT_TEXT,
  SIGNATURE_CONSENT_VERSION,
  type DecideOrgReportInput,
  type DecideSignatureRequestInput,
  type SignatureRequestDecisionResult,
  type SignatureRequestPreview,
  type GenerateOrgReportInput,
  type LegalRepresentativeRole,
  type OrgReportApprovalInfo,
  type OrgReportPendingSignature,
  type OrgReportPolicy,
  type OrgReportStatus,
  type SetOrgReportPolicyInput,
  type OrganizationLocation,
  type OrgReport,
  type OrgReportKind,
  type OrgReportLegalEffect,
  type OrgReportSigner,
  type OrgReportSummary,
  type OrgReportVerification,
  type OrgReportsReadiness,
  type OrgThirdPartyConsentSummary,
  type Paginated,
  type SocialServiceReportFilters,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../../core/notifications/notification.port';
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
  /** Cuenta de la persona que firma: solo ella puede aprobar este documento. */
  signerUserId: string;
  legalRepresentativeId: string;
  signatureHash: string;
}

const CODE_MAX_ATTEMPTS = 3;
/** Vigencia del enlace de firma que recibe el contador o revisor fiscal. */
const SIGNATURE_REQUEST_DAYS = 7;
const INVALID_SIGNATURE_LINK =
  'Este enlace de firma no es válido, ya se usó o venció. Pide a la organización que te lo envíe de nuevo.';

/** Aviso de firma pendiente; `token` solo para quien firma por enlace. */
interface SignatureNotice {
  email: string;
  role: LegalRepresentativeRole;
  token?: string;
  firstTime?: boolean;
}

function hashSignatureToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Compara documentos sin puntos, espacios ni guiones. */
function normalizeDocument(value: string): string {
  return value.replace(/[\s.-]/g, '').toUpperCase();
}
const MAX_LIST_LIMIT = 50;

type ApprovalRow = Pick<ApprovalRecord, 'signerRole' | 'decision' | 'decidedAt'>;

/** Estado de emisión: sin firmantes requeridos ⇒ emitido; algún rechazo ⇒
 *  rechazado; todas las aprobaciones ⇒ emitido; si no, pendiente. */
function statusFor(sealed: SealedSigner[], approvals: ApprovalRow[]): OrgReportStatus {
  if (sealed.length === 0) return 'issued';
  if (approvals.some((a) => a.decision === 'rejected')) return 'rejected';
  const approved = new Set(
    approvals.filter((a) => a.decision === 'approved').map((a) => a.signerRole),
  );
  return sealed.every((s) => approved.has(s.role)) ? 'issued' : 'pending_signatures';
}

function toContract(row: OrgReportRow, reused?: boolean, approvals: ApprovalRow[] = []): OrgReport {
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
    status: statusFor(row.signers as unknown as SealedSigner[], approvals),
    approvals: approvals.map((a): OrgReportApprovalInfo => ({
      role: a.signerRole as LegalRepresentativeRole,
      decision: a.decision as 'approved' | 'rejected',
      decidedAt: a.decidedAt.toISOString(),
    })),
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
const SIGNATURES_PENDING_STEP =
  'Por ahora los reportes salen como comprobantes informativos, sin firmas: la firma de cada representante se estampará solo cuando él mismo apruebe el documento con su cuenta.';

@Injectable()
export class ReportsService {
  private readonly webBaseUrl: string;
  private readonly signaturesEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    private readonly legalRepresentatives: LegalRepresentativeService,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.signaturesEnabled = config.get('REPORTS_SIGNATURES_ENABLED') === true;
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

  /**
   * Firmantes VÁLIDOS hoy (el registro más reciente por cargo) con id y hash de
   * la firma. Solo cuenta quien puede firmar de verdad: el representante legal
   * debe seguir siendo Owner de la organización y el contador / revisor fiscal
   * debe tener su designación vigente (vinculada por la organización).
   */
  private async currentSigners(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<Map<LegalRepresentativeRole, SealedSigner>> {
    const [rows, designations, owners] = await Promise.all([
      tx.legalRepresentative.findMany({
        where: { organizationId },
        orderBy: { signedAt: 'desc' },
      }),
      tx.orgSignerDesignation.findMany({
        where: { organizationId, revokedAt: null },
        select: { userId: true, role: true },
      }),
      tx.userRole.findMany({
        where: { organizationId, role: Role.Owner },
        select: { userId: true },
      }),
    ]);
    const ownerIds = new Set(owners.map((o) => o.userId));
    const byRole = new Map<LegalRepresentativeRole, SealedSigner>();
    // Representante legal: el registro más reciente manda, si sigue siendo Owner.
    const legal = rows.find((r) => r.role === 'legal_representative');
    if (legal && ownerIds.has(legal.memberId)) {
      byRole.set('legal_representative', {
        role: 'legal_representative',
        fullName: legal.fullName,
        position: legal.position,
        signerUserId: legal.memberId,
        legalRepresentativeId: legal.id,
        signatureHash: legal.signatureHash,
      });
    }
    // Contador / revisor fiscal: la persona con designación vigente, con su
    // firma más reciente si ya la registró. Sin firma todavía también cuenta:
    // la registra al aprobar el primer documento desde el enlace del correo.
    const userIds = designations.map((d) => d.userId);
    const users =
      userIds.length > 0
        ? await tx.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, displayName: true },
          })
        : [];
    for (const d of designations) {
      const role = d.role as LegalRepresentativeRole;
      if (!SIGNER_ORDER.includes(role)) continue;
      const own = rows.find((r) => r.role === role && r.memberId === d.userId);
      byRole.set(role, {
        role,
        fullName: own?.fullName ?? users.find((u) => u.id === d.userId)?.displayName ?? '',
        position: own?.position ?? SIGNER_ROLE_LABEL[role],
        signerUserId: d.userId,
        legalRepresentativeId: own?.id ?? '',
        signatureHash: own?.signatureHash ?? '',
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

  async readiness(actorUserId: string): Promise<OrgReportsReadiness> {
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
      const policies = await this.policies();
      const mySignerRole = await this.signerRoleOf(tx, organizationId, actorUserId);
      const registered = new Set(signers.keys());
      const effectFor = (kind: OrgReportKind) =>
        computeLegalEffect({
          kind,
          formalizationState: snapshot.formalizationState,
          rteVigente,
          hasNit: Boolean(snapshot.nit),
          signerRoles: this.signaturesEnabled ? defaultSignerRoles(kind, registered) : [],
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
        nextSteps: this.signaturesEnabled
          ? nextStepsFor({
              formalizationState: snapshot.formalizationState,
              rteVigente,
              hasNit: Boolean(snapshot.nit),
              registered,
            })
          : [SIGNATURES_PENDING_STEP],
        signaturesEnabled: this.signaturesEnabled,
        policies,
        ...(mySignerRole ? { mySignerRole } : {}),
        thirdPartyConsent: await this.consentSummary(tx, organizationId),
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
        const { row, reused, approvals, notify } = await this.generateOnce(
          organizationId,
          actorUserId,
          input,
          period,
          filters,
        );
        if (!reused) await this.requestSignatures(row, notify);
        return toContract(row, reused, approvals);
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
  ): Promise<{
    row: OrgReportRow;
    reused: boolean;
    approvals: ApprovalRecord[];
    notify: SignatureNotice[];
  }> {
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const [{ snapshot, rteVigente }, available] = await Promise.all([
        this.organizationSnapshot(tx, organizationId),
        this.currentSigners(tx, organizationId),
      ]);

      const registered = new Set(available.keys());
      let roles: LegalRepresentativeRole[];
      if (!this.signaturesEnabled) {
        // Sin aprobación del propio firmante, la plataforma no estampa firmas.
        if (input.signerRoles && input.signerRoles.length > 0) {
          throw new BadRequestException(SIGNATURES_PENDING_STEP);
        }
        roles = [];
      } else if (input.signerRoles && input.signerRoles.length > 0) {
        roles = this.orderedAvailable(
          input.signerRoles,
          registered,
          'No hay firma registrada para',
        );
      } else {
        const policy = await tx.orgReportPolicy.findUnique({
          where: { organizationId_kind: { organizationId, kind: input.kind } },
        });
        roles = policy
          ? this.orderedAvailable(
              policy.requiredRoles as LegalRepresentativeRole[],
              registered,
              'La política de firmas de la organización exige a',
            )
          : defaultSignerRoles(input.kind, registered);
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

      // La cuenta principal (Owner) emite con la firma del representante legal
      // que ella misma registró: generar ES su autorización. El contador y el
      // revisor fiscal nunca generan (no tienen ese rol), así que nadie más
      // puede quedar como firmante y redactor a la vez.
      const selfSigner = signers.find((signer) => signer.signerUserId === actorUserId);
      if (selfSigner && selfSigner.role !== 'legal_representative') {
        throw new BadRequestException(
          'Quien redacta el documento no puede ser también su firmante. Pide a un administrador que lo redacte, o genéralo como comprobante informativo.',
        );
      }

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
        const approvals = await this.approvalsByReport(tx, organizationId, [existing.id]);
        return {
          row: existing,
          reused: true,
          approvals: approvals.get(existing.id) ?? [],
          notify: [],
        };
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

      const approvals: ApprovalRecord[] = [];
      if (selfSigner) {
        approvals.push(
          await tx.orgReportApproval.create({
            data: {
              organizationId,
              reportId: created.id,
              signerRole: selfSigner.role,
              signerUserId: actorUserId,
              legalRepresentativeId: selfSigner.legalRepresentativeId,
              signatureHash: selfSigner.signatureHash,
              contentHash: created.contentHash,
              decision: 'approved',
            },
          }),
        );
        await this.audit.recordWithTx(tx, {
          organizationId,
          actorUserId,
          action: 'report.approved',
          entityType: 'org_report',
          entityId: created.id,
          metadata: { code: created.code, signerRole: selfSigner.role, onGenerate: true },
        });
      }
      if (signers.length > 0 && statusFor(signers, approvals) === 'issued') {
        await this.audit.recordWithTx(tx, {
          organizationId,
          actorUserId,
          action: 'report.issued',
          entityType: 'org_report',
          entityId: created.id,
          metadata: {
            code: created.code,
            requestedByUserId: actorUserId,
            signerRoles: signers.map((s) => s.role),
          },
        });
      }

      // Las demás firmas (contador, revisor fiscal, o el representante legal si
      // redactó un administrador) se piden por correo a cada persona.
      const notify = await this.signatureRequestsFor(
        tx,
        created,
        signers.filter((s) => s.signerUserId !== actorUserId),
      );
      return { row: created, reused: false, approvals, notify };
    });
  }

  /**
   * Correo a cada firmante pendiente con el enlace a "Documentos por firmar".
   * El correo solo avisa: la autorización se da con la propia cuenta de la
   * persona (sesión iniciada), que es lo que la identifica (Ley 527, art. 7).
   * Nunca bloquea la generación: si el correo falla, el pendiente sigue en la
   * bandeja de la persona.
   */
  private async requestSignatures(row: OrgReportRow, notify: SignatureNotice[]): Promise<void> {
    if (notify.length === 0) return;
    const payload = row.payload as unknown as OrgReportPayload;
    const orgName = payload.organization?.name ?? 'Tu organización';
    const kindLabel =
      row.kind === 'donations' ? 'el informe de donaciones' : 'el reporte de servicio social';
    await Promise.all(
      notify.map(({ email, role, token, firstTime }) => {
        const how = token
          ? (firstTime
              ? 'Es la primera vez: en el enlace registras tu firma y autorizas que la ' +
                'organización la guarde. Solo se estampará en los documentos que tú apruebes, ' +
                'uno por uno.\n\n'
              : '') +
            `Ábrelo para ver el documento y aprobarlo o rechazarlo (sirve una sola vez y vence en ${SIGNATURE_REQUEST_DAYS} días):\n\n` +
            `${this.webBaseUrl}/firmar#token=${encodeURIComponent(token)}\n\n`
          : 'Revísalo y autorízalo (o recházalo) con tu propia cuenta aquí:\n\n' +
            `${this.webBaseUrl}/organizacion/documentos-por-firmar\n\n`;
        return this.notifications
          .send({
            to: email,
            subject: `${orgName} necesita tu firma como ${SIGNER_ROLE_LABEL[role].toLowerCase()}`,
            body:
              'Hola,\n\n' +
              `${orgName} generó ${kindLabel} con folio ${row.code} y necesita tu firma como ` +
              `${SIGNER_ROLE_LABEL[role].toLowerCase()}.\n\n` +
              how +
              'Mientras no lo autorices, el documento queda pendiente de firma y no se emite. ' +
              'Si no esperabas este correo, ignóralo.',
            ...(token ? {} : { idempotencyKey: `report.signature_request:${row.id}:${role}` }),
          })
          .catch(() => undefined);
      }),
    );
  }

  /**
   * Prepara el aviso de cada firmante pendiente. El contador y el revisor
   * fiscal reciben un enlace de un solo uso (solo se guarda su SHA-256); el
   * representante legal, que tiene cuenta, va a su bandeja.
   */
  private async signatureRequestsFor(
    tx: Prisma.TransactionClient,
    report: OrgReportRow,
    pending: SealedSigner[],
  ): Promise<SignatureNotice[]> {
    if (pending.length === 0) return [];
    const users = await tx.user.findMany({
      where: { id: { in: pending.map((s) => s.signerUserId) } },
      select: { id: true, email: true },
    });
    const out: SignatureNotice[] = [];
    for (const s of pending) {
      const email = users.find((u) => u.id === s.signerUserId)?.email;
      if (!email) continue;
      if (s.role === 'legal_representative') {
        out.push({ email, role: s.role });
        continue;
      }
      const token = randomBytes(32).toString('base64url');
      await tx.orgSignatureRequest.create({
        data: {
          organizationId: report.organizationId,
          reportId: report.id,
          signerRole: s.role,
          signerUserId: s.signerUserId,
          tokenHash: hashSignatureToken(token),
          expiresAt: new Date(Date.now() + SIGNATURE_REQUEST_DAYS * 86_400_000),
        },
      });
      const registered = await tx.legalRepresentative.findFirst({
        where: { organizationId: report.organizationId, role: s.role, memberId: s.signerUserId },
        select: { id: true },
      });
      out.push({ email, role: s.role, token, firstTime: !registered });
    }
    return out;
  }

  /** Vuelve a enviar el enlace a quienes aún no han decidido (p. ej. si venció). */
  async resendSignatureRequests(id: string): Promise<{ sent: number }> {
    const organizationId = this.requireOrgId();
    const { row, notify } = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const row = await tx.orgReport.findFirst({ where: { id, organizationId } });
      if (!row) throw new NotFoundException('Reporte no encontrado.');
      const approvals = await this.approvalsByReport(tx, organizationId, [row.id]);
      const decided = approvals.get(row.id) ?? [];
      if (decided.some((a) => a.decision === 'rejected')) {
        throw new ConflictException('Este documento fue rechazado y no se emitirá.');
      }
      const pending = (row.signers as unknown as SealedSigner[]).filter(
        (s) => s.role !== 'legal_representative' && !decided.some((a) => a.signerRole === s.role),
      );
      return { row, notify: await this.signatureRequestsFor(tx, row, pending) };
    });
    await this.requestSignatures(row, notify);
    return { sent: notify.length };
  }

  /** Resuelve un token de firma, o 400 con un solo mensaje para cualquier fallo. */
  private async resolveSignatureRequest(token: string) {
    const found = await this.prisma.$queryRaw<
      Array<{ request: { id: string; organizationId: string } | null }>
    >`SELECT org_signature_request_by_token_hash(${hashSignatureToken(token)}) AS request`;
    const ref = found[0]?.request;
    if (!ref) throw new BadRequestException(INVALID_SIGNATURE_LINK);
    const data = await this.prisma.withOrgContext(ref.organizationId, async (tx) => {
      const request = await tx.orgSignatureRequest.findFirst({ where: { id: ref.id } });
      if (!request || request.usedAt || request.expiresAt <= new Date()) return null;
      const designation = await tx.orgSignerDesignation.findFirst({
        where: {
          organizationId: ref.organizationId,
          userId: request.signerUserId,
          role: request.signerRole,
          revokedAt: null,
        },
      });
      if (!designation) return null;
      const report = await tx.orgReport.findFirst({ where: { id: request.reportId } });
      const approvals = await this.approvalsByReport(tx, ref.organizationId, [request.reportId]);
      const decided = approvals.get(request.reportId) ?? [];
      if (
        !report ||
        decided.some((a) => a.decision === 'rejected' || a.signerRole === request.signerRole)
      ) {
        return null;
      }
      const registered = await tx.legalRepresentative.findFirst({
        where: {
          organizationId: ref.organizationId,
          role: request.signerRole,
          memberId: request.signerUserId,
        },
        orderBy: { signedAt: 'desc' },
      });
      const signer = await tx.user.findFirst({
        where: { id: request.signerUserId },
        select: { displayName: true },
      });
      return { request, report, decided, registered, signerName: signer?.displayName ?? '' };
    });
    if (!data) throw new BadRequestException(INVALID_SIGNATURE_LINK);
    return data;
  }

  /** Lo que ve el firmante al abrir el enlace (sin sesión). */
  async previewSignatureRequest(token: string): Promise<SignatureRequestPreview> {
    const { request, report, registered, signerName } = await this.resolveSignatureRequest(token);
    const contract = toContract(report);
    return {
      organizationName:
        (report.payload as unknown as OrgReportPayload).organization?.name ?? 'La organización',
      role: request.signerRole as SignatureRequestPreview['role'],
      signerName: registered?.fullName ?? signerName,
      needsSignature: !registered,
      expiresAt: request.expiresAt.toISOString(),
      report: {
        kind: contract.kind,
        code: contract.code,
        periodStart: contract.periodStart,
        periodEnd: contract.periodEnd,
        legalEffect: contract.legalEffect,
        summary: contract.summary,
        contentHash: contract.contentHash,
      },
      consentText: SIGNATURE_CONSENT_TEXT,
      consentVersion: SIGNATURE_CONSENT_VERSION,
    };
  }

  /** El borrador en PDF (sin firmas) para leerlo antes de decidir. */
  async signatureRequestPdf(token: string): Promise<{ filename: string; data: Buffer }> {
    const { report } = await this.resolveSignatureRequest(token);
    const sealed = report.signers as unknown as SealedSigner[];
    const data = await renderReportPdf({
      code: report.code,
      contentHash: report.contentHash,
      createdAt: report.createdAt,
      legalEffect: report.legalEffect as OrgReportLegalEffect,
      payload: report.payload as unknown as OrgReportPayload,
      signers: sealed.map((s) => ({
        role: s.role,
        fullName: s.fullName,
        position: s.position,
        image: null,
      })),
      verifyUrl: this.verifyUrl(report.code),
      draft: 'pending_signatures',
    });
    return { filename: `${report.code}-borrador.pdf`, data };
  }

  /**
   * Aprobar o rechazar desde el enlace del correo. Para aprobar: consentimiento
   * expreso y su número de documento (el que registró; la primera vez, el que
   * registra junto con su firma). La evidencia (versión del consentimiento,
   * IP, navegador, huella del contenido) queda en la auditoría append-only.
   */
  async decideSignatureRequest(
    input: DecideSignatureRequestInput,
    evidence: { ip?: string; userAgent?: string },
  ): Promise<SignatureRequestDecisionResult> {
    const first = await this.resolveSignatureRequest(input.token);
    const { request } = first;
    const organizationId = request.organizationId;
    const signerUserId = request.signerUserId;
    const role = request.signerRole as LegalRepresentativeRole;
    const normalizedDoc = normalizeDocument(input.documentNumber);

    if (input.decision === 'approved') {
      if (input.consent !== true) {
        throw new BadRequestException('Para aprobar debes aceptar el consentimiento.');
      }
      if (!first.registered) {
        if (!input.signature) {
          throw new BadRequestException('Es tu primera firma: dibújala o sube una imagen.');
        }
        await this.legalRepresentatives.register(
          signerUserId,
          {
            role,
            fullName: input.signature.fullName,
            documentType: input.signature.documentType,
            documentNumber: input.documentNumber,
            position: input.signature.position,
            signatureBase64: input.signature.signatureBase64,
            signatureContentType: input.signature.signatureContentType,
          },
          organizationId,
        );
      }
    }
    if (first.registered && normalizeDocument(first.registered.documentNumber) !== normalizedDoc) {
      throw new BadRequestException(
        'El número de documento no coincide con el de la firma registrada.',
      );
    }

    try {
      return await this.prisma.withOrgContext(organizationId, async (tx) => {
        const used = await tx.orgSignatureRequest.updateMany({
          where: { id: request.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        if (used.count !== 1) throw new BadRequestException(INVALID_SIGNATURE_LINK);
        const row = await tx.orgReport.findFirstOrThrow({ where: { id: request.reportId } });
        const sealed = row.signers as unknown as SealedSigner[];
        const meta = {
          channel: 'email_link',
          consentVersion: input.decision === 'approved' ? SIGNATURE_CONSENT_VERSION : undefined,
          ip: evidence.ip,
          userAgent: evidence.userAgent?.slice(0, 200),
          contentHash: row.contentHash,
        };
        const current = (await this.currentSigners(tx, organizationId)).get(role);
        if (!current?.legalRepresentativeId) {
          // Rechazo de alguien que nunca registró firma: no hay firma que
          // ligar; queda la constancia y el documento no se emite.
          await this.audit.recordWithTx(tx, {
            organizationId,
            actorUserId: signerUserId,
            action: 'report.rejected',
            entityType: 'org_report',
            entityId: row.id,
            metadata: { code: row.code, signerRole: role, ...meta },
          });
          return { decision: input.decision, status: 'pending_signatures', code: row.code };
        }
        const all = await this.recordDecision(tx, row, sealed, current, input.decision, meta);
        return { decision: input.decision, status: statusFor(sealed, all), code: row.code };
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) throw new BadRequestException(INVALID_SIGNATURE_LINK);
      throw error;
    }
  }

  /** Registra una decisión (append-only) y, si con ella están todas, la emisión. */
  private async recordDecision(
    tx: Prisma.TransactionClient,
    row: OrgReportRow,
    sealed: SealedSigner[],
    signer: SealedSigner,
    decision: 'approved' | 'rejected',
    extraMetadata: Record<string, unknown> = {},
  ): Promise<ApprovalRecord[]> {
    const existing = await tx.orgReportApproval.findMany({
      where: { organizationId: row.organizationId, reportId: row.id },
    });
    const approval = await tx.orgReportApproval.create({
      data: {
        organizationId: row.organizationId,
        reportId: row.id,
        signerRole: signer.role,
        signerUserId: signer.signerUserId,
        legalRepresentativeId: signer.legalRepresentativeId,
        signatureHash: signer.signatureHash,
        contentHash: row.contentHash,
        decision,
      },
    });
    const all = [...existing, approval];
    await this.audit.recordWithTx(tx, {
      organizationId: row.organizationId,
      actorUserId: signer.signerUserId,
      action: decision === 'approved' ? 'report.approved' : 'report.rejected',
      entityType: 'org_report',
      entityId: row.id,
      metadata: { code: row.code, signerRole: signer.role, ...extraMetadata },
    });
    if (statusFor(sealed, all) === 'issued') {
      await this.audit.recordWithTx(tx, {
        organizationId: row.organizationId,
        actorUserId: signer.signerUserId,
        action: 'report.issued',
        entityType: 'org_report',
        entityId: row.id,
        metadata: {
          code: row.code,
          requestedByUserId: row.generatedByUserId,
          signerRoles: sealed.map((s) => s.role),
        },
      });
    }
    return all;
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
        donorUserId: d.donorUserId,
        anonymous: d.anonymous,
        approvedAt: d.receipt?.issuedAt ?? d.updatedAt,
        receiptId: d.receipt?.id,
        certificateCode: d.certificate?.code,
      })),
      campaignNames: new Map(campaigns.map((c) => [c.id, c.title])),
      animalNames: new Map(animals.map((a) => [a.id, a.name])),
      consentedUserIds: await this.consentedUserIds(tx, organizationId),
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
      consentedUserIds: await this.consentedUserIds(tx, organizationId),
      enrollments: enrollments.map((e) => ({
        id: e.id,
        volunteerUserId: e.volunteerUserId,
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

  /** Cuántos voluntarios y donantes con cuenta autorizaron; solo conteos, sin identidades. */
  private async consentSummary(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<OrgThirdPartyConsentSummary> {
    const consented = await this.consentedUserIds(tx, organizationId);
    const [volunteers, donors] = await Promise.all([
      tx.volunteerEnrollment.findMany({
        where: { organizationId, status: { in: ['accepted', 'completed'] } },
        select: { volunteerUserId: true },
        distinct: ['volunteerUserId'],
      }),
      tx.donation.findMany({
        where: { organizationId, status: 'approved', donorUserId: { not: null }, anonymous: false },
        select: { donorUserId: true },
        distinct: ['donorUserId'],
      }),
    ]);
    const count = (ids: Array<string | null>) => ({
      total: ids.length,
      authorized: ids.filter((id) => id && consented.has(id)).length,
    });
    return {
      registryAvailable: true,
      volunteers: count(volunteers.map((v) => v.volunteerUserId)),
      donors: count(donors.map((d) => d.donorUserId)),
    };
  }

  /**
   * Personas con consentimiento VIGENTE de esta organización para ser
   * identificadas en sus documentos. Lee bajo RLS: una organización nunca ve
   * (ni puede usar) el consentimiento dado a otra.
   */
  private async consentedUserIds(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<ReadonlySet<string>> {
    const rows = await tx.thirdPartyConsent.findMany({
      where: { organizationId, purpose: 'org_report_identification', revokedAt: null },
      select: { subjectUserId: true },
    });
    return new Set(rows.map((r) => r.subjectUserId));
  }

  /** Cargo con el que esta persona puede firmar en la organización, si alguno. */
  private async signerRoleOf(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
  ): Promise<LegalRepresentativeRole | undefined> {
    const owner = await tx.userRole.findFirst({
      where: { organizationId, userId, role: Role.Owner },
      select: { id: true },
    });
    if (owner) return 'legal_representative';
    const designation = await tx.orgSignerDesignation.findFirst({
      where: { organizationId, userId, revokedAt: null },
      select: { role: true },
    });
    return (designation?.role as LegalRepresentativeRole | undefined) ?? undefined;
  }

  /** Cargos pedidos, en orden estable; todos deben tener un firmante válido. */
  private orderedAvailable(
    requested: readonly LegalRepresentativeRole[],
    registered: ReadonlySet<LegalRepresentativeRole>,
    prefix: string,
  ): LegalRepresentativeRole[] {
    const missing = requested.filter((r) => !registered.has(r));
    if (missing.length > 0) {
      throw new BadRequestException(
        `${prefix}: ${missing.map((r) => SIGNER_ROLE_LABEL[r]).join(', ')}. ` +
          'Vincula a la persona y que registre su firma (Documentos → Firmantes).',
      );
    }
    return SIGNER_ORDER.filter((r) => requested.includes(r));
  }

  /** Decisiones de firmantes de un conjunto de reportes, por id de reporte. */
  private async approvalsByReport(
    tx: Prisma.TransactionClient,
    organizationId: string,
    reportIds: string[],
  ): Promise<Map<string, ApprovalRecord[]>> {
    const byReport = new Map<string, ApprovalRecord[]>();
    if (reportIds.length === 0) return byReport;
    const rows = await tx.orgReportApproval.findMany({
      where: { organizationId, reportId: { in: reportIds } },
      orderBy: { decidedAt: 'asc' },
    });
    for (const row of rows) {
      byReport.set(row.reportId, [...(byReport.get(row.reportId) ?? []), row]);
    }
    return byReport;
  }

  /**
   * Un firmante adicional (contador / revisor fiscal con designación vigente)
   * solo ve los documentos que le toca firmar: no el resto de los reportes de
   * la organización. Owner y Administrator ven todo; un auditor sin designación
   * conserva su lectura de siempre.
   */
  private async isRestrictedSigner(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
  ): Promise<boolean> {
    const manager = await tx.userRole.findFirst({
      where: { organizationId, userId, role: { in: [Role.Owner, Role.Administrator] } },
      select: { id: true },
    });
    if (manager) return false;
    const designation = await tx.orgSignerDesignation.findFirst({
      where: { organizationId, userId, revokedAt: null },
      select: { id: true },
    });
    return Boolean(designation);
  }

  async list(
    actorUserId: string,
    limit: number,
    offset: number,
    kind?: string,
  ): Promise<Paginated<OrgReport>> {
    const organizationId = this.requireOrgId();
    const take = Math.min(
      Math.max(Number.isFinite(limit) && limit > 0 ? limit : 20, 1),
      MAX_LIST_LIMIT,
    );
    const skip = Math.max(Number.isFinite(offset) ? offset : 0, 0);
    const where: Prisma.OrgReportWhereInput = { organizationId };
    if (kind === 'donations' || kind === 'social_service') where.kind = kind;
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      if (await this.isRestrictedSigner(tx, organizationId, actorUserId)) {
        where.signers = { array_contains: [{ signerUserId: actorUserId }] };
      }
      const [rows, total] = await Promise.all([
        tx.orgReport.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
        tx.orgReport.count({ where }),
      ]);
      const approvals = await this.approvalsByReport(
        tx,
        organizationId,
        rows.map((r) => r.id),
      );
      return {
        items: rows.map((r) => toContract(r, undefined, approvals.get(r.id) ?? [])),
        total,
        limit: take,
        offset: skip,
      };
    });
  }

  private async findOwn(
    id: string,
    actorUserId: string,
  ): Promise<{ row: OrgReportRow; approvals: ApprovalRecord[] }> {
    const organizationId = this.requireOrgId();
    const found = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const row = await tx.orgReport.findFirst({ where: { id, organizationId } });
      if (!row) return null;
      if (await this.isRestrictedSigner(tx, organizationId, actorUserId)) {
        const sealed = row.signers as unknown as SealedSigner[];
        if (!sealed.some((s) => s.signerUserId === actorUserId)) return null;
      }
      const approvals = await this.approvalsByReport(tx, organizationId, [row.id]);
      return { row, approvals: approvals.get(row.id) ?? [] };
    });
    if (!found) {
      throw new NotFoundException('Reporte no encontrado.');
    }
    return found;
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

  /** Borrador: lo que se dibuja si el documento todavía no está emitido. */
  private draftOf(
    sealed: SealedSigner[],
    approvals: ApprovalRecord[],
  ): 'pending_signatures' | 'rejected' | undefined {
    const status = statusFor(sealed, approvals);
    return status === 'issued' ? undefined : status;
  }

  /** PDF dibujado desde el snapshot sellado. Emitido ⇒ con LAS firmas que cada
   *  firmante aprobó (por id + hash); si no, BORRADOR sin firmas ni valor. */
  async renderPdf(id: string, actorUserId: string): Promise<{ filename: string; data: Buffer }> {
    const { row, approvals } = await this.findOwn(id, actorUserId);
    const sealed = row.signers as unknown as SealedSigner[];
    const draft = this.draftOf(sealed, approvals);
    const signers = await Promise.all(
      sealed.map(async (s) => {
        const approval = approvals.find(
          (a) => a.signerRole === s.role && a.decision === 'approved',
        );
        return {
          role: s.role,
          fullName: s.fullName,
          position: s.position,
          image:
            draft || !approval
              ? null
              : await this.legalRepresentatives.getSignatureImageById(
                  row.organizationId,
                  approval.legalRepresentativeId,
                  approval.signatureHash,
                ),
        };
      }),
    );
    const data = await renderReportPdf({
      code: row.code,
      contentHash: row.contentHash,
      createdAt: row.createdAt,
      legalEffect: row.legalEffect as OrgReportLegalEffect,
      payload: row.payload as unknown as OrgReportPayload,
      signers,
      verifyUrl: this.verifyUrl(row.code),
      ...(draft ? { draft } : {}),
    });
    await this.recordDownload(row, actorUserId, 'pdf');
    return { filename: `${row.code}.pdf`, data };
  }

  async renderXlsx(id: string, actorUserId: string): Promise<{ filename: string; data: Buffer }> {
    const { row, approvals } = await this.findOwn(id, actorUserId);
    const sealed = row.signers as unknown as SealedSigner[];
    const draft = this.draftOf(sealed, approvals);
    const data = await renderReportXlsx({
      code: row.code,
      contentHash: row.contentHash,
      createdAt: row.createdAt,
      legalEffect: row.legalEffect as OrgReportLegalEffect,
      payload: row.payload as unknown as OrgReportPayload,
      signers: sealed.map(({ role, fullName, position }) => ({ role, fullName, position })),
      verifyUrl: this.verifyUrl(row.code),
      ...(draft ? { draft } : {}),
    });
    await this.recordDownload(row, actorUserId, 'xlsx');
    return { filename: `${row.code}.xlsx`, data };
  }

  /** Documentos que la persona debe firmar y aún no decidió. */
  async pending(actorUserId: string): Promise<OrgReportPendingSignature[]> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const rows = await tx.orgReport.findMany({
        where: { organizationId, signers: { array_contains: [{ signerUserId: actorUserId }] } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      const approvals = await this.approvalsByReport(
        tx,
        organizationId,
        rows.map((r) => r.id),
      );
      const out: OrgReportPendingSignature[] = [];
      for (const row of rows) {
        const sealed = row.signers as unknown as SealedSigner[];
        const mine = sealed.find((s) => s.signerUserId === actorUserId);
        const decided = approvals.get(row.id) ?? [];
        if (!mine || decided.some((a) => a.signerRole === mine.role || a.decision === 'rejected')) {
          continue;
        }
        out.push({ report: toContract(row, undefined, decided), role: mine.role });
      }
      return out;
    });
  }

  /**
   * Aprobar o rechazar un documento. Solo el propio firmante (la cuenta que se
   * selló en el documento), con su firma vigente, una sola vez, y nunca quien
   * lo redactó. La aprobación queda ligada a la huella del contenido y al hash
   * de la firma usada (append-only); cuando están todas, el documento queda
   * emitido y se audita quién lo completó.
   */
  async decide(actorUserId: string, id: string, input: DecideOrgReportInput): Promise<OrgReport> {
    const organizationId = this.requireOrgId();
    try {
      return await this.prisma.withOrgContext(organizationId, async (tx) => {
        const row = await tx.orgReport.findFirst({ where: { id, organizationId } });
        const sealed = (row?.signers ?? []) as unknown as SealedSigner[];
        const mine = sealed.find((s) => s.signerUserId === actorUserId);
        if (!row || !mine) {
          // 404 y no 403: ni siquiera se confirma que el documento existe.
          throw new NotFoundException('Reporte no encontrado.');
        }
        if (row.generatedByUserId === actorUserId) {
          throw new ForbiddenException('Nadie aprueba su propio borrador.');
        }
        const existing = await tx.orgReportApproval.findMany({
          where: { organizationId, reportId: row.id },
        });
        if (existing.some((a) => a.decision === 'rejected')) {
          throw new ConflictException('Este documento ya fue rechazado y no se emitirá.');
        }
        if (existing.some((a) => a.signerRole === mine.role)) {
          throw new ConflictException('Ya registraste tu decisión sobre este documento.');
        }
        const current = (await this.currentSigners(tx, organizationId)).get(mine.role);
        if (!current?.legalRepresentativeId || current.signerUserId !== actorUserId) {
          throw new ForbiddenException(
            'Tu firma vigente no está registrada o ya no eres el firmante de este cargo.',
          );
        }
        const all = await this.recordDecision(tx, row, sealed, current, input.decision);
        return toContract(row, undefined, all);
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException('Ya registraste tu decisión sobre este documento.');
      }
      throw error;
    }
  }

  /** Firmas que la organización declara exigidas por sus estatutos. */
  async policies(): Promise<OrgReportPolicy[]> {
    const organizationId = this.requireOrgId();
    const rows = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.orgReportPolicy.findMany({ where: { organizationId } }),
    );
    return rows.map((r) => ({
      kind: r.kind as OrgReportKind,
      requiredRoles: SIGNER_ORDER.filter((role) => r.requiredRoles.includes(role)),
    }));
  }

  /** Solo el propietario declara la política; el representante legal siempre firma. */
  async setPolicy(actorUserId: string, input: SetOrgReportPolicyInput): Promise<OrgReportPolicy> {
    const organizationId = this.requireOrgId();
    const roles = SIGNER_ORDER.filter((r) => input.requiredRoles.includes(r));
    await this.prisma.withOrgContext(organizationId, async (tx) => {
      const isOwner = await tx.userRole.findFirst({
        where: { organizationId, userId: actorUserId, role: Role.Owner },
        select: { id: true },
      });
      if (!isOwner) {
        throw new ForbiddenException(
          'Solo el propietario define las firmas que exigen los estatutos.',
        );
      }
      await tx.orgReportPolicy.upsert({
        where: { organizationId_kind: { organizationId, kind: input.kind } },
        create: {
          organizationId,
          kind: input.kind,
          requiredRoles: roles,
          updatedByUserId: actorUserId,
        },
        update: { requiredRoles: roles, updatedByUserId: actorUserId, updatedAt: new Date() },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'report.policy_updated',
        entityType: 'org_report_policy',
        entityId: `${organizationId}:${input.kind}`,
        metadata: { kind: input.kind, requiredRoles: roles },
      });
    });
    return { kind: input.kind, requiredRoles: roles };
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
