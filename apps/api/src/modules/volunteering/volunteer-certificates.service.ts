import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type VolunteerCertificate as CertificateRow } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { type PDFImage, PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import {
  DEFAULT_VOLUNTEER_CERTIFICATE_TEMPLATE,
  isVolunteerCertificateCode,
  type OrganizationLocation,
  type Paginated,
  type VolunteerCertificate,
  type VolunteerCertificateBitacoraEntry,
  type VolunteerCertificateTemplate,
  type VolunteerCertificateVerification,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { InboxService } from '../../core/notifications/inbox/inbox.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import type { RequestUser } from '../../core/auth/auth.types';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../../core/notifications/notification.port';
import { LegalRepresentativeService } from '../org/legal-representative.service';
import {
  checkCertificateEligibility,
  hasPendingHours,
  missingGuardianInfo,
  studentServiceMinHours,
  sumApprovedHours,
} from './volunteer-certificate-eligibility';
import {
  buildCertificateIssuedBody,
  buildCertificateIssuedSubject,
} from './volunteer-notifications';
import { clampLimit } from './volunteer-opportunities.service';
import { pdfText } from '../reports/report-text';
import { stampPlatformDocumentNotice } from '../../core/legal/platform-document-notice';
import { embedSignatureForPdf } from '../../core/legal/signature-render';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';
import { parseStorageKey } from '../../core/storage/storage-keys';
import {
  type CertificatePhoto,
  formatDay,
  renderVolunteerCertificate,
} from './volunteer-certificate-pdf';

/** Fotos de la jornada que se imprimen en el anexo (las demás se cuentan). */
const MAX_CERTIFICATE_PHOTOS = 6;

/** Código público del certificado: `VOL-XXXXXXXX-XXXXXXXX` (64 bits aleatorios). */
export function generateVolunteerCertificateCode(): string {
  const hex = randomBytes(8).toString('hex').toUpperCase();
  return `VOL-${hex.slice(0, 8)}-${hex.slice(8)}`;
}

function toCertificate(row: CertificateRow): VolunteerCertificate {
  return {
    id: row.id,
    organizationId: row.organizationId,
    enrollmentId: row.enrollmentId,
    volunteerUserId: row.volunteerUserId,
    volunteerName: row.volunteerName,
    organizationName: row.organizationName,
    opportunityTitle: row.opportunityTitle,
    totalApprovedHours: row.totalApprovedHours,
    periodStart: row.periodStart.toISOString(),
    periodEnd: row.periodEnd.toISOString(),
    appliesToStudentService: row.appliesToStudentService,
    issuedByUserId: row.issuedByUserId,
    issuedAt: row.issuedAt.toISOString(),
    guardianName: row.guardianName ?? undefined,
    guardianDocument: row.guardianDocument ?? undefined,
    schoolName: row.schoolName ?? undefined,
    schoolAgreementCode: row.schoolAgreementCode ?? undefined,
    bitacora: (row.bitacora as unknown as VolunteerCertificateBitacoraEntry[]) ?? [],
    signerFullName: row.signerFullName ?? undefined,
    signerPosition: row.signerPosition ?? undefined,
    signerIsLegalRepresentative: row.signerIsLegalRepresentative ?? undefined,
    verificationCode: row.verificationCode ?? undefined,
  };
}

/** JSONB row from `volunteer_certificates_for_user(...)` — already camelCase. */
interface CertificateMineRow {
  id: string;
  organizationId: string;
  enrollmentId: string;
  volunteerUserId: string;
  volunteerName: string;
  organizationName: string;
  opportunityTitle: string;
  totalApprovedHours: number;
  periodStart: string;
  periodEnd: string;
  appliesToStudentService: boolean;
  issuedByUserId: string;
  issuedAt: string;
  guardianName: string | null;
  guardianDocument: string | null;
  schoolName: string | null;
  schoolAgreementCode: string | null;
  bitacora: VolunteerCertificateBitacoraEntry[];
  verificationCode?: string | null;
}

function fromMineRow(row: CertificateMineRow): VolunteerCertificate {
  return {
    ...row,
    verificationCode: row.verificationCode ?? undefined,
    guardianName: row.guardianName ?? undefined,
    guardianDocument: row.guardianDocument ?? undefined,
    schoolName: row.schoolName ?? undefined,
    schoolAgreementCode: row.schoolAgreementCode ?? undefined,
    bitacora: row.bitacora ?? [],
  };
}

function frozenSignerOf(row: CertificateViewerRow): FrozenCertificateSigner | null {
  return row.signer_legal_representative_id && row.signer_signature_hash
    ? {
        legalRepresentativeId: row.signer_legal_representative_id,
        signatureHash: row.signer_signature_hash,
      }
    : null;
}

/** Formalizada o ESAL: firma su representante legal. Informal o en proceso:
 *  firma la persona responsable que la organización registró. */
const FORMAL_STATES: ReadonlySet<string> = new Set(['formalizada', 'esal', 'esal_rte']);

/** Raw snake_case row from `volunteer_certificate_for_viewer(...)` — a plain
 *  `SELECT * FROM <table-returning function>`, so Prisma's `@map()` camelCase
 *  translation (which only applies to the ORM client, `tx.volunteerCertificate.*`)
 *  does NOT apply here; columns come back exactly as declared in the DB. */
interface CertificateViewerRow {
  id: string;
  organization_id: string;
  enrollment_id: string;
  volunteer_user_id: string;
  volunteer_name: string;
  organization_name: string;
  opportunity_title: string;
  total_approved_hours: number;
  period_start: Date;
  period_end: Date;
  applies_to_student_service: boolean;
  issued_by_user_id: string;
  issued_at: Date;
  guardian_name: string | null;
  guardian_document: string | null;
  school_name: string | null;
  school_agreement_code: string | null;
  bitacora: VolunteerCertificateBitacoraEntry[];
  signer_legal_representative_id: string | null;
  signer_signature_hash: string | null;
  signer_full_name: string | null;
  signer_position: string | null;
  signer_is_legal_representative: boolean | null;
  verification_code: string | null;
}

/** Firma congelada al emitir: solo para volver a dibujar el PDF. */
interface FrozenCertificateSigner {
  legalRepresentativeId: string;
  signatureHash: string;
}

function fromViewerRow(row: CertificateViewerRow): VolunteerCertificate {
  return {
    id: row.id,
    organizationId: row.organization_id,
    enrollmentId: row.enrollment_id,
    volunteerUserId: row.volunteer_user_id,
    volunteerName: row.volunteer_name,
    organizationName: row.organization_name,
    opportunityTitle: row.opportunity_title,
    totalApprovedHours: row.total_approved_hours,
    periodStart: row.period_start.toISOString(),
    periodEnd: row.period_end.toISOString(),
    appliesToStudentService: row.applies_to_student_service,
    issuedByUserId: row.issued_by_user_id,
    issuedAt: row.issued_at.toISOString(),
    guardianName: row.guardian_name ?? undefined,
    guardianDocument: row.guardian_document ?? undefined,
    schoolName: row.school_name ?? undefined,
    schoolAgreementCode: row.school_agreement_code ?? undefined,
    bitacora: row.bitacora ?? [],
    signerFullName: row.signer_full_name ?? undefined,
    signerPosition: row.signer_position ?? undefined,
    signerIsLegalRepresentative: row.signer_is_legal_representative ?? undefined,
    verificationCode: row.verification_code ?? undefined,
  };
}

/**
 * Certificates (RF18/RF19 · M08). Issued explicitly by Owner/Administrator for
 * ONE enrollment — never automatic. Gated by `checkCertificateEligibility`:
 * general volunteering has no minimum; student social service requires
 * `studentServiceMinHours()` (80h default, RF19) of APPROVED hours. Reads are
 * dual-viewer (the issuing org OR the certificate's own volunteer) via the
 * `volunteer_certificate_for_viewer` SECURITY DEFINER function — append-only
 * once issued (DB triggers reject any mutation, see the S-6 migration).
 */
@Injectable()
export class VolunteerCertificatesService {
  private readonly logger = new Logger('VolunteerCertificates');

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
    private readonly legalRepresentatives: LegalRepresentativeService,
    private readonly inbox: InboxService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    config: ConfigService,
  ) {
    this.webBaseUrl = String(config.get('WEB_BASE_URL') ?? 'http://localhost:5173').replace(
      /\/$/,
      '',
    );
  }

  private readonly webBaseUrl: string;

  /** Enlace público de verificación impreso en el QR del certificado. */
  verifyUrl(code: string): string {
    return `${this.webBaseUrl}/verificar/${encodeURIComponent(code)}`;
  }

  /**
   * Verificación PÚBLICA (sin sesión) por el código impreso. Solo lo que ya
   * está en el documento (`volunteer_certificate_public`, SECURITY DEFINER).
   */
  async verifyPublic(code: string): Promise<VolunteerCertificateVerification> {
    const normalized = code.trim().toUpperCase();
    if (!isVolunteerCertificateCode(normalized)) {
      throw new NotFoundException('No encontramos un certificado con ese código.');
    }
    const rows = await this.prisma.$queryRaw<
      Array<{ data: VolunteerCertificateVerification | null }>
    >(Prisma.sql`SELECT volunteer_certificate_public(${normalized}) AS data`);
    const data = rows[0]?.data;
    if (!data) {
      throw new NotFoundException('No encontramos un certificado con ese código.');
    }
    const clean = <T>(value: T | null | undefined): T | undefined => value ?? undefined;
    return {
      ...data,
      schoolName: clean(data.schoolName),
      signerFullName: clean(data.signerFullName),
      signerPosition: clean(data.signerPosition),
      signerIsLegalRepresentative: clean(data.signerIsLegalRepresentative),
    };
  }

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  /** Issue a certificate for one enrollment (Owner/Administrator, own tenant). */
  async issue(actorUserId: string, enrollmentId: string): Promise<VolunteerCertificate> {
    const organizationId = this.requireOrgId();

    // P0-2: el certificado lo firma quien firma por la organización, y solo
    // esa persona lo emite (aprueba con su propia firma). Se congela aquí:
    // un cambio posterior de representante nunca reescribe un certificado ya
    // entregado.
    const signer = await this.legalRepresentatives.getCurrentSignerForOrg(
      organizationId,
      'legal_representative',
    );
    if (!signer) {
      throw new ConflictException(
        'Antes de emitir certificados registra quién firma por la organización ' +
          '(Organización → Firma del representante).',
      );
    }
    if (signer.memberId !== actorUserId) {
      throw new ForbiddenException(
        `Este certificado lo emite y firma ${signer.fullName}, quien firma por la organización. ` +
          'Pídele que lo emita desde su cuenta.',
      );
    }

    const created = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const enrollment = await tx.volunteerEnrollment.findUnique({ where: { id: enrollmentId } });
      if (!enrollment || enrollment.organizationId !== organizationId) {
        throw new NotFoundException('Volunteer enrollment not found');
      }
      if (enrollment.status !== 'accepted' && enrollment.status !== 'completed') {
        throw new BadRequestException(
          'Solo se puede emitir un certificado para una inscripción aceptada o completada.',
        );
      }
      const existing = await tx.volunteerCertificate.findUnique({ where: { enrollmentId } });
      if (existing) {
        throw new BadRequestException('Ya existe un certificado emitido para esta inscripción.');
      }

      const hoursEntries = await tx.serviceHours.findMany({
        where: { enrollmentId },
        orderBy: { date: 'asc' },
      });
      // Nuevo requerimiento (voluntariado): no se emite un certificado sin
      // ninguna hora registrada, ni mientras queden horas `pending` por
      // decidir — la organización debe cerrar el libro de la inscripción
      // primero (aprobar/rechazar todo lo pendiente).
      if (hoursEntries.length === 0) {
        throw new BadRequestException(
          'No se puede emitir el certificado: esta inscripción no tiene horas registradas.',
        );
      }
      if (hasPendingHours(hoursEntries)) {
        throw new BadRequestException(
          'No se puede emitir el certificado: aún hay horas pendientes de aprobar o rechazar.',
        );
      }
      const totalApprovedHours = sumApprovedHours(hoursEntries);
      const minHours = studentServiceMinHours();
      const eligibility = checkCertificateEligibility(
        enrollment.appliesToStudentService,
        totalApprovedHours,
        minHours,
      );
      if (!eligibility.eligible) {
        throw new BadRequestException(
          `No se puede emitir el certificado: faltan ${eligibility.missingHours} horas efectivas ` +
            `para alcanzar el mínimo de ${minHours} horas del servicio social estudiantil (Resolución 4210/1996, art. 6°).`,
        );
      }
      // S-12 (FSD v3.5 Doc 8): a minor's student-service certificate names the
      // guardian who authorized it. Enforced HERE (issuance), not at signup —
      // an org can request the missing guardian info from the volunteer and
      // simply hold off on issuing until it's on the enrollment.
      if (
        missingGuardianInfo(
          enrollment.appliesToStudentService,
          enrollment.isMinor,
          enrollment.guardianName,
          enrollment.guardianDocument,
        )
      ) {
        throw new BadRequestException(
          'No se puede emitir el certificado: falta el nombre y documento del acudiente ' +
            'para esta inscripción de servicio social de un menor de edad.',
        );
      }

      const opportunity = await tx.volunteerOpportunity.findUniqueOrThrow({
        where: { id: enrollment.opportunityId },
      });
      const organization = await tx.organization.findUniqueOrThrow({
        where: { id: organizationId },
      });
      const profile = await tx.organizationProfile.findUnique({
        where: { organizationId },
        select: { formalizationState: true },
      });
      const signerIsLegalRepresentative = FORMAL_STATES.has(
        profile?.formalizationState ?? 'informal',
      );

      // Bitácora (FSD Doc 8): derived from the enrollment's OWN approved
      // sessions — never a separate capture. Supervisor name is a live join
      // against `users` (org staff, same tenant as this tx, unlike the
      // cross-tenant volunteer) — best-effort, absent if a lookup ever fails.
      const approvedHoursEntries = hoursEntries.filter((entry) => entry.status === 'approved');
      const supervisorIds = [
        ...new Set(
          approvedHoursEntries
            .map((entry) => entry.decidedByUserId)
            .filter((id): id is string => id !== null),
        ),
      ];
      const supervisors =
        supervisorIds.length > 0
          ? await tx.user.findMany({
              where: { id: { in: supervisorIds } },
              select: { id: true, displayName: true },
            })
          : [];
      const supervisorNameById = new Map(supervisors.map((s) => [s.id, s.displayName]));
      const bitacora: VolunteerCertificateBitacoraEntry[] = approvedHoursEntries.map((entry) => ({
        date: entry.date.toISOString(),
        hours: entry.hours,
        description: entry.description,
        supervisorName: entry.decidedByUserId
          ? supervisorNameById.get(entry.decidedByUserId)
          : undefined,
      }));

      const row = await tx.volunteerCertificate.create({
        data: {
          organizationId,
          enrollmentId,
          volunteerUserId: enrollment.volunteerUserId,
          volunteerName: enrollment.volunteerName,
          organizationName: organization.name,
          opportunityTitle: opportunity.title,
          totalApprovedHours,
          periodStart: opportunity.startDate,
          periodEnd: opportunity.endDate,
          appliesToStudentService: enrollment.appliesToStudentService,
          issuedByUserId: actorUserId,
          guardianName: enrollment.guardianName,
          guardianDocument: enrollment.guardianDocument,
          schoolName: enrollment.schoolName,
          schoolAgreementCode: enrollment.schoolAgreementCode,
          bitacora: bitacora as unknown as Prisma.InputJsonValue,
          signerLegalRepresentativeId: signer.id,
          signerSignatureHash: signer.signatureHash,
          signerFullName: signer.fullName,
          signerPosition: signer.position,
          signerIsLegalRepresentative,
          verificationCode: generateVolunteerCertificateCode(),
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'volunteering.certificate_issued',
        entityType: 'volunteer_certificate',
        entityId: row.id,
        metadata: { enrollmentId, totalApprovedHours },
      });
      return { row, volunteerEmail: enrollment.volunteerEmail };
    });

    try {
      const emailInput = {
        volunteerName: created.row.volunteerName,
        opportunityTitle: created.row.opportunityTitle,
        organizationName: created.row.organizationName,
        totalApprovedHours: created.row.totalApprovedHours,
      };
      await this.notifications.send({
        to: created.volunteerEmail,
        subject: buildCertificateIssuedSubject(emailInput),
        body: buildCertificateIssuedBody(emailInput),
        template: {
          event: 'volunteering.certificate_issued',
          organizationName: emailInput.organizationName || undefined,
          organizationId,
          data: {
            nombre: emailInput.volunteerName,
            oportunidad: emailInput.opportunityTitle,
            organizacion: emailInput.organizationName,
            horas: emailInput.totalApprovedHours,
          },
        },
      });
    } catch (error) {
      this.logger.warn(`No se pudo notificar al voluntario: ${(error as Error).message}`);
    }
    await this.inbox.toUser(created.row.volunteerUserId, {
      kind: 'volunteering.certificate_issued',
      tone: 'kudos',
      title: `¡Felicitaciones! Tienes tu certificado de ${created.row.totalApprovedHours} h`,
      body: `${created.row.organizationName} certificó tu voluntariado en "${created.row.opportunityTitle}". Descárgalo desde Voluntariado.`,
      href: '/voluntariado',
      dedupeKey: `volunteer_certificate:${created.row.id}`,
    });

    return toCertificate(created.row);
  }

  /** Paginated list of certificates issued by the caller's org. */
  async listByOrg(limit: number, offset: number): Promise<Paginated<VolunteerCertificate>> {
    const organizationId = this.requireOrgId();
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const where = { organizationId };
      const [rows, total] = await Promise.all([
        tx.volunteerCertificate.findMany({ where, orderBy: { issuedAt: 'desc' }, take, skip }),
        tx.volunteerCertificate.count({ where }),
      ]);
      return { items: rows.map(toCertificate), total, limit: take, offset: skip };
    });
  }

  /** The volunteer's own certificates (cross-tenant, by identity) — "mis
   *  certificados". */
  async listMine(actor: RequestUser): Promise<VolunteerCertificate[]> {
    const rows = await this.prisma.$queryRaw<Array<{ data: CertificateMineRow[] }>>(
      Prisma.sql`SELECT volunteer_certificates_for_user(${actor.id}::uuid) AS data`,
    );
    return (rows[0]?.data ?? []).map(fromMineRow);
  }

  /** Dual-viewer read: the certificate's own volunteer OR a member of the
   *  issuing organization. Returns null for anyone else (⇒ 404). */
  private async forViewer(id: string, actor: RequestUser): Promise<VolunteerCertificate | null> {
    return (await this.forViewerWithSigner(id, actor))?.certificate ?? null;
  }

  private async forViewerWithSigner(
    id: string,
    actor: RequestUser,
  ): Promise<{ certificate: VolunteerCertificate; frozen: FrozenCertificateSigner | null } | null> {
    const rows = await this.prisma.$queryRaw<CertificateViewerRow[]>(
      Prisma.sql`SELECT * FROM volunteer_certificate_for_viewer(${id}::uuid, ${actor.id}::uuid, ${actor.organizationId}::uuid)`,
    );
    const row = rows[0];
    return row ? { certificate: fromViewerRow(row), frozen: frozenSignerOf(row) } : null;
  }

  async get(id: string, actor: RequestUser): Promise<VolunteerCertificate> {
    const row = await this.forViewer(id, actor);
    if (!row) {
      throw new NotFoundException('Volunteer certificate not found');
    }
    return row;
  }

  /** Best-effort: ciudad, NIT y logo de la organización, leídos al generar
   *  el PDF. Ausentes (nunca inventados) si no los registró o si algo falla. */
  private async getOrgLetterhead(
    organizationId: string,
  ): Promise<{ city?: string; nit?: string; logo: Buffer | null }> {
    try {
      const profile = await this.prisma.withOrgContext(organizationId, (tx) =>
        tx.organizationProfile.findUnique({
          where: { organizationId },
          select: { location: true, nit: true, logoUrl: true },
        }),
      );
      const location = profile?.location as OrganizationLocation | null | undefined;
      return {
        city: location?.city?.trim() || undefined,
        nit: profile?.nit?.trim() || undefined,
        logo: await this.readLogo(organizationId, profile?.logoUrl ?? null),
      };
    } catch {
      return { logo: null };
    }
  }

  /**
   * El logo se guarda como URL pública del propio almacenamiento. Se lee por
   * el StoragePort (nunca por HTTP) y solo si la clave es pública y de ESTA
   * organización; cualquier otra URL se ignora.
   */
  private async readLogo(organizationId: string, logoUrl: string | null): Promise<Buffer | null> {
    if (!logoUrl) return null;
    let key: string | null = null;
    try {
      key = new URL(logoUrl, 'http://local').searchParams.get('key');
    } catch {
      return null;
    }
    if (!key) {
      const match = /(public\/[0-9a-f-]{36}\/[^?#]+)/i.exec(logoUrl);
      key = match ? decodeURIComponent(match[1]) : null;
    }
    const parsed = key ? parseStorageKey(key) : null;
    if (
      !key ||
      !parsed ||
      parsed.visibility !== 'public' ||
      parsed.organizationId !== organizationId
    ) {
      return null;
    }
    try {
      return (await this.storage.readObject(key))?.data ?? null;
    } catch {
      return null;
    }
  }

  /** Fotos de las sesiones APROBADAS de la inscripción (las únicas que el
   *  certificado respalda), en orden de fecha. Una foto ilegible se omite. */
  private async loadApprovedSessionPhotos(
    organizationId: string,
    enrollmentId: string,
  ): Promise<{ items: Array<{ data: Buffer; date: Date }>; total: number }> {
    const photos = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.serviceHoursPhoto.findMany({
        where: { organizationId, serviceHours: { enrollmentId, status: 'approved' } },
        include: { serviceHours: { select: { date: true } } },
        orderBy: [{ serviceHours: { date: 'asc' } }, { createdAt: 'asc' }],
      }),
    );
    const items: Array<{ data: Buffer; date: Date }> = [];
    for (const photo of photos) {
      if (items.length >= MAX_CERTIFICATE_PHOTOS) break;
      try {
        const stored = await this.storage.readObject(photo.storageRef);
        if (stored) items.push({ data: stored.data, date: photo.serviceHours.date });
      } catch {
        // Una foto que no se puede leer no impide entregar el certificado.
      }
    }
    return { items, total: photos.length };
  }

  /**
   * PDF del certificado (S-14 + rediseño 2026-11-13): dos plantillas
   * (`huellitas`, `clasica`) con el MISMO contenido verificable — membrete con
   * logo, NIT y ciudad; la persona como protagonista; horas, fechas y
   * jornadas; firma CONGELADA al emitir; código público + QR a
   * `/verificar/<código>`; y anexos con la bitácora en tabla y el registro
   * fotográfico de las sesiones aprobadas. Se genera al vuelo desde el
   * registro inmutable; nunca se guarda como archivo aparte.
   */
  async generatePdf(
    id: string,
    actor: RequestUser,
    template: VolunteerCertificateTemplate = DEFAULT_VOLUNTEER_CERTIFICATE_TEMPLATE,
  ): Promise<Buffer> {
    const viewed = await this.forViewerWithSigner(id, actor);
    if (!viewed) {
      throw new NotFoundException('Volunteer certificate not found');
    }
    // Las fuentes estándar de pdf-lib solo codifican WinAnsi: un emoji o un
    // carácter fuera de ese juego en cualquier texto del usuario (nombre,
    // actividad, colegio, bitácora) hacía LANZAR `drawText` y la constancia no
    // se podía descargar (500). Todo texto variable se sanea antes de dibujar.
    const row = sanitizeCertificateForPdf(viewed.certificate);
    const { frozen } = viewed;

    // P0-2: SOLO la firma congelada al emitir (verificada por su hash), nunca
    // la del representante vigente. Un certificado anterior a este control no
    // tiene firmante congelado y se muestra sin firma.
    const [signatureBytes, letterhead, photos] = await Promise.all([
      frozen
        ? this.legalRepresentatives.getSignatureImageById(
            row.organizationId,
            frozen.legalRepresentativeId,
            frozen.signatureHash,
          )
        : Promise.resolve(null),
      this.getOrgLetterhead(row.organizationId),
      this.loadApprovedSessionPhotos(row.organizationId, row.enrollmentId).catch(() => ({
        items: [],
        total: 0,
      })),
    ]);
    const signer =
      frozen && row.signerFullName && row.signerPosition
        ? {
            fullName: pdfText(row.signerFullName, 120),
            position: pdfText(row.signerPosition, 120),
            isLegalRepresentative: row.signerIsLegalRepresentative !== false,
          }
        : null;

    const pdf = await PDFDocument.create();
    pdf.setTitle(`Certificado de voluntariado - ${row.volunteerName}`);
    pdf.setAuthor(row.organizationName);
    pdf.setCreator('AdoptaFácil');
    if (row.verificationCode) pdf.setSubject(`Código de verificación ${row.verificationCode}`);
    // Una firma corrupta/no-PNG nunca rompe la generación: se sigue sin imagen.
    const signatureImage =
      signer && signatureBytes ? await embedSignatureImage(pdf, signatureBytes) : null;
    if (!signer) {
      this.logger.warn(`Certificado ${row.id}: emitido sin firmante congelado.`);
    } else if (!signatureImage) {
      this.logger.warn(`Certificado ${row.id}: la firma congelada no se pudo leer o verificar.`);
    }
    const logo = letterhead.logo ? await embedJpegImage(pdf, letterhead.logo, 400) : null;
    const embeddedPhotos: CertificatePhoto[] = [];
    for (const photo of photos.items) {
      const image = await embedJpegImage(pdf, photo.data, 900);
      if (image)
        embeddedPhotos.push({
          image,
          caption: `Sesión del ${formatDay(photo.date.toISOString())}`,
        });
    }

    await renderVolunteerCertificate(pdf, {
      template,
      row,
      signer,
      signatureImage,
      logo,
      city: letterhead.city ? pdfText(letterhead.city, 80) : undefined,
      nit: letterhead.nit ? pdfText(letterhead.nit, 30) : undefined,
      verificationCode: row.verificationCode,
      verifyUrl: row.verificationCode ? this.verifyUrl(row.verificationCode) : undefined,
      photos: embeddedPhotos,
      totalPhotos: photos.total,
    });

    await stampPlatformDocumentNotice(pdf);
    const bytes = await pdf.save();
    return Buffer.from(bytes);
  }
}

/** Reduce una imagen (logo o foto) a JPEG y la incrusta; null si no se puede
 *  leer (una imagen dañada nunca impide generar el certificado). */
async function embedJpegImage(
  pdf: PDFDocument,
  bytes: Buffer,
  maxSide: number,
): Promise<PDFImage | null> {
  try {
    const jpeg = await sharp(bytes, { limitInputPixels: 80_000_000 })
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    return await pdf.embedJpg(jpeg);
  } catch {
    return null;
  }
}

/** Incrusta una firma PNG o JPG según sus bytes; `null` si no es ninguna de
 *  las dos o está dañada (una firma rota nunca impide generar el documento). */
export async function embedSignatureImage(
  pdf: PDFDocument,
  bytes: Buffer | Uint8Array,
): Promise<PDFImage | null> {
  // Recorta el lienzo vacío alrededor del trazo y normaliza PNG/JPG a PNG
  // (copia propia de los bytes: pdf-lib ignora el `byteOffset` de las vistas).
  return embedSignatureForPdf(pdf, bytes);
}

/** Copia del certificado con todo texto variable apto para WinAnsi (ver
 *  `generatePdf`). No altera lo almacenado: solo lo que se dibuja. */
function sanitizeCertificateForPdf(row: VolunteerCertificate): VolunteerCertificate {
  const opt = (value: string | undefined, max: number) =>
    value === undefined ? undefined : pdfText(value, max);
  return {
    ...row,
    volunteerName: pdfText(row.volunteerName, 120),
    organizationName: pdfText(row.organizationName, 160),
    opportunityTitle: pdfText(row.opportunityTitle, 200),
    guardianName: opt(row.guardianName, 120),
    guardianDocument: opt(row.guardianDocument, 40),
    schoolName: opt(row.schoolName, 160),
    schoolAgreementCode: opt(row.schoolAgreementCode, 60),
    bitacora: row.bitacora.map((entry) => ({
      ...entry,
      description: pdfText(entry.description, 600),
      supervisorName: opt(entry.supervisorName, 120),
    })),
  };
}
