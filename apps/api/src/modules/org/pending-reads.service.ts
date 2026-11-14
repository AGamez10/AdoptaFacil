import { ForbiddenException, Injectable } from '@nestjs/common';
import { type PendingItemKey, type PendingItemRead, ReminderStatus } from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';

const REMINDER_PREFIX = 'reminder:';

/**
 * Campana de pendientes: qué avisos marcó como leídos la persona autenticada.
 * Los avisos se calculan en vivo (resumen de la org y recordatorios de salud);
 * aquí solo vive "ya lo vi", por persona y por organización (RLS por org y
 * filtro por usuario en cada consulta). Marcar como leído no cambia el
 * pendiente en sí (la solicitud sigue sin revisar, la vacuna sigue por poner):
 * solo lo saca del contador de esa persona. Por eso no se audita.
 */
@Injectable()
export class PendingReadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  async list(userId: string): Promise<PendingItemRead[]> {
    const organizationId = this.requireOrgId();
    const rows = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const reads = await tx.notificationRead.findMany({ where: { organizationId, userId } });
      // Poda: la marca de un recordatorio que ya se atendió o se borró no sirve.
      const reminderIds = reads
        .filter((r) => r.itemKey.startsWith(REMINDER_PREFIX))
        .map((r) => r.itemKey.slice(REMINDER_PREFIX.length));
      if (reminderIds.length === 0) return reads;
      const open = await tx.clinicalReminder.findMany({
        where: {
          organizationId,
          id: { in: reminderIds },
          status: { notIn: [ReminderStatus.Acknowledged, ReminderStatus.Dismissed] },
        },
        select: { id: true },
      });
      const keep = new Set(open.map((r) => `${REMINDER_PREFIX}${r.id}`));
      const stale = reads
        .filter((r) => r.itemKey.startsWith(REMINDER_PREFIX) && !keep.has(r.itemKey))
        .map((r) => r.itemKey);
      if (stale.length > 0) {
        await tx.notificationRead.deleteMany({
          where: { organizationId, userId, itemKey: { in: stale } },
        });
      }
      return reads.filter((r) => !stale.includes(r.itemKey));
    });
    return rows.map((r) => ({ key: r.itemKey as PendingItemKey, readAt: r.readAt.toISOString() }));
  }

  /** Marca (o vuelve a marcar, con la hora actual) los avisos como leídos. */
  async markRead(userId: string, keys: readonly string[]): Promise<PendingItemRead[]> {
    const organizationId = this.requireOrgId();
    const readAt = new Date();
    await this.prisma.withOrgContext(organizationId, async (tx) => {
      for (const itemKey of new Set(keys)) {
        await tx.notificationRead.upsert({
          where: { organizationId_userId_itemKey: { organizationId, userId, itemKey } },
          create: { organizationId, userId, itemKey, readAt },
          update: { readAt },
        });
      }
    });
    return this.list(userId);
  }
}
