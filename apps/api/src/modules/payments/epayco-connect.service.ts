import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ConnectEpaycoAccountInput,
  EpaycoCollectorCredentials,
  EpaycoConnectStatusView,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  decryptEpaycoSecret,
  EPAYCO_KEYS_ENCRYPTION_KEY,
  encryptEpaycoSecret,
} from './epayco-keys-crypto';

const ENTITY_TYPE = 'organization_epayco_account';

/**
 * ADR-PAG-002 — connect/disconnect/status of the organization's OWN ePayco
 * merchant account. The two secrets (`pKey`, `privateKey`) are encrypted
 * before they reach the database and are never returned, logged or audited;
 * the audit trail carries only `custId` (the merchant id, not a secret).
 * Every read/write runs under the organization's own RLS context.
 */
@Injectable()
export class EpaycoConnectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    @Inject(EPAYCO_KEYS_ENCRYPTION_KEY) private readonly key: Buffer,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  /** `PUT /org/epayco/connect` — create or replace the org's keys. */
  async connect(
    actorUserId: string,
    input: ConnectEpaycoAccountInput,
  ): Promise<EpaycoConnectStatusView> {
    const organizationId = this.requireOrgId();
    const data = {
      custId: input.custId,
      publicKey: input.publicKey,
      pKeyEnc: encryptEpaycoSecret(input.pKey, this.key),
      privateKeyEnc: encryptEpaycoSecret(input.privateKey, this.key),
    };
    try {
      const row = await this.prisma.withOrgContext(organizationId, async (tx) => {
        const saved = await tx.organizationEpaycoAccount.upsert({
          where: { organizationId },
          create: { organizationId, ...data },
          update: data,
        });
        await this.audit.recordWithTx(tx, {
          organizationId,
          actorUserId,
          action: 'payment_gateway.epayco_connected',
          entityType: ENTITY_TYPE,
          entityId: organizationId,
          // NEVER the keys: only the merchant id, which is not a secret.
          metadata: { custId: input.custId },
        });
        return saved;
      });
      return this.toView(row);
    } catch (error) {
      if (this.isCustIdConflict(error)) {
        // Generic on purpose: never confirm which organization holds it.
        throw new ConflictException('Esta cuenta de ePayco ya está conectada a otra organización.');
      }
      throw error;
    }
  }

  /** `GET /org/epayco/status` — never a secret. */
  async getStatus(): Promise<EpaycoConnectStatusView> {
    const organizationId = this.requireOrgId();
    const row = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.organizationEpaycoAccount.findUnique({
        where: { organizationId },
        select: { custId: true, publicKey: true, connectedAt: true },
      }),
    );
    return row ? this.toView(row) : { connected: false };
  }

  /** `DELETE /org/epayco/connect` — idempotent. */
  async disconnect(actorUserId: string): Promise<void> {
    const organizationId = this.requireOrgId();
    await this.prisma.withOrgContext(organizationId, async (tx) => {
      const existing = await tx.organizationEpaycoAccount.findUnique({
        where: { organizationId },
        select: { custId: true },
      });
      if (!existing) {
        return;
      }
      await tx.organizationEpaycoAccount.deleteMany({ where: { organizationId } });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'payment_gateway.epayco_disconnected',
        entityType: ENTITY_TYPE,
        entityId: organizationId,
        metadata: { custId: existing.custId },
      });
    });
  }

  private toView(row: {
    custId: string;
    publicKey: string;
    connectedAt: Date;
  }): EpaycoConnectStatusView {
    return {
      connected: true,
      custId: row.custId,
      publicKeyHint: row.publicKey.slice(-4),
      connectedAt: row.connectedAt.toISOString(),
    };
  }

  private isCustIdConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      return false;
    }
    const target = (error.meta as { target?: unknown } | undefined)?.target;
    const fields = Array.isArray(target) ? target.map(String) : [String(target ?? '')];
    return fields.some((field) => field.includes('cust_id') || field.includes('custId'));
  }
}

/**
 * Loads and decrypts an organization's ePayco credentials under ITS OWN RLS
 * context. Server-only: the result is passed to the PaymentPort and never
 * returned, logged or audited. `undefined` when the org never connected.
 */
export async function loadEpaycoCollector(
  prisma: PrismaService,
  key: Buffer,
  organizationId: string,
): Promise<EpaycoCollectorCredentials | undefined> {
  const row = await prisma.withOrgContext(organizationId, (tx) =>
    tx.organizationEpaycoAccount.findUnique({
      where: { organizationId },
      select: { custId: true, publicKey: true, pKeyEnc: true, privateKeyEnc: true },
    }),
  );
  if (!row) {
    return undefined;
  }
  return {
    custId: row.custId,
    publicKey: row.publicKey,
    pKey: decryptEpaycoSecret(row.pKeyEnc, key),
    privateKey: decryptEpaycoSecret(row.privateKeyEnc, key),
  };
}
