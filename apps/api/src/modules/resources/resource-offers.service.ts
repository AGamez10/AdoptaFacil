import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type ResourceOffer as ResourceOfferModel } from '@prisma/client';
import {
  type CreateResourceOfferInput,
  type DecideResourceOfferInput,
  type ResourceOffer,
  type ResourceOfferProofStatus,
  ResourceOfferStatus,
  type ResourceOfferWithNeed,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import type { RequestUser } from '../../core/auth/auth.types';
import { canDecideOffer } from './resource-fulfillment';
import { InboxService } from '../../core/notifications/inbox/inbox.service';

/** Raw JSONB item emitted by `resource_offers_for_donor` (already enriched). */
interface RawOfferWithNeed {
  id: string;
  organizationId: string;
  organizationName: string;
  needId: string;
  needTitle: string;
  needUnit: string;
  donorUserId: string;
  quantityOffered: number;
  message: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  deliveryStatus: string | null;
  deliveryScheduledAt: string | null;
  deliveryCompletedAt: string | null;
  proofStatus: string | null;
  proofValidatedAt: string | null;
  proofValidationReason: string | null;
  proofCount: number | null;
}

function toOfferWithNeed(raw: RawOfferWithNeed): ResourceOfferWithNeed {
  return {
    id: raw.id,
    organizationId: raw.organizationId,
    organizationName: raw.organizationName,
    needId: raw.needId,
    needTitle: raw.needTitle,
    needUnit: raw.needUnit,
    donorUserId: raw.donorUserId,
    quantityOffered: raw.quantityOffered,
    message: raw.message ?? undefined,
    status: raw.status as ResourceOfferStatus,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    deliveryStatus: (raw.deliveryStatus as ResourceOfferWithNeed['deliveryStatus']) ?? undefined,
    deliveryScheduledAt: raw.deliveryScheduledAt ?? undefined,
    deliveryCompletedAt: raw.deliveryCompletedAt ?? undefined,
    proofStatus: (raw.proofStatus as ResourceOfferProofStatus | null) ?? undefined,
    proofValidatedAt: raw.proofValidatedAt ?? undefined,
    proofValidationReason: raw.proofValidationReason ?? undefined,
    proofCount: Number(raw.proofCount ?? 0),
  };
}

/** Row shape returned by `create_resource_offer`/`cancel_resource_offer`
 *  (raw SQL — snake_case; NOT the Prisma Client's camelCase model). */
interface ResourceOfferSqlRow {
  id: string;
  organization_id: string;
  need_id: string;
  donor_user_id: string;
  quantity_offered: number;
  message: string | null;
  status: string;
  proof_status: string | null;
  proof_validated_by_user_id: string | null;
  proof_validated_at: Date | null;
  proof_validation_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

function fromSqlRow(row: ResourceOfferSqlRow): ResourceOffer {
  return {
    id: row.id,
    organizationId: row.organization_id,
    needId: row.need_id,
    donorUserId: row.donor_user_id,
    quantityOffered: row.quantity_offered,
    message: row.message ?? undefined,
    status: row.status as ResourceOfferStatus,
    proofStatus: (row.proof_status as ResourceOfferProofStatus | null) ?? undefined,
    proofValidatedByUserId: row.proof_validated_by_user_id ?? undefined,
    proofValidatedAt: row.proof_validated_at?.toISOString(),
    proofValidationReason: row.proof_validation_reason ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Row shape returned by the Prisma Client (camelCase) — `listReceived`/`decide`. */
function toOffer(row: ResourceOfferModel): ResourceOffer {
  return {
    id: row.id,
    organizationId: row.organizationId,
    needId: row.needId,
    donorUserId: row.donorUserId,
    quantityOffered: row.quantityOffered,
    message: row.message ?? undefined,
    status: row.status as ResourceOfferStatus,
    proofStatus: (row.proofStatus as ResourceOfferProofStatus | null) ?? undefined,
    proofValidatedByUserId: row.proofValidatedByUserId ?? undefined,
    proofValidatedAt: row.proofValidatedAt?.toISOString(),
    proofValidationReason: row.proofValidationReason ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * M09 — ofertas de donación física. Creación y "mis ofertas" son CROSS-TENANT
 * por identidad (el donante no es miembro de la organización beneficiaria),
 * mismo patrón que M05 `Donation`: funciones SECURITY DEFINER acotadas, nunca
 * una vía que evada RLS de forma general. Decidir (aceptar/rechazar) es una
 * acción de la ORGANIZACIÓN sobre SU PROPIO tenant — RLS normal.
 */
@Injectable()
export class ResourceOffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    private readonly inbox: InboxService,
  ) {}

  /** Título de una necesidad (para el texto de los avisos). */
  private async needTitle(organizationId: string, needId: string): Promise<string> {
    const need = await this.prisma
      .withOrgContext(organizationId, (tx) =>
        tx.resourceNeed.findUnique({ where: { id: needId }, select: { title: true } }),
      )
      .catch(() => null);
    return need?.title ?? 'tu necesidad';
  }

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  /** Ofrecer cubrir una necesidad (cualquier autenticado). */
  async create(actor: RequestUser, input: CreateResourceOfferInput): Promise<ResourceOffer> {
    const rows = await this.prisma.$queryRaw<ResourceOfferSqlRow[]>(Prisma.sql`
      SELECT * FROM create_resource_offer(
        ${input.needId}::uuid, ${actor.id}::uuid, ${input.quantityOffered}::int, ${input.message ?? null}
      )
    `);
    const row = rows[0];
    if (!row) {
      throw new BadRequestException(
        'La necesidad no existe o ya no acepta ofertas (cubierta o cancelada).',
      );
    }
    await this.audit.record({
      organizationId: row.organization_id,
      actorUserId: actor.id,
      action: 'resource_offer.created',
      entityType: 'resource_offer',
      entityId: row.id,
      metadata: { needId: input.needId, quantityOffered: input.quantityOffered },
    });
    const title = await this.needTitle(row.organization_id, row.need_id);
    await this.inbox.toOrgStaff(row.organization_id, {
      kind: 'resources.offer_received',
      title: `Nueva oferta para "${title}"`,
      body: `Alguien ofrece ${input.quantityOffered} para cubrir esta necesidad. Revísala y acéptala o recházala.`,
      href: `/organizacion/recursos/${row.need_id}`,
      dedupeKey: `resource_offer:${row.id}`,
    });
    await this.inbox.toUser(actor.id, {
      kind: 'resources.offer_sent',
      tone: 'kudos',
      title: '¡Gracias! Tu oferta llegó a la organización',
      body: `Ofreciste ${input.quantityOffered} para "${title}". Te avisamos cuando la acepten.`,
      href: '/mis-ofertas',
      dedupeKey: `resource_offer_sent:${row.id}`,
    });
    return fromSqlRow(row);
  }

  /** Ofertas RECIBIDAS por la organización (sus propias necesidades). */
  async listReceived(): Promise<ResourceOffer[]> {
    const organizationId = this.requireOrgId();
    const rows = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.resourceOffer.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } }),
    );
    return rows.map(toOffer);
  }

  /** Las ofertas del DONANTE (cross-tenant, por identidad), enriquecidas. */
  async listMine(actor: RequestUser): Promise<ResourceOfferWithNeed[]> {
    const rows = await this.prisma.$queryRaw<Array<{ data: RawOfferWithNeed[] }>>(
      Prisma.sql`SELECT resource_offers_for_donor(${actor.id}::uuid) AS data`,
    );
    const items = rows[0]?.data ?? [];
    return items.map(toOfferWithNeed);
  }

  /**
   * La organización acepta o rechaza una oferta `offered` sobre SU necesidad.
   * Al aceptar, crea la entrega (`scheduled`) en la MISMA transacción — no
   * hace falta un paso separado, la organización siempre coordina la entrega
   * después de aceptar. Auditado.
   */
  async decide(
    actorUserId: string,
    offerId: string,
    input: DecideResourceOfferInput,
  ): Promise<ResourceOffer> {
    const organizationId = this.requireOrgId();
    const decided = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const existing = await tx.resourceOffer.findUnique({ where: { id: offerId } });
      if (!existing) {
        throw new NotFoundException('Resource offer not found');
      }
      if (!canDecideOffer(existing.status as ResourceOfferStatus)) {
        throw new BadRequestException('Esta oferta ya fue decidida.');
      }

      const newStatus =
        input.decision === 'accept' ? ResourceOfferStatus.Accepted : ResourceOfferStatus.Declined;
      const updated = await tx.resourceOffer.update({
        where: { id: offerId },
        data: { status: newStatus },
      });

      if (input.decision === 'accept') {
        await tx.resourceDelivery.create({
          data: {
            organizationId,
            offerId,
            needId: existing.needId,
          },
        });
      }

      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: input.decision === 'accept' ? 'resource_offer.accepted' : 'resource_offer.declined',
        entityType: 'resource_offer',
        entityId: offerId,
        metadata: { needId: existing.needId },
      });
      return updated;
    });
    const [title, org] = await Promise.all([
      this.needTitle(organizationId, decided.needId),
      this.prisma.organization
        .findUnique({ where: { id: organizationId }, select: { name: true } })
        .catch(() => null),
    ]);
    const orgName = org?.name ?? 'La organización';
    const accepted = input.decision === 'accept';
    await this.inbox.toUser(decided.donorUserId, {
      kind: accepted ? 'resources.offer_accepted' : 'resources.offer_declined',
      tone: accepted ? 'success' : 'info',
      title: accepted
        ? `${orgName} aceptó tu oferta para "${title}"`
        : `${orgName} no pudo aceptar tu oferta para "${title}"`,
      body: accepted
        ? 'Coordinarán contigo la entrega. Mira el estado en "Mis ofertas".'
        : 'Gracias por ofrecer. Puede que ya esté cubierta: mira otras necesidades del banco.',
      href: accepted ? '/mis-ofertas' : '/recursos',
      dedupeKey: `resource_offer_decided:${offerId}`,
    });
    return toOffer(decided);
  }

  /** El donante cancela SU PROPIA oferta, solo mientras siga `offered`. */
  async cancel(actor: RequestUser, offerId: string): Promise<ResourceOffer> {
    const rows = await this.prisma.$queryRaw<ResourceOfferSqlRow[]>(
      Prisma.sql`SELECT * FROM cancel_resource_offer(${offerId}::uuid, ${actor.id}::uuid)`,
    );
    const row = rows[0];
    if (!row) {
      throw new NotFoundException('Oferta no encontrada, no es tuya, o ya no se puede cancelar.');
    }
    await this.audit.record({
      organizationId: row.organization_id,
      actorUserId: actor.id,
      action: 'resource_offer.cancelled',
      entityType: 'resource_offer',
      entityId: row.id,
      metadata: { needId: row.need_id },
    });
    const title = await this.needTitle(row.organization_id, row.need_id);
    await this.inbox.toOrgStaff(row.organization_id, {
      kind: 'resources.offer_cancelled',
      tone: 'warning',
      title: `Una oferta para "${title}" fue retirada`,
      body: 'Quien la ofreció la canceló antes de que la decidieran.',
      href: `/organizacion/recursos/${row.need_id}`,
      dedupeKey: `resource_offer_cancelled:${row.id}`,
    });
    return fromSqlRow(row);
  }
}
