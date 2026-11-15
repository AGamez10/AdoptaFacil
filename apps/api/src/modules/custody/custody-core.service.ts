import { createHash } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  Animal as AnimalRow,
  AnimalBreed as BreedRow,
  AnimalIntake as IntakeRow,
  AnimalPhoto as PhotoRow,
  CustodyCharge as ChargeRow,
  CustodyChargeExtension as ExtensionRow,
  CustodyContract as ContractRow,
  CustodyDocument as DocumentRow,
  CustodyEvent as EventRow,
  CustodyPayment as PaymentRow,
  CustodyRelease as ReleaseRow,
  CustodyResponsible as ResponsibleRow,
  Prisma,
} from '@prisma/client';
import {
  type CustodyCharge,
  type CustodyChargeConcept,
  type CustodyChargeStatus,
  type CustodyContractParty,
  type CustodyDocument,
  type CustodyDocumentKind,
  type CustodyDocumentSource,
  type CustodyEvent,
  type CustodyEventType,
  type CustodyIdType,
  type CustodyIntake,
  type CustodyIntakeReason,
  type CustodyIntakeStatus,
  type CustodyMissingField,
  type CustodyPaymentMethod,
  type CustodyPreventiveStatus,
  type CustodyRelease,
  type CustodyReleaseType,
  type CustodyResponsible,
  custodyChargeSituation,
} from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import { AuditService } from '../../core/audit/audit.service';
import { PlansService } from '../../core/plans/plans.service';
import { sniffContentType } from '../../core/storage/file-sniff';
import { optimizeImage } from '../../core/storage/image-optimizer';
import { parseStorageKey } from '../../core/storage/storage-keys';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { PrismaService } from '../../prisma/prisma.service';
import { computeAge } from '../animals/animal-age';
import type { AnimalFacts } from './custody-document-builders';
import type { CustodyPdfOrganization } from './custody-pdf';
import { ageLabel, animalCode, fromDbDate, requireOrg, todayInColombia } from './custody.util';

/** Lo mínimo de un archivo de multer en memoria. */
export interface UploadedFileLike {
  buffer: Buffer;
  originalname: string;
  size: number;
}

export type AnimalWithRelations = AnimalRow & { breed: BreedRow | null; photos: PhotoRow[] };

export type ChargeWithRelations = ChargeRow & {
  animal: { name: string };
  responsible: { fullName: string };
  contract: { number: string; graceDays: number } | null;
  extensions: ExtensionRow[];
  payments: PaymentRow[];
};

export const CHARGE_INCLUDE = {
  animal: { select: { name: true } },
  responsible: { select: { fullName: true } },
  contract: { select: { number: true, graceDays: true } },
  extensions: { orderBy: { createdAt: 'asc' } },
  payments: { orderBy: { createdAt: 'asc' } },
} as const;

const DOCUMENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export interface NewDocument {
  animalId: string | null;
  kind: CustodyDocumentKind;
  title: string;
  source: CustodyDocumentSource;
  file: StoredFile;
  actorUserId: string;
  actorName: string;
  version?: number;
  replacesDocumentId?: string | null;
  documentDate?: string | null;
  isRetrospective?: boolean;
  retrospectiveSource?: string | null;
  intakeId?: string | null;
  contractId?: string | null;
  chargeId?: string | null;
  paymentId?: string | null;
  releaseId?: string | null;
  extensionId?: string | null;
  responsibleId?: string | null;
}

export interface StoredFile {
  key: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
}

export interface NewEvent {
  animalId: string;
  type: CustodyEventType;
  summary: string;
  detail?: string | null;
  occurredAt?: Date;
  isRetrospective?: boolean;
  retrospectiveSource?: string | null;
  documentId?: string | null;
  refs?: Record<string, string>;
  actorUserId: string;
  actorName: string;
}

/**
 * Lo que comparten los servicios de custodia: la identidad institucional para
 * los documentos, guardar y leer archivos por el StoragePort, el historial del
 * animal y la vista de un cobro con su situación. La organización sale SIEMPRE
 * del contexto del tenant (JWT) y toda lectura va dentro de la RLS.
 */
@Injectable()
export class CustodyCoreService {
  private readonly maxBytes: number;
  private readonly maxMb: number;

  constructor(
    readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    readonly audit: AuditService,
    private readonly plans: PlansService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    config: ConfigService<Env, true>,
  ) {
    this.maxMb = config.get('STORAGE_MAX_FILE_MB', { infer: true });
    this.maxBytes = this.maxMb * 1024 * 1024;
  }

  orgId(): string {
    return requireOrg(this.tenant.getOrganizationId());
  }

  // --- Identidad institucional ----------------------------------------------

  /**
   * Nombre, NIT, dirección, contacto y logo de la organización, de su perfil.
   * Lo que no está registrado no se inventa: el documento lo omite.
   */
  async loadOrganization(tx: Prisma.TransactionClient): Promise<CustodyPdfOrganization> {
    const organizationId = this.orgId();
    const org = await tx.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, profile: true },
    });
    if (!org) throw new NotFoundException('Organización no encontrada.');
    const profile = org.profile;
    const location = (profile?.location ?? {}) as { city?: string; address?: string };
    const extended = (profile?.extendedContact ?? {}) as { fullAddress?: string };
    return {
      name: org.name,
      legalName: profile?.legalName ?? undefined,
      nit: profile?.nit ?? undefined,
      address: location.address || extended.fullAddress || undefined,
      city: location.city || undefined,
      phone: profile?.phone ?? profile?.whatsapp ?? undefined,
      email: profile?.contactEmail ?? undefined,
      logo: await this.readLogo(organizationId, profile?.logoUrl ?? null),
    };
  }

  /**
   * El logo se guarda como URL pública del propio almacenamiento. Se lee por el
   * StoragePort (nunca por HTTP) y solo si la clave es pública y de ESTA
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

  /** Datos de la organización que un documento formal necesita, en palabras del usuario. */
  missingOrganizationData(org: CustodyPdfOrganization): CustodyMissingField[] {
    const missing: CustodyMissingField[] = [];
    if (!org.nit) {
      missing.push({
        field: 'organization.nit',
        message: 'Registra el NIT de la organización en Mi organización.',
      });
    }
    if (!org.address) {
      missing.push({
        field: 'organization.address',
        message: 'Registra la dirección de la organización en Mi organización.',
      });
    }
    if (!org.phone && !org.email) {
      missing.push({
        field: 'organization.contact',
        message: 'Registra un teléfono o un correo de contacto en Mi organización.',
      });
    }
    return missing;
  }

  /** 422 con la lista de lo que falta, para que el formulario diga qué completar. */
  assertNothingMissing(missing: CustodyMissingField[]): void {
    if (missing.length === 0) return;
    throw new UnprocessableEntityException({
      statusCode: 422,
      error: 'missing_required_data',
      message: `Falta información para generar el documento: ${missing
        .map((m) => m.message)
        .join(' ')}`,
      missing,
    });
  }

  // --- Animales y responsables ----------------------------------------------

  async requireAnimal(tx: Prisma.TransactionClient, id: string): Promise<AnimalWithRelations> {
    const row = await tx.animal.findUnique({
      where: { id },
      include: { breed: true, photos: true },
    });
    // La RLS ya oculta lo de otra organización; la comparación es defensa extra.
    if (!row || row.organizationId !== this.orgId()) {
      throw new NotFoundException('Animal no encontrado.');
    }
    return row;
  }

  animalFacts(row: AnimalRow & { breed?: BreedRow | null }): AnimalFacts {
    return {
      id: row.id,
      code: animalCode(row.id),
      name: row.name,
      species: row.species,
      sex: row.sex,
      breed: row.breed?.name ?? row.customBreed ?? undefined,
      ageLabel: ageLabel(computeAge(row.birthDate, row.approximateAgeMonths, new Date())),
      status: row.status,
    };
  }

  /** Bytes de la foto principal del animal, o null. */
  async primaryPhoto(row: AnimalWithRelations): Promise<Buffer | null> {
    const first = [...row.photos].sort((a, b) => a.order - b.order)[0];
    if (!first) return null;
    try {
      return (await this.storage.readObject(first.storageRef))?.data ?? null;
    } catch {
      return null;
    }
  }

  async requireResponsible(tx: Prisma.TransactionClient, id: string): Promise<ResponsibleRow> {
    const row = await tx.custodyResponsible.findUnique({ where: { id } });
    if (!row || row.organizationId !== this.orgId()) {
      throw new NotFoundException('Responsable no encontrado.');
    }
    return row;
  }

  toResponsible(row: ResponsibleRow): CustodyResponsible {
    return {
      id: row.id,
      fullName: row.fullName,
      documentType: row.documentType as CustodyIdType,
      documentNumber: row.documentNumber,
      phone: row.phone ?? undefined,
      email: row.email ?? undefined,
      address: row.address ?? undefined,
      city: row.city ?? undefined,
      notes: row.notes ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  toParty(row: ResponsibleRow): CustodyContractParty {
    return {
      fullName: row.fullName,
      documentType: row.documentType,
      documentNumber: row.documentNumber,
      phone: row.phone ?? undefined,
      email: row.email ?? undefined,
      address: row.address ?? undefined,
      city: row.city ?? undefined,
    };
  }

  toIntake(row: IntakeRow & { responsible?: ResponsibleRow | null }): CustodyIntake {
    return {
      id: row.id,
      animalId: row.animalId,
      status: row.status as CustodyIntakeStatus,
      intakeAt: row.intakeAt.toISOString(),
      reason: row.reason as CustodyIntakeReason,
      reasonDetail: row.reasonDetail ?? undefined,
      origin: row.origin ?? undefined,
      responsible: row.responsible ? this.toResponsible(row.responsible) : undefined,
      physicalCondition: row.physicalCondition,
      particularFeatures: row.particularFeatures ?? undefined,
      vaccinationStatus: row.vaccinationStatus as CustodyPreventiveStatus,
      dewormingStatus: row.dewormingStatus as CustodyPreventiveStatus,
      preventiveNotes: row.preventiveNotes ?? undefined,
      foodProvided: row.foodProvided ?? undefined,
      medicationsReported: row.medicationsReported ?? undefined,
      notes: row.notes ?? undefined,
      receivedByName: row.receivedByName,
      hasVetAssessment: row.hasVetAssessment,
      vetName: row.vetName ?? undefined,
      vetLicense: row.vetLicense ?? undefined,
      vetAssessmentDate: row.vetAssessmentDate ? fromDbDate(row.vetAssessmentDate) : undefined,
      isRetrospective: row.isRetrospective,
      retrospectiveSource: row.retrospectiveSource ?? undefined,
      finalizedAt: row.finalizedAt?.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  toRelease(row: ReleaseRow): CustodyRelease {
    return {
      id: row.id,
      animalId: row.animalId,
      releaseType: row.releaseType as CustodyReleaseType,
      releasedAt: row.releasedAt.toISOString(),
      receivedByName: row.receivedByName,
      receivedByDocument: row.receivedByDocument ?? undefined,
      receivedByPhone: row.receivedByPhone ?? undefined,
      receivedByRelation: row.receivedByRelation ?? undefined,
      conditionAtRelease: row.conditionAtRelease,
      notes: row.notes ?? undefined,
      deliveredByName: row.deliveredByName,
      authorityName: row.authorityName ?? undefined,
      authorityBasis: row.authorityBasis ?? undefined,
      decidedByName: row.decidedByName ?? undefined,
      outstandingBalanceCop: row.outstandingBalanceCop,
      isRetrospective: row.isRetrospective,
      retrospectiveSource: row.retrospectiveSource ?? undefined,
      createdAt: row.createdAt.toISOString(),
    };
  }

  // --- Archivos --------------------------------------------------------------

  /**
   * Valida un archivo subido por su CONTENIDO (nunca por el nombre ni por lo
   * que diga el navegador), recomprime las fotos y devuelve los bytes a guardar.
   */
  async prepareUpload(
    file: UploadedFileLike | undefined,
    options: { photosOnly?: boolean; label?: string } = {},
  ): Promise<{ data: Buffer; contentType: string; filename: string }> {
    const label = options.label ?? 'El archivo';
    if (!file?.buffer?.length) {
      throw new BadRequestException('Adjunta el archivo (campo "file").');
    }
    if (file.size > this.maxBytes) {
      throw new PayloadTooLargeException(`${label} supera el límite de ${this.maxMb} MB.`);
    }
    const realType = sniffContentType(file.buffer);
    const allowed: readonly string[] = options.photosOnly ? PHOTO_TYPES : DOCUMENT_TYPES;
    if (!realType || !allowed.includes(realType)) {
      throw new BadRequestException(
        options.photosOnly
          ? `${label} debe ser una foto (JPG, PNG o WebP).`
          : `${label} debe ser un PDF o una imagen (JPG, PNG, WebP o GIF).`,
      );
    }
    const optimized = await optimizeImage(file.buffer, realType);
    if (!optimized) {
      throw new BadRequestException('La imagen está dañada y no se pudo abrir.');
    }
    return {
      data: optimized.buffer,
      contentType: optimized.contentType,
      filename: (file.originalname || 'documento').slice(0, 200),
    };
  }

  /** Guarda bytes como objeto PRIVADO de la organización (cuenta contra su cuota). */
  async saveFile(data: Buffer, filename: string, contentType: string): Promise<StoredFile> {
    const organizationId = this.orgId();
    await this.plans.assertStorageAvailable(organizationId, data.length);
    const target = await this.storage.createUploadTarget({
      organizationId,
      filename,
      contentType,
      visibility: 'private',
    });
    await this.storage.saveObject(target.key, data, contentType);
    return {
      key: target.key,
      contentType,
      sizeBytes: data.length,
      sha256: createHash('sha256').update(data).digest('hex'),
    };
  }

  async readFile(key: string): Promise<Buffer | null> {
    try {
      return (await this.storage.readObject(key))?.data ?? null;
    } catch {
      return null;
    }
  }

  insertDocument(tx: Prisma.TransactionClient, doc: NewDocument): Promise<DocumentRow> {
    return tx.custodyDocument.create({
      data: {
        organizationId: this.orgId(),
        animalId: doc.animalId,
        kind: doc.kind,
        title: doc.title.slice(0, 200),
        source: doc.source,
        storageRef: doc.file.key,
        contentType: doc.file.contentType,
        sizeBytes: doc.file.sizeBytes,
        sha256: doc.file.sha256,
        version: doc.version ?? 1,
        replacesDocumentId: doc.replacesDocumentId ?? null,
        documentDate: doc.documentDate ? new Date(`${doc.documentDate}T00:00:00Z`) : null,
        isRetrospective: doc.isRetrospective ?? false,
        retrospectiveSource: doc.retrospectiveSource ?? null,
        intakeId: doc.intakeId ?? null,
        contractId: doc.contractId ?? null,
        chargeId: doc.chargeId ?? null,
        paymentId: doc.paymentId ?? null,
        releaseId: doc.releaseId ?? null,
        extensionId: doc.extensionId ?? null,
        responsibleId: doc.responsibleId ?? null,
        createdByUserId: doc.actorUserId,
        createdByName: doc.actorName,
      },
    });
  }

  toDocument(row: DocumentRow): CustodyDocument {
    return {
      id: row.id,
      animalId: row.animalId ?? undefined,
      kind: row.kind as CustodyDocumentKind,
      title: row.title,
      source: row.source as CustodyDocumentSource,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      sha256: row.sha256,
      version: row.version,
      documentDate: row.documentDate ? fromDbDate(row.documentDate) : undefined,
      isRetrospective: row.isRetrospective,
      retrospectiveSource: row.retrospectiveSource ?? undefined,
      intakeId: row.intakeId ?? undefined,
      contractId: row.contractId ?? undefined,
      chargeId: row.chargeId ?? undefined,
      paymentId: row.paymentId ?? undefined,
      releaseId: row.releaseId ?? undefined,
      createdByName: row.createdByName,
      createdAt: row.createdAt.toISOString(),
    };
  }

  // --- Historial -------------------------------------------------------------

  /** Deja el hecho en el historial del animal (y nada más: sin datos sensibles). */
  recordEvent(tx: Prisma.TransactionClient, event: NewEvent): Promise<EventRow> {
    return tx.custodyEvent.create({
      data: {
        organizationId: this.orgId(),
        animalId: event.animalId,
        type: event.type,
        summary: event.summary.slice(0, 300),
        detail: event.detail ?? null,
        occurredAt: event.occurredAt ?? new Date(),
        isRetrospective: event.isRetrospective ?? false,
        retrospectiveSource: event.retrospectiveSource ?? null,
        documentId: event.documentId ?? null,
        refs: event.refs ?? {},
        actorUserId: event.actorUserId,
        actorName: event.actorName,
      },
    });
  }

  toEvent(row: EventRow): CustodyEvent {
    return {
      id: row.id,
      animalId: row.animalId,
      type: row.type as CustodyEventType,
      summary: row.summary,
      detail: row.detail ?? undefined,
      occurredAt: row.occurredAt.toISOString(),
      recordedAt: row.createdAt.toISOString(),
      actorName: row.actorName,
      isRetrospective: row.isRetrospective,
      retrospectiveSource: row.retrospectiveSource ?? undefined,
      documentId: row.documentId ?? undefined,
    };
  }

  // --- Cobros ----------------------------------------------------------------

  /**
   * Vista de un cobro: lo pagado (sin los pagos anulados), el saldo, la fecha
   * que rige (la última prórroga o la original) y su situación frente a hoy.
   * La situación se CALCULA al leer: nada la guarda ni la cambia por su cuenta.
   */
  toCharge(
    row: ChargeWithRelations,
    documents: Pick<DocumentRow, 'id' | 'kind' | 'chargeId' | 'paymentId'>[] = [],
    today = todayInColombia(),
  ): CustodyCharge {
    const valid = row.payments.filter((p) => !p.voidedAt);
    const paidCop = valid.reduce((sum, p) => sum + p.amountCop, 0);
    const lastExtension = row.extensions[row.extensions.length - 1];
    const dueDate = fromDbDate(row.dueDate);
    const effectiveDueDate = lastExtension ? fromDbDate(lastExtension.newDueDate) : dueDate;
    const { situation, daysOverdue } = custodyChargeSituation({
      status: row.status as CustodyChargeStatus,
      effectiveDueDate,
      hasExtension: Boolean(lastExtension),
      graceDays: row.contract?.graceDays ?? 0,
      today,
    });
    const support = documents.find(
      (d) => d.chargeId === row.id && !d.paymentId && d.kind === 'expense_support',
    );
    return {
      id: row.id,
      animalId: row.animalId,
      animalName: row.animal.name,
      responsibleId: row.responsibleId,
      responsibleName: row.responsible.fullName,
      contractId: row.contractId ?? undefined,
      contractNumber: row.contract?.number,
      concept: row.concept as CustodyChargeConcept,
      description: row.description,
      amountCop: row.amountCop,
      paidCop,
      balanceCop: row.status === 'cancelled' ? 0 : Math.max(0, row.amountCop - paidCop),
      dueDate,
      effectiveDueDate,
      expenseDate: row.expenseDate ? fromDbDate(row.expenseDate) : undefined,
      periodLabel: row.periodLabel ?? undefined,
      status: row.status as CustodyChargeStatus,
      situation,
      daysOverdue,
      hasSupport: Boolean(support),
      supportDocumentId: support?.id,
      extensions: row.extensions.map((e) => ({
        id: e.id,
        previousDueDate: fromDbDate(e.previousDueDate),
        newDueDate: fromDbDate(e.newDueDate),
        reason: e.reason,
        requestedBy: e.requestedBy ?? undefined,
        authorizedByName: e.authorizedByName,
        createdAt: e.createdAt.toISOString(),
      })),
      payments: row.payments.map((p) => {
        const receipt = documents.find((d) => d.paymentId === p.id && d.kind === 'payment_receipt');
        const proof = documents.find((d) => d.paymentId === p.id && d.kind === 'bank_proof');
        return {
          id: p.id,
          chargeId: p.chargeId,
          receiptNumber: p.receiptNumber,
          amountCop: p.amountCop,
          paidOn: fromDbDate(p.paidOn),
          method: p.method as CustodyPaymentMethod,
          reference: p.reference ?? undefined,
          notes: p.notes ?? undefined,
          receivedByName: p.receivedByName,
          hasProof: Boolean(proof),
          receiptDocumentId: receipt?.id,
          proofDocumentId: proof?.id,
          voidedAt: p.voidedAt?.toISOString(),
          voidReason: p.voidReason ?? undefined,
          createdAt: p.createdAt.toISOString(),
        };
      }),
      collectionStartedAt: row.collectionStartedAt?.toISOString(),
      cancelledAt: row.cancelledAt?.toISOString(),
      cancelReason: row.cancelReason ?? undefined,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Cobros con sus documentos enlazados (constancias, comprobantes, soportes). */
  async listCharges(
    tx: Prisma.TransactionClient,
    where: Prisma.CustodyChargeWhereInput,
    take = 500,
  ): Promise<CustodyCharge[]> {
    const rows = await tx.custodyCharge.findMany({
      where: { ...where, organizationId: this.orgId() },
      include: CHARGE_INCLUDE,
      orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }],
      take,
    });
    if (rows.length === 0) return [];
    const documents = await tx.custodyDocument.findMany({
      where: { organizationId: this.orgId(), chargeId: { in: rows.map((r) => r.id) } },
      select: { id: true, kind: true, chargeId: true, paymentId: true },
    });
    const today = todayInColombia();
    return rows.map((row) => this.toCharge(row, documents, today));
  }

  /** Saldo pendiente de un animal. Informativo: nunca condiciona nada. */
  async outstandingBalance(tx: Prisma.TransactionClient, animalId: string): Promise<number> {
    const charges = await this.listCharges(tx, { animalId, status: 'pending' });
    return charges.reduce((sum, charge) => sum + charge.balanceCop, 0);
  }

  toContractSnapshotParty(row: ContractRow): CustodyContractParty | null {
    const snapshot = row.snapshot as { responsible?: CustodyContractParty } | null;
    return snapshot?.responsible ?? null;
  }
}
