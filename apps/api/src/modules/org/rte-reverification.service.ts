import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import {
  DocumentType,
  FormalizationState,
  Role,
  rteReminderStage,
  rteValidUntilFrom,
  type RteReminderStage,
} from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import { AuditService } from '../../core/audit/audit.service';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../../core/notifications/notification.port';
import { PrismaService } from '../../prisma/prisma.service';

const colombiaDate = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** Asunto y cuerpo del aviso de reverificación del RTE. Puro. */
export function rteReminderMessage(
  stage: RteReminderStage | 'expired',
  organizationName: string,
  validUntil: Date,
  uploadUrl: string,
): { subject: string; body: string } {
  const date = colombiaDate.format(validUntil);
  const keep =
    'No se borra nada: tus donaciones, comprobantes y certificados ya emitidos siguen ahí. Solo cambia lo que se emite desde ahora.';
  if (stage === 'expired') {
    return {
      subject: 'Tu RTE venció: pausamos los certificados con beneficio tributario',
      body: `Hola, equipo de ${organizationName}:\n\nEl Régimen Tributario Especial que reconocimos para tu organización venció el ${date} y no hemos recibido un RUT actualizado. Desde hoy tus donantes reciben el comprobante sin beneficio tributario en lugar del certificado.\n\nPara reactivarlo, sube tu RUT reciente con la responsabilidad 04 en ${uploadUrl}. Apenas el equipo lo apruebe, vuelves a emitir certificados.\n\n${keep}`,
    };
  }
  return {
    subject: `Tu RTE vence el ${date}: sube tu RUT actualizado`,
    body: `Hola, equipo de ${organizationName}:\n\nCada año la DIAN pide actualizar el registro en el Régimen Tributario Especial. El RTE que reconocimos para tu organización vale hasta el ${date} (faltan unos ${stage} días).\n\nCuando hagas la actualización, descarga tu RUT reciente con la responsabilidad 04 y súbelo en ${uploadUrl}. Si no lo recibimos antes de esa fecha, pausamos solo los certificados de donación con beneficio tributario hasta que lo apruebe el equipo.\n\n${keep}`,
  };
}

/**
 * Reverificación anual del RTE. Una ESAL con RTE reconocida vale hasta el
 * próximo plazo anual de la DIAN (`rteValidUntilFrom`). Cada día:
 * - a 60 y a 30 días del vencimiento, avisa a los Owners que suban su RUT nuevo;
 * - vencido sin RUT nuevo aprobado, pone `rteVigente = false`: la organización
 *   sigue como ESAL con RTE en su historial, pero el servidor deja de emitir
 *   certificados con beneficio tributario (donation-certificates exige
 *   `rteVigente`) y la matriz la trata como ESAL. No se borra nada.
 * Aprobar un RUT nuevo (revisión de plataforma) renueva el RTE hasta el
 * siguiente plazo: {@link renewOnApprovedRut}.
 */
@Injectable()
export class RteReverificationService {
  private readonly logger = new Logger('RteReverification');
  private readonly uploadUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
    config: ConfigService<Env, true>,
  ) {
    const web = String(config.get('WEB_BASE_URL', { infer: true }) ?? '').replace(/\/+$/, '');
    this.uploadUrl = `${web}/organizacion/documentos?subir=${DocumentType.Rut}`;
  }

  /**
   * Un RUT aprobado de una organización en ESAL con RTE la reverifica: vuelve a
   * `rteVigente = true` hasta el siguiente plazo anual. El revisor ya vio la
   * responsabilidad 04 en el informe de verificación del documento. Corre
   * dentro del contexto de la organización del documento.
   */
  async renewOnApprovedRut(
    tx: Prisma.TransactionClient,
    organizationId: string,
    documentId: string,
    reviewerUserId: string,
    now = new Date(),
  ): Promise<boolean> {
    const profile = await tx.organizationProfile.findUnique({
      where: { organizationId },
      select: { formalizationState: true, rteVigente: true, rteValidUntil: true },
    });
    if (profile?.formalizationState !== FormalizationState.ESAL_RTE) return false;
    const rteValidUntil = rteValidUntilFrom(now);
    await tx.organizationProfile.update({
      where: { organizationId },
      data: { rteVigente: true, rteValidUntil },
    });
    await this.audit.recordWithTx(tx, {
      organizationId,
      actorUserId: reviewerUserId,
      action: 'formalization.rte_reverified',
      entityType: 'organization_profile',
      entityId: organizationId,
      metadata: {
        evidenceDocumentId: documentId,
        previousValidUntil: profile.rteValidUntil?.toISOString() ?? null,
        wasVigente: profile.rteVigente,
        validUntil: rteValidUntil.toISOString(),
      },
    });
    return true;
  }

  /** Escaneo diario. Devuelve cuántos correos encoló y cuántas venció. */
  async scan(now = new Date()): Promise<{ reminders: number; expired: number }> {
    const orgs = await this.prisma.organization.findMany({ select: { id: true, name: true } });
    const total = { reminders: 0, expired: 0 };
    for (const org of orgs) {
      try {
        const result = await this.scanOrganization(org.id, org.name, now);
        total.reminders += result.reminders;
        total.expired += result.expired ? 1 : 0;
      } catch (error) {
        this.logger.warn(`RTE check skipped for an organization: ${(error as Error).message}`);
      }
    }
    return total;
  }

  private async scanOrganization(
    organizationId: string,
    organizationName: string,
    now: Date,
  ): Promise<{ reminders: number; expired: boolean }> {
    const found = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const profile = await tx.organizationProfile.findUnique({
        where: { organizationId },
        select: { formalizationState: true, rteVigente: true, rteValidUntil: true },
      });
      const validUntil = profile?.rteValidUntil;
      if (
        profile?.formalizationState !== FormalizationState.ESAL_RTE ||
        !profile.rteVigente ||
        !validUntil
      ) {
        return null;
      }
      const expired = now.getTime() > validUntil.getTime();
      const stage = expired ? null : rteReminderStage(validUntil, now);
      if (!expired && !stage) return null;
      if (expired) {
        await tx.organizationProfile.update({
          where: { organizationId },
          data: { rteVigente: false },
        });
        await this.audit.recordWithTx(tx, {
          organizationId,
          actorUserId: null,
          action: 'formalization.rte_expired',
          entityType: 'organization_profile',
          entityId: organizationId,
          metadata: { validUntil: validUntil.toISOString() },
        });
      }
      const owners = await tx.userRole.findMany({
        where: { organizationId, role: Role.Owner },
        select: { userId: true },
      });
      const users = await tx.user.findMany({
        where: { id: { in: owners.map((o) => o.userId) } },
        select: { email: true },
      });
      return {
        validUntil,
        stage: expired ? ('expired' as const) : (stage as RteReminderStage),
        emails: users.map((u) => u.email).filter(Boolean),
      };
    });
    if (!found) return { reminders: 0, expired: false };
    const { subject, body } = rteReminderMessage(
      found.stage,
      organizationName,
      found.validUntil,
      this.uploadUrl,
    );
    const day = found.validUntil.toISOString().slice(0, 10);
    for (const to of found.emails) {
      await this.notifications.send({
        to,
        subject,
        body,
        // Un aviso por etapa y por vencimiento: correr el escaneo cada día no repite.
        idempotencyKey: `rte.reminder:${organizationId}:${found.stage}:${day}:${to}`,
      });
    }
    return { reminders: found.emails.length, expired: found.stage === 'expired' };
  }
}
