import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../core/audit/audit.service';
import type { RequestUser } from '../../core/auth/auth.types';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';
import { PrismaService } from '../../prisma/prisma.service';

/** Frase que la persona escribe para confirmar la supresión (irreversible). */
export const SUPPRESSION_CONFIRMATION = 'SUPRIMIR MI CUENTA';

/**
 * Lo que se conserva tras una supresión y por qué. TODO(client): el abogado
 * valida los textos y los plazos antes del lanzamiento.
 */
export const RETAINED_AFTER_SUPPRESSION = [
  {
    data: 'Donaciones, recibos y certificados de donación',
    reason:
      'Soporte contable y tributario de la organización que recibió la donación (deber legal de conservación).',
  },
  {
    data: 'Solicitudes, contratos y seguimientos de adopción',
    reason: 'Evidencia del contrato de adopción y del bienestar del animal entregado.',
  },
  {
    data: 'Apadrinamientos y compras de café',
    reason: 'Soporte de pagos y de lo que se le entregó a cada campaña.',
  },
  {
    data: 'Aceptaciones de la política de datos y consentimientos',
    reason: 'Prueba de la autorización que usted dio (Ley 1581, art. 9; Decreto 1377, art. 7).',
  },
  {
    data: 'Bitácora de auditoría',
    reason:
      'Registro inmutable de seguridad; solo guarda identificadores, nunca datos de contacto.',
  },
] as const;

export interface PrivacyDataExport {
  generatedAt: string;
  legalBasis: string;
  data: unknown;
}

export interface SuppressionResult {
  suppressedAt: string;
  postsDeleted: number;
  retained: typeof RETAINED_AFTER_SUPPRESSION;
}

/**
 * Derechos del titular (Ley 1581 de 2012, arts. 14 y 15; auditoría run-2
 * C-01). La persona autenticada consulta todo lo que la plataforma guarda de
 * ella y puede suprimir su cuenta. El titular SIEMPRE sale del token, nunca del
 * cuerpo. Cada consulta y cada supresión quedan en la bitácora inmutable (solo
 * ids: la bitácora nunca guarda datos de contacto).
 */
@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  async exportMine(actor: RequestUser): Promise<PrivacyDataExport> {
    const rows = await this.prisma.$queryRaw<Array<{ data: unknown }>>(
      Prisma.sql`SELECT privacy_subject_data(${actor.id}::uuid) AS data`,
    );
    const data = rows[0]?.data;
    if (!data) throw new NotFoundException('Cuenta no encontrada');
    await this.audit.record({
      organizationId: actor.organizationId,
      actorUserId: actor.id,
      action: 'privacy.access_served',
      entityType: 'user',
      entityId: actor.id,
      metadata: { channel: 'self_service' },
    });
    return {
      generatedAt: new Date().toISOString(),
      legalBasis: 'Ley 1581 de 2012, art. 14 (consulta del titular)',
      data,
    };
  }

  async suppressMine(actor: RequestUser, confirmation: string): Promise<SuppressionResult> {
    if (actor.accountType !== 'person') {
      throw new ForbiddenException(
        'Las cuentas de una organización se retiran desde el equipo de la organización.',
      );
    }
    if (confirmation.trim().toUpperCase() !== SUPPRESSION_CONFIRMATION) {
      throw new BadRequestException(
        `Para confirmar escribe exactamente: ${SUPPRESSION_CONFIRMATION}`,
      );
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ data: { postsDeleted: number; storageKeys: string[] } | null }>
      >(Prisma.sql`SELECT privacy_suppress_person(${actor.id}::uuid) AS data`);
      const data = rows[0]?.data;
      if (!data) throw new NotFoundException('Cuenta no encontrada');
      return data;
    });
    await this.audit.record({
      organizationId: actor.organizationId,
      actorUserId: actor.id,
      action: 'privacy.suppression_completed',
      entityType: 'user',
      entityId: actor.id,
      metadata: { channel: 'self_service', postsDeleted: result.postsDeleted },
    });
    // Best-effort: un archivo que no se pudo borrar queda en el log para
    // reintentarlo a mano; nunca deshace la supresión ya hecha.
    for (const key of result.storageKeys) {
      try {
        await this.storage.deleteObject?.(key);
      } catch (error) {
        this.logger.error(`privacy: could not delete ${key}: ${(error as Error).message}`);
      }
    }
    return {
      suppressedAt: new Date().toISOString(),
      postsDeleted: result.postsDeleted,
      retained: RETAINED_AFTER_SUPPRESSION,
    };
  }
}
