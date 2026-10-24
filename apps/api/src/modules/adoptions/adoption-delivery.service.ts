import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  ADOPTION_DELIVERY_CODE_TTL_MINUTES,
  type AdoptionAnimalRecord,
  type AdoptionContractPayload,
  type AdoptionContractSigner,
  type AdoptionDelivery,
  type AdoptionDeliveryCodeIssued,
  type AdoptionDeliveryDetails,
  type AdoptionDeliveryMilestonePlanItem,
  type AdoptionDeliveryPhotoTarget,
  type AdoptionDeliveryStatus,
  type StartAdoptionDeliveryInput,
} from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { AuditService } from '../../core/audit/audit.service';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../../core/notifications/notification.port';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';
import { parseStorageKey } from '../../core/storage/storage-keys';
import type { RequestUser } from '../../core/auth/auth.types';
import {
  buildAnimalRecord,
  buildMilestonePlan,
  computeDeliveryHash,
  deliveryConfirmUrl,
  generateDeliveryCode,
  hashDeliveryCode,
} from './adoption-delivery-rules';

type DeliveryModel = Prisma.AdoptionDeliveryGetPayload<Record<string, never>>;

/** Fila que devuelve `adoption_deliveries_for_adopter` (sin hash ni intentos). */
interface AdopterDeliveryRow {
  id: string;
  organization_id: string;
  contract_id: string;
  request_id: string;
  animal_id: string;
  animal_name: string;
  status: string;
  details: AdoptionDeliveryDetails;
  record: AdoptionAnimalRecord;
  milestone_plan: AdoptionDeliveryMilestonePlanItem[];
  content_hash: string;
  code_expires_at: Date | null;
  created_at: Date;
  confirmed_at: Date | null;
}

type ConfirmOutcome =
  | 'confirmed'
  | 'invalid_code'
  | 'expired'
  | 'locked'
  | 'not_pending'
  | 'already_confirmed'
  | 'not_found';

/**
 * Acta de ENTREGA del animal (ajuste 6). La organización registra la entrega y
 * obtiene un código de 6 dígitos (y su QR); el adoptante lo confirma y la
 * función `adoption_delivery_confirm` sella el acta, marca el animal como
 * adoptado y programa los hitos del plan en una sola transacción.
 *
 * Toda la lectura del expediente ocurre del lado de la organización (su propio
 * tenant) al iniciar la entrega: el adoptante nunca lee tablas de otra
 * organización, solo su acta a través de la función acotada.
 */
@Injectable()
export class AdoptionDeliveryService {
  private readonly logger = new Logger('AdoptionDelivery');
  private readonly webBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    config: ConfigService<Env, true>,
  ) {
    this.webBaseUrl = config.get('WEB_BASE_URL', { infer: true });
  }

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  /** Reserva dónde subir la foto obligatoria de la entrega (privada de la org). */
  async createPhotoTarget(filename: string): Promise<AdoptionDeliveryPhotoTarget> {
    const organizationId = this.requireOrgId();
    const target = await this.storage.createUploadTarget({
      organizationId,
      filename,
      visibility: 'private',
    });
    return { storageRef: target.key, uploadUrl: target.url };
  }

  /** Acta vigente (pendiente o confirmada) de un contrato, para la organización. */
  async getForContract(contractId: string): Promise<AdoptionDelivery | null> {
    const organizationId = this.requireOrgId();
    const row = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.adoptionDelivery.findFirst({
        where: { contractId, status: { not: 'cancelled' } },
        orderBy: { createdAt: 'desc' },
      }),
    );
    return row ? this.fromModel(row) : null;
  }

  /**
   * La organización registra la entrega: valida el contrato firmado y la foto,
   * arma la ficha del animal y el plan de hitos, y emite el código. Una entrega
   * pendiente anterior del mismo contrato se cancela (la nueva la reemplaza).
   */
  async start(
    actor: RequestUser,
    input: StartAdoptionDeliveryInput,
  ): Promise<AdoptionDeliveryCodeIssued> {
    const organizationId = this.requireOrgId();

    const photo = parseStorageKey(input.photoRef);
    if (!photo || photo.visibility !== 'private' || photo.organizationId !== organizationId) {
      throw new BadRequestException('La foto de la entrega no es válida.');
    }
    if (!(await this.storage.readObject(input.photoRef))) {
      throw new BadRequestException('Sube la foto del animal con su nuevo hogar.');
    }

    const id = randomUUID();
    const code = generateDeliveryCode();
    const details: AdoptionDeliveryDetails = {
      healthStatus: input.healthStatus,
      weightKg: input.weightKg,
      identityVerified: input.identityVerified,
      identificationChecked: input.identificationChecked,
      items: input.items,
      photoRef: input.photoRef,
    };

    const created = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const contract = await tx.adoptionContract.findUnique({ where: { id: input.contractId } });
      if (!contract || contract.organizationId !== organizationId) {
        throw new NotFoundException('Contrato no encontrado.');
      }
      if (contract.status !== 'signed') {
        throw new ConflictException('El contrato debe estar firmado para entregar el animal.');
      }
      const already = await tx.adoptionDelivery.findFirst({
        where: { contractId: contract.id, status: 'confirmed' },
        select: { id: true },
      });
      if (already) {
        throw new ConflictException('La entrega de este animal ya fue confirmada.');
      }

      const signers = contract.signers as unknown as AdoptionContractSigner[];
      const adopter = signers.find((s) => s.role === 'adopter');
      if (!adopter?.userId) {
        throw new ConflictException('El contrato no tiene un adoptante firmante válido.');
      }

      const payload = contract.payload as unknown as AdoptionContractPayload;
      const data = payload.data ?? { followUpMonths: 12 };

      const [org, animal, clinicalEvents, behaviorDisclosures] = await Promise.all([
        tx.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
        tx.animal.findUnique({
          where: { id: contract.animalId },
          include: { breed: { select: { name: true } } },
        }),
        tx.clinicalEvent.findMany({
          where: { animalId: contract.animalId },
          select: { eventId: true, version: true, type: true, occurredAt: true, nextDueDate: true },
        }),
        tx.animalBehaviorDisclosure.findMany({
          where: { animalId: contract.animalId },
          select: {
            reactivityNotes: true,
            biteHistory: true,
            biteHistoryDetail: true,
            childrenCompatibility: true,
            medicalConditionsRelevant: true,
            declaredAt: true,
          },
        }),
      ]);
      if (!animal) {
        throw new NotFoundException('El animal del contrato ya no existe.');
      }

      const record = buildAnimalRecord({
        organizationName: org?.name ?? payload.data?.organizationName ?? '',
        animal: {
          id: animal.id,
          name: animal.name,
          species: animal.species,
          sex: animal.sex,
          breed: animal.breed?.name ?? animal.customBreed ?? data.animalBreed ?? null,
          birthDate: animal.birthDate,
          approximateAgeMonths: animal.approximateAgeMonths,
        },
        contractData: data,
        clinicalEvents,
        behaviorDisclosures,
      });
      const milestonePlan = buildMilestonePlan(data);
      const contentHash = computeDeliveryHash({
        contractId: contract.id,
        details,
        record,
        milestonePlan,
      });

      await tx.adoptionDelivery.updateMany({
        where: { contractId: contract.id, status: 'pending_confirmation' },
        data: { status: 'cancelled', codeHash: null, codeExpiresAt: null },
      });

      const row = await tx.adoptionDelivery.create({
        data: {
          id,
          organizationId,
          contractId: contract.id,
          requestId: contract.requestId,
          animalId: contract.animalId,
          adopterUserId: adopter.userId,
          adopterName: adopter.fullName,
          adopterEmail: adopter.email,
          animalName: animal.name,
          details: details as unknown as Prisma.InputJsonValue,
          record: record as unknown as Prisma.InputJsonValue,
          milestonePlan: milestonePlan as unknown as Prisma.InputJsonValue,
          contentHash,
          codeHash: hashDeliveryCode(id, code),
          codeExpiresAt: this.codeExpiry(),
          createdByUserId: actor.id,
        },
      });

      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId: actor.id,
        action: 'adoption.delivery.started',
        entityType: 'adoption_delivery',
        entityId: row.id,
        metadata: {
          contractId: contract.id,
          items: details.items.length,
          milestones: milestonePlan.length,
        },
      });
      return row;
    });

    return this.issueCode(created, code, org(created));
  }

  /** Nuevo código (el anterior venció, se bloqueó o no llegó el correo). */
  async regenerateCode(actor: RequestUser, id: string): Promise<AdoptionDeliveryCodeIssued> {
    const organizationId = this.requireOrgId();
    const code = generateDeliveryCode();
    const updated = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const current = await tx.adoptionDelivery.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Entrega no encontrada.');
      if (current.status !== 'pending_confirmation') {
        throw new ConflictException('Esta entrega ya no está pendiente de confirmación.');
      }
      const row = await tx.adoptionDelivery.update({
        where: { id },
        data: {
          codeHash: hashDeliveryCode(id, code),
          codeExpiresAt: this.codeExpiry(),
          codeAttempts: 0,
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId: actor.id,
        action: 'adoption.delivery.code_regenerated',
        entityType: 'adoption_delivery',
        entityId: id,
        metadata: {},
      });
      return row;
    });
    return this.issueCode(updated, code, org(updated));
  }

  /** La organización cancela una entrega pendiente (no ocurrió). */
  async cancel(actor: RequestUser, id: string): Promise<AdoptionDelivery> {
    const organizationId = this.requireOrgId();
    const row = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const current = await tx.adoptionDelivery.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Entrega no encontrada.');
      if (current.status !== 'pending_confirmation') {
        throw new ConflictException('Solo se puede cancelar una entrega pendiente.');
      }
      const cancelled = await tx.adoptionDelivery.update({
        where: { id },
        data: { status: 'cancelled', codeHash: null, codeExpiresAt: null },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId: actor.id,
        action: 'adoption.delivery.cancelled',
        entityType: 'adoption_delivery',
        entityId: id,
        metadata: {},
      });
      return cancelled;
    });
    return this.fromModel(row);
  }

  /** Las entregas del adoptante (pendientes y confirmadas), por identidad. */
  async listMine(actor: RequestUser): Promise<AdoptionDelivery[]> {
    const rows = await this.prisma.$queryRaw<AdopterDeliveryRow[]>(Prisma.sql`
      SELECT * FROM adoption_deliveries_for_adopter(${actor.id}::uuid, NULL)
    `);
    return rows.map((r) => this.fromRow(r));
  }

  /** Una entrega del adoptante; 404 si no es suya (misma respuesta que inexistente). */
  async getMine(actor: RequestUser, id: string): Promise<AdoptionDelivery> {
    const row = await this.loadForAdopter(actor.id, id);
    if (!row) throw new NotFoundException('Entrega no encontrada.');
    return this.fromRow(row);
  }

  /** El adoptante confirma con el código: sella el acta en una sola operación. */
  async confirm(actor: RequestUser, id: string, code: string): Promise<AdoptionDelivery> {
    const rows = await this.prisma.$queryRaw<{ outcome: ConfirmOutcome }[]>(Prisma.sql`
      SELECT adoption_delivery_confirm(
        ${id}::uuid, ${actor.id}::uuid, ${hashDeliveryCode(id, code)}
      ) AS outcome
    `);
    const outcome = rows[0]?.outcome ?? 'not_found';
    switch (outcome) {
      case 'not_found':
        throw new NotFoundException('Entrega no encontrada.');
      case 'invalid_code':
        throw new BadRequestException({
          code: 'DELIVERY_CODE_INVALID',
          message: 'El código no coincide. Revísalo e inténtalo de nuevo.',
        });
      case 'expired':
        throw new HttpException(
          {
            code: 'DELIVERY_CODE_EXPIRED',
            message: 'El código venció. Pide a la organización uno nuevo.',
          },
          HttpStatus.GONE,
        );
      case 'locked':
        throw new HttpException(
          {
            code: 'DELIVERY_CODE_LOCKED',
            message: 'Demasiados intentos. Pide a la organización un código nuevo.',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      case 'already_confirmed':
        throw new ConflictException('Esta entrega ya fue confirmada.');
      case 'not_pending':
        throw new ConflictException('Esta entrega ya no está pendiente de confirmación.');
      case 'confirmed':
        break;
    }

    const row = await this.loadForAdopter(actor.id, id);
    if (!row) throw new NotFoundException('Entrega no encontrada.');
    await this.audit.record({
      organizationId: row.organization_id,
      actorUserId: actor.id,
      action: 'adoption.delivery.confirmed',
      entityType: 'adoption_delivery',
      entityId: id,
      metadata: {
        contractId: row.contract_id,
        contentHash: row.content_hash,
        animalStatus: 'adopted',
        milestonesPlanned: row.milestone_plan.length,
      },
    });
    return this.fromRow(row);
  }

  private codeExpiry(): Date {
    return new Date(Date.now() + ADOPTION_DELIVERY_CODE_TTL_MINUTES * 60_000);
  }

  private async loadForAdopter(userId: string, id: string): Promise<AdopterDeliveryRow | null> {
    const rows = await this.prisma.$queryRaw<AdopterDeliveryRow[]>(Prisma.sql`
      SELECT * FROM adoption_deliveries_for_adopter(${userId}::uuid, ${id}::uuid)
    `);
    return rows[0] ?? null;
  }

  /** Envía el código al adoptante (mejor esfuerzo) y lo devuelve una sola vez. */
  private async issueCode(
    row: DeliveryModel,
    code: string,
    organizationName: string,
  ): Promise<AdoptionDeliveryCodeIssued> {
    const confirmUrl = deliveryConfirmUrl(this.webBaseUrl, row.id, code);
    try {
      await this.notifications.send({
        to: row.adopterEmail,
        subject: `Confirma que recibiste a ${row.animalName}`,
        body:
          `Tu código para confirmar la entrega de ${row.animalName} es ${code}. ` +
          `Vence en ${ADOPTION_DELIVERY_CODE_TTL_MINUTES} minutos. Confírmala aquí: ${confirmUrl}`,
        template: {
          event: 'adoption.delivery_code',
          organizationName,
          data: {
            nombre: row.adopterName,
            animal: row.animalName,
            organizacion: organizationName,
            codigo: code,
            minutos: ADOPTION_DELIVERY_CODE_TTL_MINUTES,
            enlace: confirmUrl,
          },
        },
      });
    } catch (error) {
      // La organización igual ve el código y el QR en pantalla.
      this.logger.warn(`No se pudo enviar el código de entrega ${row.id}: ${String(error)}`);
    }
    return { delivery: this.fromModel(row), code, confirmUrl };
  }

  private fromModel(row: DeliveryModel): AdoptionDelivery {
    return {
      id: row.id,
      organizationId: row.organizationId,
      contractId: row.contractId,
      requestId: row.requestId,
      animalId: row.animalId,
      animalName: row.animalName,
      status: row.status as AdoptionDeliveryStatus,
      details: row.details as unknown as AdoptionDeliveryDetails,
      record: row.record as unknown as AdoptionAnimalRecord,
      milestonePlan: row.milestonePlan as unknown as AdoptionDeliveryMilestonePlanItem[],
      contentHash: row.contentHash,
      codeExpiresAt: row.codeExpiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      confirmedAt: row.confirmedAt?.toISOString() ?? null,
    };
  }

  private fromRow(row: AdopterDeliveryRow): AdoptionDelivery {
    return {
      id: row.id,
      organizationId: row.organization_id,
      contractId: row.contract_id,
      requestId: row.request_id,
      animalId: row.animal_id,
      animalName: row.animal_name,
      status: row.status as AdoptionDeliveryStatus,
      details: row.details,
      record: row.record,
      milestonePlan: row.milestone_plan,
      contentHash: row.content_hash,
      codeExpiresAt: row.code_expires_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      confirmedAt: row.confirmed_at?.toISOString() ?? null,
    };
  }
}

/** Nombre de la organización tal como quedó en la ficha sellada. */
function org(row: DeliveryModel): string {
  return (row.record as unknown as AdoptionAnimalRecord).organizationName;
}
