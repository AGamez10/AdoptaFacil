import { randomInt } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CampaignStatus,
  ORG_QR_CODE_PATTERN,
  type OrganizationQr,
  type PublicQrResolution,
  type QrTarget,
  type QrTargetKind,
  type QrTargetOption,
  type UpdateOrganizationQrTargetInput,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { PrismaService } from '../../prisma/prisma.service';

/** Alfabeto del código: sin 0/1/i/l/o (igual al CHECK de la tabla). */
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 8;
const SCAN_WINDOW_DAYS = 30;

function newCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

const DONATE: QrTarget = { kind: 'donate', id: null };

/**
 * QR fijo por organización. La organización lee su QR (el código se crea la
 * primera vez y no cambia nunca) y elige a dónde lleva: donar, una de sus
 * campañas activas o apadrinar uno de sus animales. Todo bajo su RLS, así que
 * una campaña o un animal de otra organización ni siquiera se encuentra. El
 * escaneo público se resuelve con `resolve_organization_qr` (SECURITY DEFINER),
 * que vuelve a validar el destino y cae a donar si dejó de valer.
 */
@Injectable()
export class OrgQrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  async getOwn(): Promise<OrganizationQr> {
    const organizationId = this.requireOrgId();
    const link = await this.ensureLink(organizationId);
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const { campaigns, animals } = await this.options(tx, organizationId);
      const since = new Date(Date.now() - SCAN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      const scans = await tx.organizationQrScanDay.aggregate({
        where: { organizationId, day: { gte: since } },
        _sum: { scans: true },
      });
      const target: QrTarget = { kind: link.targetKind as QrTargetKind, id: link.targetId };
      const valid =
        target.kind === 'donate' ||
        (target.kind === 'campaign' ? campaigns : animals).some((o) => o.id === target.id);
      return {
        code: link.code,
        target,
        effectiveTarget: valid ? target : DONATE,
        campaigns,
        animals,
        scansLast30Days: scans._sum.scans ?? 0,
      };
    });
  }

  async updateTarget(
    actorUserId: string,
    input: UpdateOrganizationQrTargetInput,
  ): Promise<OrganizationQr> {
    const organizationId = this.requireOrgId();
    await this.ensureLink(organizationId);
    const targetId = input.kind === 'donate' ? null : (input.id ?? null);
    await this.prisma.withOrgContext(organizationId, async (tx) => {
      if (input.kind !== 'donate') {
        const { campaigns, animals } = await this.options(tx, organizationId);
        const pool = input.kind === 'campaign' ? campaigns : animals;
        if (!pool.some((o) => o.id === targetId)) {
          throw new BadRequestException(
            input.kind === 'campaign'
              ? 'Elige una campaña activa de tu organización.'
              : 'Elige un animal disponible de tu organización con un plan de apadrinamiento activo.',
          );
        }
      }
      const row = await tx.organizationQrLink.update({
        where: { organizationId },
        data: { targetKind: input.kind, targetId, updatedByUserId: actorUserId },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'org.qr_target_updated',
        entityType: 'organization_qr_link',
        entityId: row.id,
        metadata: { kind: input.kind, targetId },
      });
    });
    return this.getOwn();
  }

  /** Escaneo público. `null` = código inexistente o la org aún no tiene slug. */
  async resolve(code: string): Promise<PublicQrResolution | null> {
    if (!ORG_QR_CODE_PATTERN.test(code)) return null;
    const rows = await this.prisma.$queryRaw<
      Array<{ data: { slug: string; kind: QrTargetKind; targetId: string | null } | null }>
    >(Prisma.sql`SELECT resolve_organization_qr(${code}) AS data`);
    const data = rows[0]?.data;
    if (!data) return null;
    return { slug: data.slug, target: { kind: data.kind, id: data.targetId } };
  }

  /** Crea el QR la primera vez (código aleatorio, reintenta si choca). */
  private async ensureLink(organizationId: string) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.withOrgContext(organizationId, async (tx) => {
          const existing = await tx.organizationQrLink.findUnique({ where: { organizationId } });
          if (existing) return existing;
          return tx.organizationQrLink.create({ data: { organizationId, code: newCode() } });
        });
      } catch (error) {
        const retry =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        if (!retry) throw error;
      }
    }
    throw new Error('Could not allocate a unique QR code');
  }

  /** Lo que la org puede elegir: sus campañas activas y sus animales
   *  disponibles con plan de apadrinamiento activo (mismas reglas que la
   *  función pública). */
  private async options(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<{ campaigns: QrTargetOption[]; animals: QrTargetOption[] }> {
    const [campaigns, plans] = await Promise.all([
      tx.campaign.findMany({
        where: { organizationId, status: CampaignStatus.Active },
        select: { id: true, title: true },
        orderBy: { createdAt: 'desc' },
      }),
      tx.sponsorshipPlan.findMany({
        where: { organizationId, isActive: true },
        select: { animalId: true },
      }),
    ]);
    const animals = plans.length
      ? await tx.animal.findMany({
          where: {
            organizationId,
            isActive: true,
            status: 'available',
            id: { in: [...new Set(plans.map((p) => p.animalId))] },
          },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        })
      : [];
    return {
      campaigns: campaigns.map((c) => ({ id: c.id, label: c.title })),
      animals: animals.map((a) => ({ id: a.id, label: a.name })),
    };
  }
}
