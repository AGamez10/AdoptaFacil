import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import webpush from 'web-push';
import type { Env } from '../../../config/env.validation';
import type { RequestUser } from '../../auth/auth.types';
import { PrismaService } from '../../../prisma/prisma.service';

/** Lo que muestra el aviso en el dispositivo. `href` es una ruta interna. */
export interface WebPushPayload {
  title: string;
  body?: string;
  href?: string;
  /** Agrupa avisos del mismo tipo en el dispositivo. */
  tag?: string;
}

export interface WebPushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}

interface EndpointRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Vida del aviso en el servicio de push si el dispositivo no está conectado (1 día). */
const TTL_SECONDS = 24 * 60 * 60;
/** El servicio de push responde 404 o 410 cuando la suscripción ya no existe. */
const DEAD_STATUS = new Set([404, 410]);

/**
 * Notificaciones push web (VAPID). Envía el mismo aviso de la bandeja al
 * navegador o a la app instalada de la persona. Todo es best-effort: un envío
 * que falla nunca rompe la acción que lo originó. Sin claves VAPID el servicio
 * queda apagado (no hace nada y no falla).
 */
@Injectable()
export class WebPushService {
  private readonly logger = new Logger('WebPush');
  private readonly publicKey: string | null;
  private readonly enabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    const publicKey = config.get('VAPID_PUBLIC_KEY', { infer: true }) ?? null;
    const privateKey = config.get('VAPID_PRIVATE_KEY', { infer: true }) ?? null;
    const subject = config.get('VAPID_SUBJECT', { infer: true });
    this.publicKey = publicKey;
    this.enabled = Boolean(publicKey && privateKey);
    if (this.enabled && publicKey && privateKey) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
    } else {
      this.logger.log('Push web apagado: falta VAPID_PUBLIC_KEY o VAPID_PRIVATE_KEY.');
    }
  }

  /** Clave pública para que el navegador se suscriba; `null` si el push está apagado. */
  publicKeyOrNull(): string | null {
    return this.enabled ? this.publicKey : null;
  }

  /** Guarda (o actualiza) la suscripción de un dispositivo de la persona. */
  async subscribe(actor: RequestUser, input: WebPushSubscriptionInput): Promise<void> {
    await this.prisma.withOrgContext(actor.organizationId, async (tx) => {
      // Un mismo navegador puede haber estado con otra persona: se reemplaza.
      await tx.pushSubscription.deleteMany({ where: { endpoint: input.endpoint } });
      await tx.pushSubscription.create({
        data: {
          organizationId: actor.organizationId,
          userId: actor.id,
          endpoint: input.endpoint,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          userAgent: input.userAgent?.slice(0, 300) ?? null,
        },
      });
    });
  }

  /** Quita la suscripción de este dispositivo (al desactivar el aviso). */
  async unsubscribe(actor: RequestUser, endpoint: string): Promise<number> {
    return this.prisma.withOrgContext(actor.organizationId, async (tx) => {
      const result = await tx.pushSubscription.deleteMany({
        where: { endpoint, userId: actor.id },
      });
      return result.count;
    });
  }

  /** Avisa a todos los dispositivos de UNA persona. */
  async sendToUser(userId: string, payload: WebPushPayload): Promise<void> {
    if (!this.enabled) return;
    try {
      const rows = await this.prisma.$queryRaw<EndpointRow[]>(
        Prisma.sql`SELECT * FROM push_subscriptions_for_user(${userId}::uuid)`,
      );
      await this.deliver(rows, payload);
    } catch (error) {
      this.logger.warn(`No se pudo enviar el push a una persona: ${(error as Error).message}`);
    }
  }

  /** Avisa a los dispositivos del equipo de una organización con esos roles. */
  async sendToOrgStaff(
    organizationId: string,
    roles: readonly string[],
    excludeUserId: string | undefined,
    payload: WebPushPayload,
  ): Promise<void> {
    if (!this.enabled) return;
    try {
      const rows = await this.prisma.$queryRaw<EndpointRow[]>(
        Prisma.sql`SELECT * FROM push_subscriptions_for_org_staff(${organizationId}::uuid, ${[...roles]}::text[], ${excludeUserId ?? null}::uuid)`,
      );
      await this.deliver(rows, payload);
    } catch (error) {
      this.logger.warn(`No se pudo enviar el push al equipo: ${(error as Error).message}`);
    }
  }

  private async deliver(rows: EndpointRow[], payload: WebPushPayload): Promise<void> {
    if (rows.length === 0) return;
    const message = JSON.stringify({
      title: payload.title.slice(0, 200),
      body: payload.body?.slice(0, 300),
      href: payload.href && /^\/[^/]/.test(payload.href) ? payload.href.slice(0, 300) : '/',
      tag: payload.tag?.slice(0, 80),
    });
    await Promise.allSettled(
      rows.map(async (row) => {
        try {
          await webpush.sendNotification(
            { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
            message,
            { TTL: TTL_SECONDS },
          );
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status && DEAD_STATUS.has(status)) {
            await this.prisma.$queryRaw(
              Prisma.sql`SELECT push_remove_dead_endpoint(${row.endpoint}::text)`,
            );
          } else {
            this.logger.warn(`Push no entregado (HTTP ${status ?? 'sin respuesta'}).`);
          }
        }
      }),
    );
  }
}
