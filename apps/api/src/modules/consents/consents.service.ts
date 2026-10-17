import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  THIRD_PARTY_CONSENT_TEXTS,
  type GrantThirdPartyConsentInput,
  type RevokeThirdPartyConsentInput,
  type ThirdPartyConsentChannel,
  type ThirdPartyConsentItem,
  type ThirdPartyConsentPurpose,
  type ThirdPartyConsentStatus,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

interface ConsentRow {
  organizationId: string;
  organizationName: string;
  purpose: ThirdPartyConsentPurpose;
  authorized: boolean;
  textVersion: string | null;
  grantedAt: string | null;
}

/**
 * Consentimiento de terceros (donantes, voluntarios) para ser identificados en
 * los reportes y certificados de una organización. La persona actúa SIEMPRE
 * sobre sí misma (el id sale del JWT, nunca del cuerpo) y solo sobre
 * organizaciones con las que tiene una relación real; todo pasa por funciones
 * SECURITY DEFINER acotadas porque no es miembro de esas organizaciones.
 */
@Injectable()
export class ConsentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async mine(actor: RequestUser): Promise<ThirdPartyConsentStatus> {
    const rows = await this.prisma.$queryRaw<Array<{ data: ConsentRow[] }>>(
      Prisma.sql`SELECT third_party_consents_for_user(${actor.id}::uuid) AS data`,
    );
    const items: ThirdPartyConsentItem[] = (rows[0]?.data ?? []).map((row) => ({
      organizationId: row.organizationId,
      organizationName: row.organizationName,
      purpose: row.purpose,
      authorized: row.authorized,
      ...(row.textVersion ? { textVersion: row.textVersion } : {}),
      ...(row.grantedAt ? { grantedAt: new Date(`${row.grantedAt}Z`).toISOString() } : {}),
    }));
    return { items, texts: Object.values(THIRD_PARTY_CONSENT_TEXTS) };
  }

  async grant(
    actor: RequestUser,
    input: GrantThirdPartyConsentInput,
    channel: ThirdPartyConsentChannel = 'preferences',
  ): Promise<ThirdPartyConsentStatus> {
    const text = THIRD_PARTY_CONSENT_TEXTS[input.purpose];
    if (input.version !== text.version) {
      // Quien consiente debe haber visto el texto vigente.
      throw new ConflictException(
        'El texto de la autorización cambió. Vuelve a leerlo antes de autorizar.',
      );
    }
    const rows = await this.prisma.$queryRaw<Array<{ id: string | null }>>(
      Prisma.sql`SELECT grant_third_party_consent(${actor.id}::uuid, ${input.organizationId}::uuid,
        ${input.purpose}, ${text.version}, ${text.sha256}, ${channel}) AS id`,
    );
    const id = rows[0]?.id;
    if (!id) throw new NotFoundException('No tienes relación con esa organización.');
    await this.audit.record({
      organizationId: input.organizationId,
      actorUserId: actor.id,
      action: 'consent.granted',
      entityType: 'third_party_consent',
      entityId: id,
      metadata: { purpose: input.purpose, textVersion: text.version, channel },
    });
    return this.mine(actor);
  }

  async revoke(
    actor: RequestUser,
    input: RevokeThirdPartyConsentInput,
  ): Promise<ThirdPartyConsentStatus> {
    const rows = await this.prisma.$queryRaw<Array<{ revoked: boolean }>>(
      Prisma.sql`SELECT revoke_third_party_consent(${actor.id}::uuid, ${input.organizationId}::uuid,
        ${input.purpose}) AS revoked`,
    );
    if (rows[0]?.revoked) {
      await this.audit.record({
        organizationId: input.organizationId,
        actorUserId: actor.id,
        action: 'consent.revoked',
        entityType: 'third_party_consent',
        entityId: `${input.organizationId}:${actor.id}`,
        metadata: { purpose: input.purpose },
      });
    }
    return this.mine(actor);
  }
}
