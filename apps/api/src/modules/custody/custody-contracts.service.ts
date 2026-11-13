import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CustodyContract as ContractRow,
  CustodyContractTemplate as TemplateRow,
  CustodyResponsible as ResponsibleRow,
  Prisma,
} from '@prisma/client';
import {
  CUSTODY_BASE_TEMPLATE,
  CUSTODY_BASE_TEMPLATE_KEY,
  CUSTODY_ID_TYPES,
  type CustodyClause,
  type CustodyContract,
  type CustodyContractParty,
  type CustodyContractPrefill,
  type CustodyContractRepresentative,
  type CustodyContractStatus,
  type CustodyContractTemplate,
  type CustodyDocument,
  type CustodyMissingField,
  type CustodyPaymentFrequency,
  type SaveCustodyContractTemplateInput,
} from '@adoptafacil/contracts';
import { CustodyCoreService } from './custody-core.service';
import { type AnimalFacts, buildContract } from './custody-document-builders';
import { type CustodyPdfOrganization, renderCustodyPdf } from './custody-pdf';
import type { ContractDto } from './custody.schemas';
import { actorNameOf, fromDbDate, orNull, toDbDate, todayInColombia } from './custody.util';

type ContractWithRelations = ContractRow & {
  responsible: ResponsibleRow;
  animal: { name: string };
};

const CONTRACT_INCLUDE = {
  responsible: true,
  animal: { select: { name: true } },
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LOCKED_CLAUSES = CUSTODY_BASE_TEMPLATE.clauses.filter((clause) => clause.locked);

/**
 * Las cláusulas bloqueadas (la deuda no retiene al animal) van SIEMPRE, con
 * el texto de la base y activas: si llegan editadas o faltan, se reponen.
 * Ninguna otra cláusula puede declararse bloqueada.
 */
export function withLockedClauses(clauses: CustodyClause[]): CustodyClause[] {
  const lockedIds = new Set(LOCKED_CLAUSES.map((clause) => clause.id));
  const result: CustodyClause[] = [];
  const seen = new Set<string>();
  for (const clause of clauses) {
    if (lockedIds.has(clause.id)) {
      const base = LOCKED_CLAUSES.find((c) => c.id === clause.id)!;
      result.push({ ...base, enabled: true, locked: true });
      seen.add(clause.id);
    } else {
      result.push({
        id: clause.id,
        title: clause.title,
        body: clause.body,
        enabled: clause.enabled,
      });
    }
  }
  for (const base of LOCKED_CLAUSES) {
    if (!seen.has(base.id)) result.push({ ...base, enabled: true, locked: true });
  }
  return result;
}

/**
 * Plantillas y contratos de guardería. Una plantilla se versiona (editar
 * inserta la versión siguiente) y un contrato emitido guarda su propia copia
 * de cláusulas y partes: cambiar la plantilla o el perfil después no lo toca.
 */
@Injectable()
export class CustodyContractsService {
  constructor(private readonly core: CustodyCoreService) {}

  // --- Plantillas ------------------------------------------------------------

  private toTemplate(row: TemplateRow): CustodyContractTemplate {
    return {
      templateKey: row.templateKey,
      version: row.version,
      name: row.name,
      isBase: false,
      clauses: row.clauses as unknown as CustodyClause[],
      annexes: row.annexes as unknown as string[],
      archived: Boolean(row.archivedAt),
      createdAt: row.createdAt.toISOString(),
      createdByName: row.createdByName,
    };
  }

  /** La base de AdoptaFácil y la última versión de cada plantilla propia. */
  async listTemplates(): Promise<CustodyContractTemplate[]> {
    const organizationId = this.core.orgId();
    const rows = await this.core.prisma.withOrgContext(organizationId, (tx) =>
      tx.custodyContractTemplate.findMany({
        where: { organizationId },
        orderBy: [{ templateKey: 'asc' }, { version: 'desc' }],
      }),
    );
    const latest = new Map<string, TemplateRow>();
    for (const row of rows) if (!latest.has(row.templateKey)) latest.set(row.templateKey, row);
    const own = [...latest.values()]
      .map((row) => this.toTemplate(row))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
    return [CUSTODY_BASE_TEMPLATE, ...own];
  }

  async templateVersions(templateKey: string): Promise<CustodyContractTemplate[]> {
    if (templateKey === CUSTODY_BASE_TEMPLATE_KEY) return [CUSTODY_BASE_TEMPLATE];
    if (!UUID.test(templateKey)) throw new NotFoundException('Plantilla no encontrada.');
    const organizationId = this.core.orgId();
    const rows = await this.core.prisma.withOrgContext(organizationId, (tx) =>
      tx.custodyContractTemplate.findMany({
        where: { organizationId, templateKey },
        orderBy: { version: 'desc' },
      }),
    );
    if (rows.length === 0) throw new NotFoundException('Plantilla no encontrada.');
    return rows.map((row) => this.toTemplate(row));
  }

  async createTemplate(
    actorUserId: string,
    input: SaveCustodyContractTemplateInput,
  ): Promise<CustodyContractTemplate> {
    return this.insertTemplateVersion(actorUserId, randomUUID(), 1, input);
  }

  /** Editar una plantilla guarda la versión siguiente; las anteriores quedan. */
  async updateTemplate(
    actorUserId: string,
    templateKey: string,
    input: SaveCustodyContractTemplateInput,
  ): Promise<CustodyContractTemplate> {
    if (templateKey === CUSTODY_BASE_TEMPLATE_KEY) {
      throw new BadRequestException(
        'La plantilla base no se edita. Crea una plantilla propia a partir de ella.',
      );
    }
    const versions = await this.templateVersions(templateKey);
    if (versions[0].archived) {
      throw new ConflictException('Esta plantilla está archivada.');
    }
    return this.insertTemplateVersion(actorUserId, templateKey, versions[0].version + 1, input);
  }

  private async insertTemplateVersion(
    actorUserId: string,
    templateKey: string,
    version: number,
    input: SaveCustodyContractTemplateInput,
  ): Promise<CustodyContractTemplate> {
    const organizationId = this.core.orgId();
    try {
      return await this.core.prisma.withOrgContext(organizationId, async (tx) => {
        const actorName = await actorNameOf(tx, actorUserId);
        const row = await tx.custodyContractTemplate.create({
          data: {
            organizationId,
            templateKey,
            version,
            name: input.name,
            clauses: withLockedClauses(input.clauses) as unknown as Prisma.InputJsonValue,
            annexes: input.annexes as unknown as Prisma.InputJsonValue,
            createdByUserId: actorUserId,
            createdByName: actorName,
          },
        });
        await this.core.audit.recordWithTx(tx, {
          organizationId,
          actorUserId,
          action: version === 1 ? 'custody.template_created' : 'custody.template_versioned',
          entityType: 'custody_contract_template',
          entityId: row.id,
          metadata: { templateKey, version },
        });
        return this.toTemplate(row);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'Otra persona acaba de guardar esta plantilla. Vuelve a abrirla e inténtalo de nuevo.',
        );
      }
      throw error;
    }
  }

  /** Archivar deja de ofrecerla para contratos nuevos. No borra nada. */
  async archiveTemplate(actorUserId: string, templateKey: string): Promise<void> {
    if (templateKey === CUSTODY_BASE_TEMPLATE_KEY) {
      throw new BadRequestException('La plantilla base no se puede archivar.');
    }
    await this.templateVersions(templateKey);
    const organizationId = this.core.orgId();
    await this.core.prisma.withOrgContext(organizationId, async (tx) => {
      await tx.custodyContractTemplate.updateMany({
        where: { organizationId, templateKey, archivedAt: null },
        data: { archivedAt: new Date() },
      });
      await this.core.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'custody.template_archived',
        entityType: 'custody_contract_template',
        entityId: templateKey,
      });
    });
  }

  private async resolveTemplate(
    tx: Prisma.TransactionClient,
    templateKey: string | undefined,
  ): Promise<CustodyContractTemplate> {
    if (!templateKey || templateKey === CUSTODY_BASE_TEMPLATE_KEY) return CUSTODY_BASE_TEMPLATE;
    if (!UUID.test(templateKey)) throw new BadRequestException('La plantilla elegida no existe.');
    const row = await tx.custodyContractTemplate.findFirst({
      where: { organizationId: this.core.orgId(), templateKey },
      orderBy: { version: 'desc' },
    });
    if (!row) throw new BadRequestException('La plantilla elegida no existe.');
    if (row.archivedAt) throw new BadRequestException('La plantilla elegida está archivada.');
    return this.toTemplate(row);
  }

  // --- Contratos -------------------------------------------------------------

  toContract(row: ContractWithRelations): CustodyContract {
    return {
      id: row.id,
      number: row.number,
      animalId: row.animalId,
      animalName: row.animal.name,
      status: row.status as CustodyContractStatus,
      responsible: this.core.toResponsible(row.responsible),
      representative: row.representative as unknown as CustodyContractRepresentative,
      templateName: row.templateName,
      templateKey: row.templateKey ?? undefined,
      templateVersion: row.templateVersion ?? undefined,
      startDate: fromDbDate(row.startDate),
      endDate: row.endDate ? fromDbDate(row.endDate) : undefined,
      monthlyFeeCop: row.monthlyFeeCop,
      foodFeeCop: row.foodFeeCop ?? undefined,
      paymentFrequency: row.paymentFrequency as CustodyPaymentFrequency,
      paymentDay: row.paymentDay ?? undefined,
      graceDays: row.graceDays,
      pickupDays: row.pickupDays,
      noticeDays: row.noticeDays,
      serviceCity: row.serviceCity ?? undefined,
      paymentConditions: row.paymentConditions ?? undefined,
      observations: row.observations ?? undefined,
      clauses: row.clauses as unknown as CustodyClause[],
      annexes: row.annexes as unknown as string[],
      issuedAt: row.issuedAt?.toISOString(),
      signedAt: row.signedAt?.toISOString(),
      endedAt: row.endedAt?.toISOString(),
      endReason: row.endReason ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async requireContract(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<ContractWithRelations> {
    const row = await tx.custodyContract.findUnique({ where: { id }, include: CONTRACT_INCLUDE });
    if (!row || row.organizationId !== this.core.orgId()) {
      throw new NotFoundException('Contrato no encontrado.');
    }
    return row;
  }

  async listContracts(filter: { animalId?: string } = {}): Promise<CustodyContract[]> {
    const organizationId = this.core.orgId();
    const rows = await this.core.prisma.withOrgContext(organizationId, (tx) =>
      tx.custodyContract.findMany({
        where: { organizationId, ...(filter.animalId ? { animalId: filter.animalId } : {}) },
        include: CONTRACT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
    );
    return rows.map((row) => this.toContract(row));
  }

  async getContract(id: string): Promise<CustodyContract> {
    const organizationId = this.core.orgId();
    return this.core.prisma.withOrgContext(organizationId, async (tx) =>
      this.toContract(await this.requireContract(tx, id)),
    );
  }

  /** El contrato abierto más reciente del animal, o el último cerrado. */
  async currentForAnimal(
    tx: Prisma.TransactionClient,
    animalId: string,
  ): Promise<CustodyContract | null> {
    const organizationId = this.core.orgId();
    const open = await tx.custodyContract.findFirst({
      where: { organizationId, animalId, status: { in: ['active', 'issued', 'draft'] } },
      include: CONTRACT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    const row =
      open ??
      (await tx.custodyContract.findFirst({
        where: { organizationId, animalId },
        include: CONTRACT_INCLUDE,
        orderBy: { createdAt: 'desc' },
      }));
    return row ? this.toContract(row) : null;
  }

  /**
   * Lo que ya está registrado y el formulario no vuelve a pedir: datos de la
   * organización, representante legal, animal y el responsable de su último
   * ingreso. También dice qué falta para poder emitir.
   */
  async prefill(animalId: string): Promise<CustodyContractPrefill> {
    const organizationId = this.core.orgId();
    return this.core.prisma.withOrgContext(organizationId, async (tx) => {
      const animal = await this.core.requireAnimal(tx, animalId);
      const organization = await this.core.loadOrganization(tx);
      const signer = await tx.legalRepresentative.findFirst({
        where: { organizationId, role: 'legal_representative' },
        orderBy: { signedAt: 'desc' },
      });
      const intake = await tx.animalIntake.findFirst({
        where: { organizationId, animalId, responsibleId: { not: null } },
        include: { responsible: true },
        orderBy: { intakeAt: 'desc' },
      });
      const facts = this.core.animalFacts(animal);
      const idTypes: readonly string[] = CUSTODY_ID_TYPES;
      return {
        organization: {
          name: organization.name,
          legalName: organization.legalName,
          nit: organization.nit,
          address: organization.address,
          city: organization.city,
          phone: organization.phone,
          email: organization.email,
        },
        representative: signer
          ? {
              fullName: signer.fullName,
              documentType: idTypes.includes(signer.documentType) ? signer.documentType : 'OTRO',
              documentNumber: signer.documentNumber,
              position: signer.position,
            }
          : undefined,
        animal: {
          id: facts.id,
          name: facts.name,
          species: facts.species,
          sex: facts.sex,
          breed: facts.breed,
          ageLabel: facts.ageLabel,
        },
        responsible: intake?.responsible ? this.core.toResponsible(intake.responsible) : undefined,
        missing: this.core.missingOrganizationData(organization),
      };
    });
  }

  private contractData(input: ContractDto, template: CustodyContractTemplate) {
    return {
      responsibleId: input.responsibleId,
      templateKey: template.templateKey,
      templateVersion: template.version,
      templateName: template.name,
      startDate: toDbDate(input.startDate),
      endDate: input.endDate ? toDbDate(input.endDate) : null,
      monthlyFeeCop: input.monthlyFeeCop,
      foodFeeCop: input.foodFeeCop ?? null,
      paymentFrequency: input.paymentFrequency,
      paymentDay: input.paymentDay ?? null,
      graceDays: input.graceDays,
      pickupDays: input.pickupDays,
      noticeDays: input.noticeDays,
      serviceCity: orNull(input.serviceCity),
      paymentConditions: orNull(input.paymentConditions),
      observations: orNull(input.observations),
      representative: input.representative as unknown as Prisma.InputJsonValue,
      clauses: withLockedClauses(
        input.clauses ?? template.clauses,
      ) as unknown as Prisma.InputJsonValue,
      annexes: (input.annexes ?? template.annexes) as unknown as Prisma.InputJsonValue,
    };
  }

  /** Consecutivo por organización y año: GC-2026-0001. */
  private async nextNumber(tx: Prisma.TransactionClient): Promise<string> {
    const organizationId = this.core.orgId();
    // Serializa la numeración de ESTA organización dentro de la transacción.
    const lockKey = `custody_contract:${organizationId}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))::text AS locked`;
    const year = todayInColombia().slice(0, 4);
    const prefix = `GC-${year}-`;
    const count = await tx.custodyContract.count({
      where: { organizationId, number: { startsWith: prefix } },
    });
    return `${prefix}${String(count + 1).padStart(4, '0')}`;
  }

  async createDraft(actorUserId: string, input: ContractDto): Promise<CustodyContract> {
    const organizationId = this.core.orgId();
    return this.core.prisma.withOrgContext(organizationId, async (tx) => {
      await this.core.requireAnimal(tx, input.animalId);
      await this.core.requireResponsible(tx, input.responsibleId);
      const template = await this.resolveTemplate(tx, input.templateKey);
      const number = await this.nextNumber(tx);
      const row = await tx.custodyContract.create({
        data: {
          organizationId,
          animalId: input.animalId,
          number,
          createdByUserId: actorUserId,
          ...this.contractData(input, template),
        },
        include: CONTRACT_INCLUDE,
      });
      await this.core.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'custody.contract_drafted',
        entityType: 'custody_contract',
        entityId: row.id,
        metadata: { animalId: input.animalId, number, templateKey: template.templateKey },
      });
      return this.toContract(row);
    });
  }

  async updateDraft(actorUserId: string, id: string, input: ContractDto): Promise<CustodyContract> {
    const organizationId = this.core.orgId();
    return this.core.prisma.withOrgContext(organizationId, async (tx) => {
      const existing = await this.requireContract(tx, id);
      if (existing.status !== 'draft') {
        throw new ConflictException(
          'Este contrato ya se emitió y sus términos no cambian. Si hay un error, anúlalo y emite uno nuevo.',
        );
      }
      if (input.animalId !== existing.animalId) {
        throw new BadRequestException('Un contrato no puede cambiar de animal.');
      }
      await this.core.requireResponsible(tx, input.responsibleId);
      // Si no se eligió otra plantilla, el borrador conserva la que tenía.
      const sameTemplate = !input.templateKey || input.templateKey === existing.templateKey;
      const template = sameTemplate
        ? {
            ...CUSTODY_BASE_TEMPLATE,
            templateKey: existing.templateKey ?? CUSTODY_BASE_TEMPLATE_KEY,
            version: existing.templateVersion ?? 1,
            name: existing.templateName,
            clauses: existing.clauses as unknown as CustodyClause[],
            annexes: existing.annexes as unknown as string[],
          }
        : await this.resolveTemplate(tx, input.templateKey);
      const row = await tx.custodyContract.update({
        where: { id },
        data: this.contractData(input, template),
        include: CONTRACT_INCLUDE,
      });
      await this.core.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'custody.contract_draft_updated',
        entityType: 'custody_contract',
        entityId: id,
      });
      return this.toContract(row);
    });
  }

  private missingForContract(
    organization: CustodyPdfOrganization,
    responsible: CustodyContractParty,
  ): CustodyMissingField[] {
    const missing = this.core.missingOrganizationData(organization);
    if (!responsible.phone && !responsible.email) {
      missing.push({
        field: 'responsible.contact',
        message: 'Registra un teléfono o un correo del responsable.',
      });
    }
    if (!responsible.address) {
      missing.push({
        field: 'responsible.address',
        message: 'Registra la dirección del responsable.',
      });
    }
    return missing;
  }

  private async renderContract(
    organization: CustodyPdfOrganization,
    animal: AnimalFacts,
    responsible: CustodyContractParty,
    contract: CustodyContract,
    draft: boolean,
  ): Promise<Buffer> {
    return renderCustodyPdf(buildContract({ organization, animal, responsible, contract, draft }));
  }

  /** Vista previa con marca de BORRADOR. No se guarda ni cuenta como documento. */
  async previewPdf(id: string): Promise<Buffer> {
    const organizationId = this.core.orgId();
    const loaded = await this.core.prisma.withOrgContext(organizationId, async (tx) => {
      const row = await this.requireContract(tx, id);
      const animal = await this.core.requireAnimal(tx, row.animalId);
      const organization = await this.core.loadOrganization(tx);
      return { row, animal, organization };
    });
    return this.renderContract(
      loaded.organization,
      this.core.animalFacts(loaded.animal),
      this.core.toParty(loaded.row.responsible),
      this.toContract(loaded.row),
      loaded.row.status === 'draft',
    );
  }

  /**
   * Emite el contrato definitivo: congela términos, cláusulas y los datos de
   * las partes, genera el PDF y lo deja en el historial para firma externa.
   */
  async issue(
    actorUserId: string,
    id: string,
  ): Promise<{ contract: CustodyContract; document: CustodyDocument }> {
    const organizationId = this.core.orgId();
    const loaded = await this.core.prisma.withOrgContext(organizationId, async (tx) => {
      const row = await this.requireContract(tx, id);
      if (row.status !== 'draft') throw new ConflictException('Este contrato ya se emitió.');
      const animal = await this.core.requireAnimal(tx, row.animalId);
      const organization = await this.core.loadOrganization(tx);
      return { row, animal, organization };
    });
    const responsible = this.core.toParty(loaded.row.responsible);
    this.core.assertNothingMissing(this.missingForContract(loaded.organization, responsible));

    const animalFacts = this.core.animalFacts(loaded.animal);
    const contract = this.toContract(loaded.row);
    const pdf = await this.renderContract(
      loaded.organization,
      animalFacts,
      responsible,
      contract,
      false,
    );
    const stored = await this.core.saveFile(
      pdf,
      `contrato-${contract.number}.pdf`,
      'application/pdf',
    );
    const { logo: _logo, ...organizationData } = loaded.organization;

    return this.core.prisma.withOrgContext(organizationId, async (tx) => {
      const actorName = await actorNameOf(tx, actorUserId);
      // Atómico frente a dos clics: solo un borrador pasa a emitido.
      const updated = await tx.custodyContract.updateMany({
        where: { id, status: 'draft', updatedAt: loaded.row.updatedAt },
        data: {
          status: 'issued',
          issuedAt: new Date(),
          issuedByUserId: actorUserId,
          snapshot: {
            organization: organizationData,
            responsible,
            animal: animalFacts,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      if (updated.count === 0) {
        throw new ConflictException(
          'El contrato cambió mientras se emitía. Revísalo y vuelve a intentarlo.',
        );
      }
      const doc = await this.core.insertDocument(tx, {
        animalId: loaded.row.animalId,
        kind: 'boarding_contract',
        title: `Contrato de guardería ${contract.number}`,
        source: 'generated',
        file: stored,
        actorUserId,
        actorName,
        contractId: id,
        responsibleId: loaded.row.responsibleId,
        documentDate: contract.startDate,
      });
      await this.core.recordEvent(tx, {
        animalId: loaded.row.animalId,
        type: 'contract_issued',
        summary: `Contrato ${contract.number} emitido para firma`,
        documentId: doc.id,
        refs: { contractId: id },
        actorUserId,
        actorName,
      });
      await this.core.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'custody.contract_issued',
        entityType: 'custody_contract',
        entityId: id,
        metadata: {
          animalId: loaded.row.animalId,
          number: contract.number,
          templateKey: contract.templateKey,
          templateVersion: contract.templateVersion,
          documentId: doc.id,
          sha256: stored.sha256,
        },
      });
      const row = await this.requireContract(tx, id);
      return { contract: this.toContract(row), document: this.core.toDocument(doc) };
    });
  }

  /**
   * Se adjuntó el ejemplar firmado: un contrato emitido pasa a vigente. La
   * firma ocurre fuera de AdoptaFácil; aquí solo queda el documento.
   */
  async markSigned(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    actorName: string,
    contractId: string,
    documentId: string,
  ): Promise<void> {
    const row = await this.requireContract(tx, contractId);
    if (row.status === 'draft') {
      throw new ConflictException('Emite el contrato antes de adjuntar el ejemplar firmado.');
    }
    if (row.status !== 'issued') return;
    await tx.custodyContract.update({
      where: { id: contractId },
      data: { status: 'active', signedAt: new Date() },
    });
    await this.core.recordEvent(tx, {
      animalId: row.animalId,
      type: 'contract_signed',
      summary: `Contrato ${row.number} firmado: queda vigente`,
      documentId,
      refs: { contractId },
      actorUserId,
      actorName,
    });
    await this.core.audit.recordWithTx(tx, {
      organizationId: row.organizationId,
      actorUserId,
      action: 'custody.contract_signed',
      entityType: 'custody_contract',
      entityId: contractId,
      metadata: { documentId },
    });
  }

  /**
   * Termina un contrato emitido o vigente. Terminar el contrato no cambia la
   * custodia ni la cuenta: la salida del animal se registra con su acta y los
   * saldos siguen su propio curso.
   */
  end(actorUserId: string, id: string, reason: string): Promise<CustodyContract> {
    return this.close(actorUserId, id, reason, 'ended');
  }

  /** Anula un borrador o un contrato emitido que aún no se firmó. */
  cancel(actorUserId: string, id: string, reason: string): Promise<CustodyContract> {
    return this.close(actorUserId, id, reason, 'cancelled');
  }

  private async close(
    actorUserId: string,
    id: string,
    reason: string,
    status: 'ended' | 'cancelled',
  ): Promise<CustodyContract> {
    const organizationId = this.core.orgId();
    return this.core.prisma.withOrgContext(organizationId, async (tx) => {
      const existing = await this.requireContract(tx, id);
      const allowed = status === 'ended' ? ['issued', 'active'] : ['draft', 'issued'];
      if (!allowed.includes(existing.status)) {
        throw new ConflictException(
          status === 'ended'
            ? 'Solo se termina un contrato emitido o vigente.'
            : 'Solo se anula un contrato en borrador o emitido sin firmar. Un contrato vigente se termina.',
        );
      }
      const actorName = await actorNameOf(tx, actorUserId);
      const row = await tx.custodyContract.update({
        where: { id },
        data: { status, endedAt: new Date(), endedByUserId: actorUserId, endReason: reason },
        include: CONTRACT_INCLUDE,
      });
      await this.core.recordEvent(tx, {
        animalId: row.animalId,
        type: status === 'ended' ? 'contract_ended' : 'contract_cancelled',
        summary: `Contrato ${row.number} ${status === 'ended' ? 'terminado' : 'anulado'}`,
        detail: reason,
        refs: { contractId: id },
        actorUserId,
        actorName,
      });
      await this.core.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: status === 'ended' ? 'custody.contract_ended' : 'custody.contract_cancelled',
        entityType: 'custody_contract',
        entityId: id,
        metadata: { animalId: row.animalId, previousStatus: existing.status },
      });
      return this.toContract(row);
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
  );
}
