import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  Role,
  type UserNotification,
  type UserNotificationTone,
  type UserNotificationsPage,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../auth/auth.types';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  NOTIFICATION_PORT,
  type NotificationMessage,
  type NotificationPort,
} from '../notification.port';

/** Lo que dice un aviso. `href` debe ser una ruta interna ("/mis-ofertas"). */
export interface InboxNotice {
  kind: string;
  tone?: UserNotificationTone;
  title: string;
  body?: string;
  href?: string;
  /**
   * Evita el mismo aviso dos veces a la misma persona (reintentos, doble
   * clic). Sin clave, cada llamada crea un aviso.
   */
  dedupeKey?: string;
}

/** Correo opcional que acompaña al aviso de UNA persona (sin `to`: lo pone la base). */
export type InboxEmail = (recipient: {
  email: string;
  displayName: string;
}) => Omit<NotificationMessage, 'to'> | null;

/** Quienes atienden lo operativo de una organización (bandeja de su equipo). */
export const ORG_OPERATIONS_ROLES: readonly Role[] = [
  Role.Owner,
  Role.Administrator,
  Role.Operator,
];

const MAX_LISTED = 30;
const SAFE_HREF = /^\/[^/]/;

function firstName(name: string | null | undefined): string | undefined {
  const first = name?.trim().split(/\s+/)[0];
  return first || undefined;
}

/**
 * Bandeja de avisos por persona (campana para TODAS las cuentas). Los módulos
 * llaman a `toUser` / `toOrgStaff` / `toOrgsInDepartment` después de un
 * cambio que le interesa a otra cuenta; las escrituras van por funciones
 * SECURITY DEFINER acotadas que resuelven el tenant del destinatario en la
 * base. Todo es best-effort: un aviso que falla nunca rompe la acción que lo
 * originó (se registra en el log sin datos personales).
 */
@Injectable()
export class InboxService {
  private readonly logger = new Logger('Inbox');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
  ) {}

  private clean(notice: InboxNotice): InboxNotice {
    return {
      ...notice,
      title: notice.title.trim().slice(0, 200) || 'Tienes un aviso nuevo',
      body: notice.body?.trim().slice(0, 600) || undefined,
      href: notice.href && SAFE_HREF.test(notice.href) ? notice.href.slice(0, 300) : undefined,
    };
  }

  /** Aviso a una persona (cualquier tenant) y, si se pide, también su correo. */
  async toUser(userId: string, notice: InboxNotice, email?: InboxEmail): Promise<void> {
    const n = this.clean(notice);
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{ email: string; display_name: string; inserted: boolean }>
      >(
        Prisma.sql`SELECT * FROM notify_user(${userId}::uuid, ${n.kind}::text, ${n.tone ?? 'info'}::text, ${n.title}::text, ${n.body ?? null}::text, ${n.href ?? null}::text, ${n.dedupeKey ?? null}::text)`,
      );
      const recipient = rows[0];
      // Sin persona o aviso repetido: no se vuelve a enviar el correo.
      if (!recipient || !recipient.inserted || !email || !recipient.email) return;
      const message = email({
        email: recipient.email,
        displayName: firstName(recipient.display_name) ?? 'amigo(a)',
      });
      if (message) await this.notifications.send({ ...message, to: recipient.email });
    } catch (error) {
      this.logger.warn(`No se pudo crear el aviso ${n.kind}: ${(error as Error).message}`);
    }
  }

  /** Aviso al equipo de una organización (por defecto quienes la operan). */
  async toOrgStaff(
    organizationId: string,
    notice: InboxNotice,
    options: { roles?: readonly Role[]; excludeUserId?: string } = {},
  ): Promise<number> {
    const n = this.clean(notice);
    const roles = [...(options.roles ?? ORG_OPERATIONS_ROLES)];
    try {
      const rows = await this.prisma.$queryRaw<Array<{ count: number }>>(
        Prisma.sql`SELECT notify_org_staff(${organizationId}::uuid, ${roles}::text[], ${n.kind}::text, ${n.tone ?? 'info'}::text, ${n.title}::text, ${n.body ?? null}::text, ${n.href ?? null}::text, ${n.dedupeKey ?? null}::text, ${options.excludeUserId ?? null}::uuid) AS count`,
      );
      return Number(rows[0]?.count ?? 0);
    } catch (error) {
      this.logger.warn(`No se pudo avisar al equipo (${n.kind}): ${(error as Error).message}`);
      return 0;
    }
  }

  /** Aviso a los equipos de las organizaciones aprobadas de un departamento. */
  async toOrgsInDepartment(
    department: string,
    excludeOrganizationId: string,
    notice: InboxNotice,
  ): Promise<number> {
    const n = this.clean(notice);
    const roles = [...ORG_OPERATIONS_ROLES];
    try {
      const rows = await this.prisma.$queryRaw<Array<{ count: number }>>(
        Prisma.sql`SELECT notify_orgs_in_department(${department}::text, ${excludeOrganizationId}::uuid, ${roles}::text[], ${n.kind}::text, ${n.tone ?? 'info'}::text, ${n.title}::text, ${n.body ?? null}::text, ${n.href ?? null}::text, ${n.dedupeKey ?? null}::text) AS count`,
      );
      return Number(rows[0]?.count ?? 0);
    } catch (error) {
      this.logger.warn(
        `No se pudo avisar a las organizaciones (${n.kind}): ${(error as Error).message}`,
      );
      return 0;
    }
  }

  /** Los avisos propios, más recientes primero, y cuántos sin leer. */
  async list(actor: RequestUser): Promise<UserNotificationsPage> {
    return this.prisma.withOrgContext(actor.organizationId, async (tx) => {
      const [rows, unread] = await Promise.all([
        tx.userNotification.findMany({
          where: { userId: actor.id },
          orderBy: { createdAt: 'desc' },
          take: MAX_LISTED,
        }),
        tx.userNotification.count({ where: { userId: actor.id, readAt: null } }),
      ]);
      return {
        items: rows.map((row): UserNotification => ({
          id: row.id,
          kind: row.kind,
          tone: row.tone as UserNotificationTone,
          title: row.title,
          body: row.body ?? undefined,
          href: row.href ?? undefined,
          read: row.readAt !== null,
          createdAt: row.createdAt.toISOString(),
        })),
        unread,
      };
    });
  }

  /** Marca como leídos los avisos indicados (o todos) de la persona. */
  async markRead(actor: RequestUser, input: { ids?: string[]; all?: boolean }): Promise<number> {
    if (!input.all && !input.ids?.length) return 0;
    return this.prisma.withOrgContext(actor.organizationId, async (tx) => {
      const result = await tx.userNotification.updateMany({
        where: {
          userId: actor.id,
          readAt: null,
          ...(input.all ? {} : { id: { in: input.ids } }),
        },
        data: { readAt: new Date() },
      });
      return result.count;
    });
  }
}
