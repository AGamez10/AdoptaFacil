import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import {
  getLegalDocument,
  LEGAL_DOCUMENTS,
  type LegalAcceptanceChannel,
  type LegalAcceptanceItem,
  type LegalAcceptanceRecord,
  type LegalDocumentKey,
  type LegalStatus,
  optionalLegalDocuments,
  requiredLegalDocuments,
} from '@adoptafacil/contracts';
import { AuditService } from '../audit/audit.service';
import { NOTIFICATION_PORT, type NotificationPort } from '../notifications/notification.port';
import { PrismaService } from '../../prisma/prisma.service';
import type { Env } from '../../config/env.validation';
import type { RequestUser } from '../auth/auth.types';

/** IP y navegador desde los que se acepta (prueba de la autorización). */
export interface LegalRequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** A quién pertenece la aceptación: una cuenta o una donación de invitado. */
export type LegalSubject =
  { type: 'user'; userId: string } | { type: 'donation'; donationId: string };

const KNOWN_KEYS = new Set<string>(LEGAL_DOCUMENTS.map((d) => d.key));
const MAX_USER_AGENT = 500;

/**
 * Aceptación versionada de los documentos legales (términos, política y
 * autorización de datos, condiciones para organizaciones, autorización
 * comercial opcional). Cada aceptación es una fila append-only con la versión
 * y el SHA-256 exactos del texto, la fecha UTC, la IP, el navegador y el canal:
 * la prueba de la autorización que exige la Ley 1581 (art. 17 lit. b). Una
 * revocación es otra fila, nunca una edición.
 */
@Injectable()
export class LegalService {
  private readonly logger = new Logger(LegalService.name);
  private readonly webBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
    config: ConfigService<Env, true>,
  ) {
    this.webBaseUrl = config.get('WEB_BASE_URL', { infer: true });
  }

  /**
   * Valida que `items` traiga TODOS los documentos de `required` y que cada
   * documento enviado sea conocido, no informativo y esté en su versión
   * vigente. Devuelve la lista sin duplicados. 400 con mensaje claro si no.
   */
  assertAcceptances(
    items: readonly LegalAcceptanceItem[] | undefined,
    required: readonly LegalDocumentKey[],
  ): LegalAcceptanceItem[] {
    const byKey = new Map<LegalDocumentKey, LegalAcceptanceItem>();
    for (const item of items ?? []) {
      if (!KNOWN_KEYS.has(item.key)) {
        throw new BadRequestException(`Documento legal desconocido: ${item.key}`);
      }
      const doc = getLegalDocument(item.key);
      if (doc.acceptance === 'informative') {
        throw new BadRequestException(`El documento ${item.key} es informativo y no se acepta.`);
      }
      if (item.version !== doc.version) {
        throw new BadRequestException({
          message: 'La versión aceptada ya no está vigente. Recarga la página y acepta la nueva.',
          code: 'LEGAL_VERSION_OUTDATED',
          document: item.key,
        });
      }
      byKey.set(item.key, item);
    }
    const missing = required.filter((key) => !byKey.has(key));
    if (missing.length > 0) {
      throw new BadRequestException({
        message: 'Debes aceptar los términos y autorizar el tratamiento de datos para continuar.',
        code: 'LEGAL_ACCEPTANCE_REQUIRED',
        missing,
      });
    }
    return [...byKey.values()];
  }

  /** Inserta las filas de aceptación (o revocación) dentro de una transacción
   *  ya fijada en el tenant `organizationId`, junto con su evento de auditoría. */
  async recordWithTx(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      actorUserId: string | null;
      subject: LegalSubject;
      items: readonly LegalAcceptanceItem[];
      channel: LegalAcceptanceChannel;
      action?: 'accepted' | 'revoked';
      context?: LegalRequestContext;
    },
  ): Promise<void> {
    if (input.items.length === 0) return;
    const action = input.action ?? 'accepted';
    const subjectId =
      input.subject.type === 'user' ? input.subject.userId : input.subject.donationId;
    await tx.legalAcceptance.createMany({
      data: input.items.map((item) => ({
        organizationId: input.organizationId,
        userId: input.subject.type === 'user' ? input.subject.userId : null,
        subjectType: input.subject.type,
        subjectId,
        documentKey: item.key,
        documentVersion: item.version,
        documentSha256: getLegalDocument(item.key).sha256,
        action,
        channel: input.channel,
        ipAddress: input.context?.ipAddress ?? null,
        userAgent: input.context?.userAgent?.slice(0, MAX_USER_AGENT) ?? null,
      })),
    });
    await this.audit.recordWithTx(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: action === 'accepted' ? 'legal.accepted' : 'legal.revoked',
      entityType: input.subject.type,
      entityId: subjectId,
      // Solo documento/versión/canal: la IP y el navegador quedan en la fila
      // de aceptación, nunca en la auditoría.
      metadata: {
        channel: input.channel,
        documents: input.items.map((i) => `${i.key}@${i.version}`),
      },
    });
  }

  async getStatus(user: RequestUser): Promise<LegalStatus> {
    const rows = await this.prisma.withOrgContext(user.organizationId, (tx) =>
      tx.legalAcceptance.findMany({
        where: { subjectType: 'user', subjectId: user.id },
        orderBy: { createdAt: 'desc' },
        select: {
          documentKey: true,
          documentVersion: true,
          action: true,
          channel: true,
          createdAt: true,
        },
      }),
    );
    const history: LegalAcceptanceRecord[] = rows.map((r) => ({
      key: r.documentKey as LegalDocumentKey,
      version: r.documentVersion,
      action: r.action as LegalAcceptanceRecord['action'],
      channel: r.channel as LegalAcceptanceChannel,
      createdAt: r.createdAt.toISOString(),
    }));
    // El registro más reciente de cada documento EN SU VERSIÓN VIGENTE decide.
    const latestCurrent = (key: LegalDocumentKey) =>
      history.find((h) => h.key === key && h.version === getLegalDocument(key).version);
    const pending = requiredLegalDocuments(user.accountType).filter(
      (key) => latestCurrent(key)?.action !== 'accepted',
    );
    return {
      pending,
      commercialAuthorized: latestCurrent('commercial_authorization')?.action === 'accepted',
      aiTrainingAuthorized: latestCurrent('ai_training_authorization')?.action === 'accepted',
      history,
    };
  }

  /** Acepta documentos desde una sesión (re-aceptación o preferencias). */
  async accept(
    user: RequestUser,
    items: readonly LegalAcceptanceItem[],
    context: LegalRequestContext,
  ): Promise<LegalStatus> {
    const allowed = new Set<LegalDocumentKey>([
      ...requiredLegalDocuments(user.accountType),
      ...optionalLegalDocuments(),
    ]);
    const valid = this.assertAcceptances(items, []).filter((i) => allowed.has(i.key));
    if (valid.length === 0) {
      throw new BadRequestException('No hay documentos para aceptar.');
    }
    const status = await this.getStatus(user);
    const channel: LegalAcceptanceChannel = valid.every(
      (i) => getLegalDocument(i.key).acceptance === 'optional',
    )
      ? 'preferences'
      : 'reacceptance';
    await this.prisma.withOrgContext(user.organizationId, (tx) =>
      this.recordWithTx(tx, {
        organizationId: user.organizationId,
        actorUserId: user.id,
        subject: { type: 'user', userId: user.id },
        items: valid,
        channel,
        context,
      }),
    );
    // Solo se avisa por correo lo que cambia algo (no re-aceptar lo ya aceptado).
    const newlyAccepted = valid.filter(
      (i) =>
        !status.history.some(
          (h) => h.key === i.key && h.version === i.version && h.action === 'accepted',
        ),
    );
    await this.notifyAcceptance(user.email, newlyAccepted);
    return this.getStatus(user);
  }

  /** Revoca una autorización OPCIONAL. Revocar la autorización obligatoria
   *  equivale a cerrar la cuenta y se tramita por el canal de datos personales. */
  async revoke(
    user: RequestUser,
    key: LegalDocumentKey,
    context: LegalRequestContext,
  ): Promise<LegalStatus> {
    if (!KNOWN_KEYS.has(key) || getLegalDocument(key).acceptance !== 'optional') {
      throw new BadRequestException(
        'Solo puedes retirar aquí autorizaciones opcionales. Para retirar la autorización de datos escribe a adoptafacil.oficial@gmail.com.',
      );
    }
    const doc = getLegalDocument(key);
    await this.prisma.withOrgContext(user.organizationId, (tx) =>
      this.recordWithTx(tx, {
        organizationId: user.organizationId,
        actorUserId: user.id,
        subject: { type: 'user', userId: user.id },
        items: [{ key, version: doc.version }],
        channel: 'preferences',
        action: 'revoked',
        context,
      }),
    );
    return this.getStatus(user);
  }

  /**
   * Aviso al aceptar: correo con qué documentos, qué versión y cuándo, y el
   * enlace para releerlos. Nunca hace fallar la operación (la aceptación ya
   * quedó registrada); solo deja constancia en el log, sin el destinatario.
   */
  async notifyAcceptance(
    to: string | undefined,
    items: readonly LegalAcceptanceItem[],
  ): Promise<void> {
    if (!to || items.length === 0) return;
    const when = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
    const lines = items.map((i) => {
      const doc = getLegalDocument(i.key);
      return `- ${doc.title} (versión ${doc.version}): ${this.webBaseUrl}/legal/${doc.slug}/${doc.version}`;
    });
    try {
      await this.notifications.send({
        to,
        subject: 'Registramos tu aceptación en AdoptaFácil',
        body:
          'Hola,\n\n' +
          `El ${when} quedó registrada tu aceptación de estos documentos:\n\n` +
          `${lines.join('\n')}\n\n` +
          'Guardamos la versión exacta de cada texto, la fecha y hora, y la dirección IP y el navegador desde los que aceptaste. ' +
          'Puedes consultar tu historial en la plataforma y retirar las autorizaciones opcionales cuando quieras.\n\n' +
          'Para ejercer tus derechos sobre tus datos personales escribe a adoptafacil.oficial@gmail.com.',
      });
    } catch {
      this.logger.warn(
        'No se pudo enviar el aviso de aceptación legal (la aceptación sí quedó registrada)',
      );
    }
  }
}

/** Extrae IP y navegador de una petición Express (`trust proxy` decide la IP). */
export function legalContextFrom(req: {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}): LegalRequestContext {
  const ua = req.headers['user-agent'];
  return {
    ipAddress: req.ip ?? null,
    userAgent: typeof ua === 'string' ? ua : null,
  };
}
