import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  CUSTODY_DOCUMENT_KIND_LABELS,
  CUSTODY_INTAKE_REASON_LABELS,
  CUSTODY_RELEASE_TYPE_LABELS,
  type CustodyAccountStatus,
  type CustodyContractStatus,
  type CustodyDocument,
  type CustodyDocumentKind,
  type CustodyEvent,
  type CustodyIntake,
  type CustodyOverview,
  type CustodyRelease,
  type CustodyResponsible,
  type CustodyStatus,
  type UpsertCustodyResponsibleInput,
} from '@adoptafacil/contracts';
import { isUniqueConstraintViolation } from '../../core/errors/prisma-conflict.util';
import { CustodyContractsService } from './custody-contracts.service';
import { CustodyCoreService, type UploadedFileLike } from './custody-core.service';
import { buildIntakeRecord, buildReleaseRecord } from './custody-document-builders';
import { renderCustodyPdf } from './custody-pdf';
import type { EventDto, IntakeDto, ReleaseDto, UploadDocumentDto } from './custody.schemas';
import { actorNameOf, animalCode, fromDbDate, orNull, toDbDate } from './custody.util';

const MAX_INTAKE_PHOTOS = 12;

function compact(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * Registros de custodia de un animal: responsables, ingreso y acta, salida,
 * novedades y documentos. Cada escritura deja su evento en el historial del
 * animal y su entrada en la auditoría, en la misma transacción.
 */
@Injectable()
export class CustodyRecordsService {
  constructor(
    private readonly core: CustodyCoreService,
    private readonly contracts: CustodyContractsService,
  ) {}

  // --- Responsables ----------------------------------------------------------

  async listResponsibles(search?: string): Promise<CustodyResponsible[]> {
    const organizationId = this.core.orgId();
    const term = search?.trim();
    const rows = await this.core.prisma.withOrgContext(organizationId, (tx) =>
      tx.custodyResponsible.findMany({
        where: {
          organizationId,
          ...(term
            ? {
                OR: [
                  { fullName: { contains: term, mode: 'insensitive' as const } },
                  { documentNumber: { contains: term } },
                ],
              }
            : {}),
        },
        orderBy: { fullName: 'asc' },
        take: 500,
      }),
    );
    return rows.map((row) => this.core.toResponsible(row));
  }

  async createResponsible(
    actorUserId: string,
    input: UpsertCustodyResponsibleInput,
  ): Promise<CustodyResponsible> {
    const organizationId = this.core.orgId();
    try {
      return await this.core.prisma.withOrgContext(organizationId, async (tx) => {
        const row = await tx.custodyResponsible.create({
          data: {
            organizationId,
            fullName: input.fullName,
            documentType: input.documentType,
            documentNumber: input.documentNumber,
            phone: orNull(input.phone),
            email: orNull(input.email),
            address: orNull(input.address),
            city: orNull(input.city),
            notes: orNull(input.notes),
            createdByUserId: actorUserId,
          },
        });
        await this.core.audit.recordWithTx(tx, {
          organizationId,
          actorUserId,
          action: 'custody.responsible_created',
          entityType: 'custody_responsible',
          entityId: row.id,
        });
        return this.core.toResponsible(row);
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException(
          'Ya hay un responsable registrado con ese documento. Búscalo en la lista.',
        );
      }
      throw error;
    }
  }

  /**
   * Actualiza los datos de contacto. Los documentos ya emitidos no cambian:
   * cada uno guardó su propia copia de los datos al generarse.
   */
  async updateResponsible(
    actorUserId: string,
    id: string,
    input: UpsertCustodyResponsibleInput,
  ): Promise<CustodyResponsible> {
    const organizationId = this.core.orgId();
    try {
      return await this.core.prisma.withOrgContext(organizationId, async (tx) => {
        await this.core.requireResponsible(tx, id);
        const row = await tx.custodyResponsible.update({
          where: { id },
          data: {
            fullName: input.fullName,
            documentType: input.documentType,
            documentNumber: input.documentNumber,
            phone: orNull(input.phone),
            email: orNull(input.email),
            address: orNull(input.address),
            city: orNull(input.city),
            notes: orNull(input.notes),
          },
        });
        await this.core.audit.recordWithTx(tx, {
          organizationId,
          actorUserId,
          action: 'custody.responsible_updated',
          entityType: 'custody_responsible',
          entityId: id,
          metadata: { fields: Object.keys(input) },
        });
        return this.core.toResponsible(row);
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException('Ya hay otro responsable registrado con ese documento.');
      }
      throw error;
    }
  }

  // --- Ingreso ---------------------------------------------------------------

  async listIntakes(animalId: string): Promise<CustodyIntake[]> {
    const organizationId = this.core.orgId();
    return this.core.prisma.withOrgContext(organizationId, async (tx) => {
      await this.core.requireAnimal(tx, animalId);
      const rows = await tx.animalIntake.findMany({
        where: { organizationId, animalId },
        include: { responsible: true },
        orderBy: { intakeAt: 'desc' },
      });
      return rows.map((row) => this.core.toIntake(row));
    });
  }

  private intakeData(input: IntakeDto) {
    return {
      intakeAt: new Date(input.intakeAt),
      reason: input.reason,
      reasonDetail: orNull(input.reasonDetail),
      origin: orNull(input.origin),
      responsibleId: input.responsibleId ?? null,
      physicalCondition: input.physicalCondition,
      particularFeatures: orNull(input.particularFeatures),
      vaccinationStatus: input.vaccinationStatus,
      dewormingStatus: input.dewormingStatus,
      preventiveNotes: orNull(input.preventiveNotes),
      foodProvided: orNull(input.foodProvided),
      medicationsReported: orNull(input.medicationsReported),
      notes: orNull(input.notes),
      receivedByName: input.receivedByName,
      hasVetAssessment: input.hasVetAssessment,
      // Los datos del profesional solo cuentan si hay una valoración.
      vetName: input.hasVetAssessment ? orNull(input.vetName) : null,
      vetLicense: input.hasVetAssessment ? orNull(input.vetLicense) : null,
      vetAssessmentDate:
        input.hasVetAssessment && input.vetAssessmentDate
          ? toDbDate(input.vetAssessmentDate)
          : null,
      isRetrospective: input.isRetrospective,
      retrospectiveSource: input.isRetrospective ? orNull(input.retrospectiveSource) : null,
    };
  }

  async createIntake(
    actorUserId: string,
    animalId: string,
    input: IntakeDto,
  ): Promise<CustodyIntake> {
    const organizationId = this.core.orgId();
    return this.core.prisma.withOrgContext(organizationId, async (tx) => {
      const animal = await this.core.requireAnimal(tx, animalId);
      if (input.responsibleId) await this.core.requireResponsible(tx, input.responsibleId);
      const open = await tx.animalIntake.findFirst({
        where: { organizationId, animalId, status: 'draft' },
        select: { id: true },
      });
      if (open) {
        throw new ConflictException(
          'Este animal ya tiene un registro de ingreso en borrador. Termínalo o corrígelo antes de crear otro.',
        );
      }
      const row = await tx.animalIntake.create({
        data: { organizationId, animalId, createdByUserId: actorUserId, ...this.intakeData(input) },
        include: { responsible: true },
      });
      const actorName = await actorNameOf(tx, actorUserId);
      await this.core.recordEvent(tx, {
        animalId,
        type: 'intake_recorded',
        summary: `Ingreso de ${animal.name}: ${CUSTODY_INTAKE_REASON_LABELS[input.reason]}`,
        occurredAt: row.intakeAt,
        isRetrospective: row.isRetrospective,
        retrospectiveSource: row.retrospectiveSource,
        refs: { intakeId: row.id },
        actorUserId,
        actorName,
      });
      await this.core.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'custody.intake_created',
        entityType: 'animal_intake',
        entityId: row.id,
        metadata: { animalId, reason: input.reason, retrospective: row.isRetrospective },
      });
      return this.core.toIntake(row);
    });
  }

  /** Corrige un ingreso en borrador. Un acta generada ya no se toca. */
  async updateIntake(actorUserId: string, id: string, input: IntakeDto): Promise<CustodyIntake> {
    const organizationId = this.core.orgId();
    return this.core.prisma.withOrgContext(organizationId, async (tx) => {
      const existing = await tx.animalIntake.findUnique({ where: { id } });
      if (!existing || existing.organizationId !== organizationId) {
        throw new NotFoundException('Registro de ingreso no encontrado.');
      }
      if (existing.status !== 'draft') {
        throw new ConflictException(
          'El acta de este ingreso ya se generó y no se puede modificar. Registra una novedad o adjunta un documento aclaratorio.',
        );
      }
      if (input.responsibleId) await this.core.requireResponsible(tx, input.responsibleId);
      const row = await tx.animalIntake.update({
        where: { id },
        data: this.intakeData(input),
        include: { responsible: true },
      });
      await this.core.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'custody.intake_updated',
        entityType: 'animal_intake',
        entityId: id,
        metadata: { animalId: row.animalId },
      });
      return this.core.toIntake(row);
    });
  }

  /** Foto de referencia del ingreso (solo mientras está en borrador). */
  async addIntakePhoto(
    actorUserId: string,
    intakeId: string,
    file: UploadedFileLike | undefined,
    caption?: string,
  ): Promise<CustodyDocument> {
    const organizationId = this.core.orgId();
    const intake = await this.core.prisma.withOrgContext(organizationId, async (tx) => {
      const row = await tx.animalIntake.findUnique({ where: { id: intakeId } });
      if (!row || row.organizationId !== organizationId) {
        throw new NotFoundException('Registro de ingreso no encontrado.');
      }
      if (row.status !== 'draft') {
        throw new ConflictException(
          'El acta ya se generó. Adjunta la foto como evidencia en los documentos del animal.',
        );
      }
      const count = await tx.custodyDocument.count({
        where: { organizationId, intakeId, kind: 'intake_photo' },
      });
      if (count >= MAX_INTAKE_PHOTOS) {
        throw new BadRequestException(
          `Un ingreso admite hasta ${MAX_INTAKE_PHOTOS} fotografías de referencia.`,
        );
      }
      return row;
    });
    const prepared = await this.core.prepareUpload(file, { photosOnly: true, label: 'La foto' });
    const stored = await this.core.saveFile(prepared.data, prepared.filename, prepared.contentType);
    return this.core.prisma.withOrgContext(organizationId, async (tx) => {
      const actorName = await actorNameOf(tx, actorUserId);
      const doc = await this.core.insertDocument(tx, {
        animalId: intake.animalId,
        kind: 'intake_photo',
        title: caption?.trim().slice(0, 200) || 'Fotografía de ingreso',
        source: 'uploaded',
        file: stored,
        actorUserId,
        actorName,
        intakeId,
        documentDate: fromDbDate(intake.intakeAt),
        isRetrospective: intake.isRetrospective,
        retrospectiveSource: intake.retrospectiveSource,
      });
      await this.core.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'custody.document_attached',
        entityType: 'custody_document',
        entityId: doc.id,
        metadata: { animalId: intake.animalId, kind: 'intake_photo', intakeId },
      });
      return this.core.toDocument(doc);
    });
  }

  /**
   * Genera el Acta de ingreso y recepción y cierra el registro: a partir de
   * aquí no cambia. El acta guarda su propia copia de los datos de quien
   * entrega y del animal.
   */
  async finalizeIntake(
    actorUserId: string,
    id: string,
  ): Promise<{ intake: CustodyIntake; document: CustodyDocument }> {
    const organizationId = this.core.orgId();
    const loaded = await this.core.prisma.withOrgContext(organizationId, async (tx) => {
      const intake = await tx.animalIntake.findUnique({
        where: { id },
        include: { responsible: true },
      });
      if (!intake || intake.organizationId !== organizationId) {
        throw new NotFoundException('Registro de ingreso no encontrado.');
      }
      if (intake.status !== 'draft') {
        throw new ConflictException('El acta de este ingreso ya se generó.');
      }
      const animal = await this.core.requireAnimal(tx, intake.animalId);
      const organization = await this.core.loadOrganization(tx);
      const photoRows = await tx.custodyDocument.findMany({
        where: { organizationId, intakeId: id, kind: 'intake_photo' },
        orderBy: { createdAt: 'asc' },
      });
      return { intake, animal, organization, photoRows };
    });

    const photos: Array<{ data: Buffer; caption?: string }> = [];
    for (const row of loaded.photoRows) {
      const data = await this.core.readFile(row.storageRef);
      if (data) photos.push({ data, caption: row.title });
    }
    const animalFacts = this.core.animalFacts(loaded.animal);
    const deliveredBy = loaded.intake.responsible
      ? this.core.toParty(loaded.intake.responsible)
      : undefined;
    const code = `ING-${animalCode(loaded.animal.id)}-${compact(loaded.intake.intakeAt)}`;
    const pdf = await renderCustodyPdf(
      buildIntakeRecord({
        organization: loaded.organization,
        animal: animalFacts,
        intake: this.core.toIntake(loaded.intake),
        deliveredBy,
        photos,
        code,
      }),
    );
    const stored = await this.core.saveFile(pdf, `acta-ingreso-${code}.pdf`, 'application/pdf');

    return this.core.prisma.withOrgContext(organizationId, async (tx) => {
      const actorName = await actorNameOf(tx, actorUserId);
      // Atómico frente a dos clics: solo un borrador pasa a finalizado.
      const updated = await tx.animalIntake.updateMany({
        where: { id, status: 'draft' },
        data: {
          status: 'finalized',
          finalizedAt: new Date(),
          finalizedByUserId: actorUserId,
          snapshot: {
            animal: animalFacts,
            deliveredBy: deliveredBy ?? null,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      if (updated.count === 0) {
        throw new ConflictException('El acta de este ingreso ya se generó.');
      }
      const doc = await this.core.insertDocument(tx, {
        animalId: loaded.animal.id,
        kind: 'intake_record',
        title: `Acta de ingreso de ${loaded.animal.name}`,
        source: 'generated',
        file: stored,
        actorUserId,
        actorName,
        intakeId: id,
        documentDate: fromDbDate(loaded.intake.intakeAt),
        isRetrospective: loaded.intake.isRetrospective,
        retrospectiveSource: loaded.intake.retrospectiveSource,
      });
      await this.core.recordEvent(tx, {
        animalId: loaded.animal.id,
        type: 'intake_finalized',
        summary: `Acta de ingreso generada (${code})`,
        documentId: doc.id,
        refs: { intakeId: id },
        actorUserId,
        actorName,
      });
      await this.core.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'custody.intake_finalized',
        entityType: 'animal_intake',
        entityId: id,
        metadata: { animalId: loaded.animal.id, documentId: doc.id, sha256: stored.sha256 },
      });
      const row = await tx.animalIntake.findUniqueOrThrow({
        where: { id },
        include: { responsible: true },
      });
      return { intake: this.core.toIntake(row), document: this.core.toDocument(doc) };
    });
  }

  // --- Salida ----------------------------------------------------------------

  /**
   * Acta de entrega o salida. NO consulta la cuenta para decidir: un saldo
   * pendiente se anota en el acta como información y la salida se registra
   * igual. Entregar a una autoridad exige que una persona lo haya decidido
   * (validado en el esquema y otra vez en la base).
   */
  async createRelease(
    actorUserId: string,
    animalId: string,
    input: ReleaseDto,
  ): Promise<{ release: CustodyRelease; document: CustodyDocument }> {
    const organizationId = this.core.orgId();
    const loaded = await this.core.prisma.withOrgContext(organizationId, async (tx) => {
      const animal = await this.core.requireAnimal(tx, animalId);
      const status = await this.custodyStatus(tx, animalId);
      if (status.custodyStatus === 'released') {
        throw new ConflictException(
          'Este animal ya tiene una salida registrada después de su último ingreso. Registra un nuevo ingreso antes de otra salida.',
        );
      }
      if (status.latestIntakeAt && new Date(input.releasedAt) < status.latestIntakeAt) {
        throw new BadRequestException('La salida no puede ser anterior al último ingreso.');
      }
      const organization = await this.core.loadOrganization(tx);
      const outstanding = await this.core.outstandingBalance(tx, animalId);
      const actorName = await actorNameOf(tx, actorUserId);
      return { animal, organization, outstanding, actorName };
    });

    const isAuthority = input.releaseType === 'handover_to_authority';
    const data = {
      organizationId,
      animalId,
      releaseType: input.releaseType,
      releasedAt: new Date(input.releasedAt),
      receivedByName: input.receivedByName,
      receivedByDocument: orNull(input.receivedByDocument),
      receivedByPhone: orNull(input.receivedByPhone),
      receivedByRelation: orNull(input.receivedByRelation),
      conditionAtRelease: input.conditionAtRelease,
      notes: orNull(input.notes),
      deliveredByName: input.deliveredByName,
      authorityName: isAuthority ? orNull(input.authorityName) : null,
      authorityBasis: isAuthority ? orNull(input.authorityBasis) : null,
      // Quien confirma la revisión es quien tiene la sesión: queda con nombre.
      decidedByName: isAuthority ? loaded.actorName : null,
      outstandingBalanceCop: loaded.outstanding,
      isRetrospective: input.isRetrospective,
      retrospectiveSource: input.isRetrospective ? orNull(input.retrospectiveSource) : null,
      createdByUserId: actorUserId,
    };
    const code = `SAL-${animalCode(animalId)}-${compact(data.releasedAt)}`;
    const animalFacts = this.core.animalFacts(loaded.animal);

    return this.core.prisma.withOrgContext(organizationId, async (tx) => {
      const row = await tx.custodyRelease.create({ data });
      const release = this.core.toRelease(row);
      const pdf = await renderCustodyPdf(
        buildReleaseRecord({
          organization: loaded.organization,
          animal: animalFacts,
          release,
          code,
        }),
      );
      const stored = await this.core.saveFile(pdf, `acta-salida-${code}.pdf`, 'application/pdf');
      const doc = await this.core.insertDocument(tx, {
        animalId,
        kind: 'release_record',
        title: `Acta de salida de ${loaded.animal.name}`,
        source: 'generated',
        file: stored,
        actorUserId,
        actorName: loaded.actorName,
        releaseId: row.id,
        documentDate: fromDbDate(row.releasedAt),
        isRetrospective: row.isRetrospective,
        retrospectiveSource: row.retrospectiveSource,
      });
      await this.core.recordEvent(tx, {
        animalId,
        type: 'release_recorded',
        summary: `Salida de ${loaded.animal.name}: ${CUSTODY_RELEASE_TYPE_LABELS[input.releaseType]}`,
        occurredAt: row.releasedAt,
        isRetrospective: row.isRetrospective,
        retrospectiveSource: row.retrospectiveSource,
        documentId: doc.id,
        refs: { releaseId: row.id },
        actorUserId,
        actorName: loaded.actorName,
      });
      await this.core.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'custody.release_recorded',
        entityType: 'custody_release',
        entityId: row.id,
        metadata: {
          animalId,
          releaseType: input.releaseType,
          outstandingBalanceCop: loaded.outstanding,
          humanReviewConfirmed: isAuthority ? true : undefined,
          documentId: doc.id,
        },
      });
      return { release, document: this.core.toDocument(doc) };
    });
  }

  // --- Novedades -------------------------------------------------------------

  async createEvent(actorUserId: string, animalId: string, input: EventDto): Promise<CustodyEvent> {
    const organizationId = this.core.orgId();
    return this.core.prisma.withOrgContext(organizationId, async (tx) => {
      await this.core.requireAnimal(tx, animalId);
      const actorName = await actorNameOf(tx, actorUserId);
      const notified =
        input.type === 'incident' && input.responsibleNotified !== undefined
          ? input.responsibleNotified
            ? 'Se avisó al responsable.'
            : 'Aún no se ha avisado al responsable.'
          : null;
      const row = await this.core.recordEvent(tx, {
        animalId,
        type: input.type,
        summary: input.summary,
        detail: [orNull(input.detail), notified].filter(Boolean).join('\n\n') || null,
        occurredAt: new Date(input.occurredAt),
        isRetrospective: input.isRetrospective,
        retrospectiveSource: input.isRetrospective ? orNull(input.retrospectiveSource) : null,
        actorUserId,
        actorName,
      });
      await this.core.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'custody.event_recorded',
        entityType: 'custody_event',
        entityId: row.id,
        metadata: { animalId, type: input.type },
      });
      return this.core.toEvent(row);
    });
  }

  async timeline(animalId: string): Promise<CustodyEvent[]> {
    const organizationId = this.core.orgId();
    return this.core.prisma.withOrgContext(organizationId, async (tx) => {
      await this.core.requireAnimal(tx, animalId);
      const rows = await tx.custodyEvent.findMany({
        where: { organizationId, animalId },
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        take: 500,
      });
      return rows.map((row) => this.core.toEvent(row));
    });
  }

  // --- Documentos ------------------------------------------------------------

  async listDocuments(animalId: string): Promise<CustodyDocument[]> {
    const organizationId = this.core.orgId();
    return this.core.prisma.withOrgContext(organizationId, async (tx) => {
      await this.core.requireAnimal(tx, animalId);
      const rows = await tx.custodyDocument.findMany({
        where: { organizationId, animalId },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      return rows.map((row) => this.core.toDocument(row));
    });
  }

  /**
   * Adjunta un documento externo al historial. Un contrato firmado, además,
   * deja el contrato como vigente. Lo ya guardado nunca se reemplaza: una
   * versión nueva del mismo tipo y vínculo queda como versión siguiente.
   */
  async uploadDocument(
    actorUserId: string,
    animalId: string,
    input: UploadDocumentDto,
    file: UploadedFileLike | undefined,
  ): Promise<CustodyDocument> {
    const organizationId = this.core.orgId();
    const kind = input.kind as CustodyDocumentKind;
    await this.core.prisma.withOrgContext(organizationId, async (tx) => {
      await this.core.requireAnimal(tx, animalId);
      await this.assertLinks(tx, animalId, input);
    });
    if (kind === 'signed_contract' && !input.contractId) {
      throw new BadRequestException('Indica a qué contrato corresponde el ejemplar firmado.');
    }
    const prepared = await this.core.prepareUpload(file);
    const stored = await this.core.saveFile(prepared.data, prepared.filename, prepared.contentType);

    return this.core.prisma.withOrgContext(organizationId, async (tx) => {
      const actorName = await actorNameOf(tx, actorUserId);
      const previous = await tx.custodyDocument.findFirst({
        where: {
          organizationId,
          animalId,
          kind,
          source: 'uploaded',
          contractId: input.contractId ?? null,
          intakeId: input.intakeId ?? null,
          releaseId: input.releaseId ?? null,
          chargeId: input.chargeId ?? null,
          paymentId: input.paymentId ?? null,
          // Solo los firmados y las valoraciones se versionan; lo demás se acumula.
          ...(kind === 'signed_contract' || kind === 'signed_record' || kind === 'vet_assessment'
            ? {}
            : { id: '00000000-0000-0000-0000-000000000000' }),
        },
        orderBy: { version: 'desc' },
      });
      const doc = await this.core.insertDocument(tx, {
        animalId,
        kind,
        title: input.title,
        source: 'uploaded',
        file: stored,
        actorUserId,
        actorName,
        version: previous ? previous.version + 1 : 1,
        replacesDocumentId: previous?.id ?? null,
        documentDate: input.documentDate ?? null,
        isRetrospective: input.isRetrospective,
        retrospectiveSource: input.isRetrospective ? orNull(input.retrospectiveSource) : null,
        intakeId: input.intakeId ?? null,
        contractId: input.contractId ?? null,
        chargeId: input.chargeId ?? null,
        paymentId: input.paymentId ?? null,
        releaseId: input.releaseId ?? null,
      });
      await this.core.recordEvent(tx, {
        animalId,
        type: 'document_attached',
        summary: `${CUSTODY_DOCUMENT_KIND_LABELS[kind]}: ${input.title}`,
        isRetrospective: input.isRetrospective,
        retrospectiveSource: input.isRetrospective ? orNull(input.retrospectiveSource) : null,
        documentId: doc.id,
        actorUserId,
        actorName,
      });
      await this.core.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'custody.document_attached',
        entityType: 'custody_document',
        entityId: doc.id,
        metadata: { animalId, kind, version: doc.version, sha256: stored.sha256 },
      });
      if (kind === 'signed_contract' && input.contractId) {
        await this.contracts.markSigned(tx, actorUserId, actorName, input.contractId, doc.id);
      }
      return this.core.toDocument(doc);
    });
  }

  /** Lo que el documento dice enlazar debe existir y ser de ESTE animal. */
  private async assertLinks(
    tx: Prisma.TransactionClient,
    animalId: string,
    input: UploadDocumentDto,
  ): Promise<void> {
    const mismatch = (): never => {
      throw new BadRequestException('El registro enlazado no corresponde a este animal.');
    };
    if (input.intakeId) {
      const row = await tx.animalIntake.findUnique({ where: { id: input.intakeId } });
      if (!row || row.animalId !== animalId) mismatch();
    }
    if (input.contractId) {
      const row = await tx.custodyContract.findUnique({ where: { id: input.contractId } });
      if (!row || row.animalId !== animalId) mismatch();
    }
    if (input.releaseId) {
      const row = await tx.custodyRelease.findUnique({ where: { id: input.releaseId } });
      if (!row || row.animalId !== animalId) mismatch();
    }
    if (input.chargeId) {
      const row = await tx.custodyCharge.findUnique({ where: { id: input.chargeId } });
      if (!row || row.animalId !== animalId) mismatch();
    }
    if (input.paymentId) {
      const row = await tx.custodyPayment.findUnique({
        where: { id: input.paymentId },
        include: { charge: { select: { animalId: true } } },
      });
      if (!row || row.charge.animalId !== animalId) mismatch();
    }
  }

  /** Bytes de un documento del historial. Cada descarga queda auditada. */
  async downloadDocument(
    actorUserId: string,
    id: string,
  ): Promise<{ data: Buffer; filename: string }> {
    const organizationId = this.core.orgId();
    const row = await this.core.prisma.withOrgContext(organizationId, (tx) =>
      tx.custodyDocument.findUnique({ where: { id } }),
    );
    if (!row || row.organizationId !== organizationId) {
      throw new NotFoundException('Documento no encontrado.');
    }
    const data = await this.core.readFile(row.storageRef);
    if (!data) throw new NotFoundException('El archivo de este documento no está disponible.');
    await this.core.audit.record({
      organizationId,
      actorUserId,
      action: 'custody.document_downloaded',
      entityType: 'custody_document',
      entityId: id,
      metadata: { kind: row.kind },
    });
    return { data, filename: row.storageRef };
  }

  // --- Resumen del animal ----------------------------------------------------

  /** Custodia según el último ingreso y la última salida. No mira la cuenta. */
  private async custodyStatus(
    tx: Prisma.TransactionClient,
    animalId: string,
  ): Promise<{ custodyStatus: CustodyStatus; latestIntakeAt: Date | null }> {
    const organizationId = this.core.orgId();
    const [intake, release] = await Promise.all([
      tx.animalIntake.findFirst({
        where: { organizationId, animalId },
        orderBy: { intakeAt: 'desc' },
        select: { intakeAt: true },
      }),
      tx.custodyRelease.findFirst({
        where: { organizationId, animalId },
        orderBy: { releasedAt: 'desc' },
        select: { releasedAt: true },
      }),
    ]);
    let custodyStatus: CustodyStatus = 'not_registered';
    if (intake && (!release || intake.intakeAt > release.releasedAt)) custodyStatus = 'in_custody';
    else if (release) custodyStatus = 'released';
    return { custodyStatus, latestIntakeAt: intake?.intakeAt ?? null };
  }

  /** Los cuatro estados del animal, cada uno calculado por su lado. */
  async overview(animalId: string): Promise<CustodyOverview> {
    const organizationId = this.core.orgId();
    return this.core.prisma.withOrgContext(organizationId, async (tx) => {
      const animal = await this.core.requireAnimal(tx, animalId);
      const { custodyStatus } = await this.custodyStatus(tx, animalId);
      const [intake, release, contract, charges] = await Promise.all([
        tx.animalIntake.findFirst({
          where: { organizationId, animalId },
          include: { responsible: true },
          orderBy: { intakeAt: 'desc' },
        }),
        tx.custodyRelease.findFirst({
          where: { organizationId, animalId },
          orderBy: { releasedAt: 'desc' },
        }),
        this.contracts.currentForAnimal(tx, animalId),
        this.core.listCharges(tx, { animalId, status: { not: 'cancelled' } }),
      ]);
      const open = charges.filter((c) => c.status === 'pending');
      const pendingCop = open.reduce((sum, c) => sum + c.balanceCop, 0);
      const overdueCop = open
        .filter((c) => c.situation === 'overdue' || c.situation === 'extension_breached')
        .reduce((sum, c) => sum + c.balanceCop, 0);
      let accountStatus: CustodyAccountStatus = 'no_charges';
      if (overdueCop > 0) accountStatus = 'overdue';
      else if (pendingCop > 0) accountStatus = 'pending';
      else if (charges.length > 0) accountStatus = 'up_to_date';
      return {
        animalId,
        custodyStatus,
        contractStatus: (contract?.status as CustodyContractStatus | undefined) ?? 'none',
        accountStatus,
        welfareStatus: animal.status,
        pendingCop,
        overdueCop,
        latestIntake: intake ? this.core.toIntake(intake) : undefined,
        currentContract: contract ?? undefined,
        latestRelease: release ? this.core.toRelease(release) : undefined,
        intakeDate: (intake?.intakeAt ?? animal.createdAt).toISOString(),
        intakeDateSource: intake ? 'intake_record' : 'system_record',
      };
    });
  }
}
