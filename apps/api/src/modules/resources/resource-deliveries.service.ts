import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ResourceDelivery as ResourceDeliveryRow } from '@prisma/client';
import {
  type CompleteResourceDeliveryInput,
  type ResourceDelivery,
  type ResourceDeliveriesPage,
  type ResourceDeliveryMethod,
  ResourceDeliveryStatus,
  type ResourceNeedStatus,
  type ScheduleResourceDeliveryInput,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { isUniqueConstraintViolation } from '../../core/errors/prisma-conflict.util';
import { canTransitionDelivery, deriveNeedStatus } from './resource-fulfillment';
import { clampLimit } from './resource-needs.service';
import { InboxService, type InboxNotice } from '../../core/notifications/inbox/inbox.service';

function toDelivery(row: ResourceDeliveryRow): ResourceDelivery {
  return {
    id: row.id,
    organizationId: row.organizationId,
    offerId: row.offerId,
    needId: row.needId,
    method: (row.method as ResourceDeliveryMethod | null) ?? undefined,
    scheduledAt: row.scheduledAt?.toISOString(),
    status: row.status as ResourceDeliveryStatus,
    completedAt: row.completedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * M09 — entregas. Siempre tenant-scoped (RLS): se crean por
 * `ResourceOffersService.decide` al aceptar una oferta, nunca directamente
 * aquí. `complete()` aplica la cantidad a la necesidad EXACTAMENTE una vez
 * (ledger `ResourceFulfillmentApplication`, atrapando la violación de
 * unicidad como señal de "ya aplicado") — corre dentro del contexto de
 * tenant de la propia acción autenticada, así que NO necesita una función
 * SECURITY DEFINER (a diferencia de `apply_donation_webhook`, disparado sin
 * contexto de tenant por el gateway).
 */
@Injectable()
export class ResourceDeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    private readonly inbox: InboxService,
  ) {}

  /**
   * Avisa a quien donó sobre su entrega (best-effort): busca la oferta, la
   * necesidad y la organización en el tenant y deja el aviso en su bandeja.
   */
  private async notifyDonor(
    organizationId: string,
    deliveryId: string,
    build: (ctx: { need: string; org: string }) => InboxNotice,
  ): Promise<void> {
    const found = await this.prisma
      .withOrgContext(organizationId, async (tx) => {
        const delivery = await tx.resourceDelivery.findUnique({
          where: { id: deliveryId },
          select: { needId: true, offer: { select: { donorUserId: true } } },
        });
        if (!delivery) return null;
        const need = await tx.resourceNeed.findUnique({
          where: { id: delivery.needId },
          select: { title: true },
        });
        return { donorUserId: delivery.offer.donorUserId, need: need?.title };
      })
      .catch(() => null);
    if (!found?.donorUserId) return;
    const org = await this.prisma.organization
      .findUnique({ where: { id: organizationId }, select: { name: true } })
      .catch(() => null);
    await this.inbox.toUser(
      found.donorUserId,
      build({ need: found.need ?? 'la necesidad', org: org?.name ?? 'La organización' }),
    );
  }

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  /** Página de las entregas de la organización, más recientes primero. */
  async list(limit: number, offset: number): Promise<ResourceDeliveriesPage> {
    const organizationId = this.requireOrgId();
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.resourceDelivery.findMany({
          where: { organizationId },
          orderBy: { createdAt: 'desc' },
          take,
          skip,
        }),
        tx.resourceDelivery.count({ where: { organizationId } }),
      ]);
      return { items: rows.map(toDelivery), total, limit: take, offset: skip };
    });
  }

  async get(id: string): Promise<ResourceDelivery> {
    const organizationId = this.requireOrgId();
    const row = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.resourceDelivery.findUnique({ where: { id } }),
    );
    if (!row || row.organizationId !== organizationId) {
      throw new NotFoundException('Resource delivery not found');
    }
    return toDelivery(row);
  }

  /** Fijar/actualizar método y fecha — solo mientras sigue `scheduled`. */
  async updateSchedule(
    actorUserId: string,
    id: string,
    input: ScheduleResourceDeliveryInput,
  ): Promise<ResourceDelivery> {
    const organizationId = this.requireOrgId();
    const result = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const existing = await tx.resourceDelivery.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException('Resource delivery not found');
      }
      if (existing.status !== ResourceDeliveryStatus.Scheduled) {
        throw new BadRequestException('Solo se puede editar mientras está programada.');
      }
      const updated = await tx.resourceDelivery.update({
        where: { id },
        data: {
          method: input.method,
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'resource_delivery.scheduled',
        entityType: 'resource_delivery',
        entityId: id,
        metadata: { fields: Object.keys(input) },
      });
      return toDelivery(updated);
    });
    const when = result.scheduledAt
      ? new Date(result.scheduledAt).toLocaleString('es-CO', {
          timeZone: 'America/Bogota',
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : null;
    await this.notifyDonor(organizationId, id, ({ need, org }) => ({
      kind: 'resources.delivery_scheduled',
      title: `${org} programó la entrega para "${need}"`,
      body: when
        ? `Fecha acordada: ${when} (hora Colombia).`
        : 'Revisa los detalles en "Mis ofertas".',
      href: '/mis-ofertas',
      // Una reprogramación es un aviso nuevo.
      dedupeKey: `resource_delivery_scheduled:${id}:${result.scheduledAt ?? ''}:${result.method ?? ''}`,
    }));
    return result;
  }

  /**
   * Cerrar la entrega. `actualQuantity` (si viene) es lo REALMENTE
   * entregado; si se omite, se usa lo que se había OFRECIDO. Aplica esa
   * cantidad a la necesidad exactamente una vez.
   */
  async complete(
    actorUserId: string,
    id: string,
    input: CompleteResourceDeliveryInput,
  ): Promise<ResourceDelivery> {
    const organizationId = this.requireOrgId();
    const result = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const existing = await tx.resourceDelivery.findUnique({
        where: { id },
        include: { offer: true },
      });
      if (!existing) {
        throw new NotFoundException('Resource delivery not found');
      }
      if (
        !canTransitionDelivery(
          existing.status as ResourceDeliveryStatus,
          ResourceDeliveryStatus.Completed,
        )
      ) {
        throw new BadRequestException('Esta entrega ya no se puede completar.');
      }

      const quantityApplied = input.actualQuantity ?? existing.offer.quantityOffered;
      const updated = await tx.resourceDelivery.update({
        where: { id },
        data: { status: ResourceDeliveryStatus.Completed, completedAt: new Date() },
      });

      let alreadyApplied = false;
      try {
        await tx.resourceFulfillmentApplication.create({
          data: { organizationId, deliveryId: id, needId: existing.needId, quantityApplied },
        });
      } catch (error) {
        if (!isUniqueConstraintViolation(error)) {
          throw error;
        }
        alreadyApplied = true; // carrera con otra solicitud — no reaplica
      }

      if (!alreadyApplied) {
        const need = await tx.resourceNeed.findUnique({ where: { id: existing.needId } });
        if (need) {
          const quantityFulfilled = need.quantityFulfilled + quantityApplied;
          await tx.resourceNeed.update({
            where: { id: need.id },
            data: {
              quantityFulfilled,
              status: deriveNeedStatus(
                quantityFulfilled,
                need.quantityNeeded,
                need.status as ResourceNeedStatus,
              ),
            },
          });
        }
      }

      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'resource_delivery.completed',
        entityType: 'resource_delivery',
        entityId: id,
        metadata: { needId: existing.needId, quantityApplied },
      });
      return toDelivery(updated);
    });
    await this.notifyDonor(organizationId, id, ({ need, org }) => ({
      kind: 'resources.delivery_completed',
      tone: 'kudos',
      title: `¡Gracias! ${org} recibió tu donación`,
      body: `Tu aporte para "${need}" ya está con los animales. Gestos así sostienen a los refugios.`,
      href: '/mis-ofertas',
      dedupeKey: `resource_delivery_completed:${id}`,
    }));
    return result;
  }

  /** Cancelar la entrega — solo mientras sigue `scheduled`. */
  async cancel(actorUserId: string, id: string): Promise<ResourceDelivery> {
    const organizationId = this.requireOrgId();
    const result = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const existing = await tx.resourceDelivery.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException('Resource delivery not found');
      }
      if (
        !canTransitionDelivery(
          existing.status as ResourceDeliveryStatus,
          ResourceDeliveryStatus.Cancelled,
        )
      ) {
        throw new BadRequestException('Esta entrega ya no se puede cancelar.');
      }
      const updated = await tx.resourceDelivery.update({
        where: { id },
        data: { status: ResourceDeliveryStatus.Cancelled },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'resource_delivery.cancelled',
        entityType: 'resource_delivery',
        entityId: id,
      });
      return toDelivery(updated);
    });
    await this.notifyDonor(organizationId, id, ({ need, org }) => ({
      kind: 'resources.delivery_cancelled',
      tone: 'warning',
      title: `${org} canceló la entrega para "${need}"`,
      body: 'Si crees que es un error, escríbele a la organización desde su portal.',
      href: '/mis-ofertas',
      dedupeKey: `resource_delivery_cancelled:${id}`,
    }));
    return result;
  }
}
