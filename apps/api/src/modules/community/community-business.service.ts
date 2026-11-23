import { randomInt } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type BusinessBenefit as BusinessBenefitRow } from '@prisma/client';
import {
  BENEFIT_PASS_ALPHABET,
  BUSINESS_COMMERCIAL_CONSENT_VERSION,
  BUSINESS_MAX_BENEFITS,
  ServiceListingStatus,
  normalizeBenefitPassCode,
  type ActivateBusinessAccountInput,
  type AdopterBenefitStatus,
  type AdopterBenefitsPage,
  type AllyProgress,
  type BenefitPass,
  type BenefitRedemption,
  type BenefitRedemptionRecord,
  type BusinessAccount,
  type BusinessBenefit,
  type BusinessBenefitPublic,
  type BusinessBenefitQueueItem,
  type BusinessBenefitStatus,
  type BusinessBenefitsQueuePage,
  type BusinessImpact,
  type BusinessOverview,
  type CreateBusinessBenefitInput,
  type ModerateBusinessBenefitInput,
  type UpdateBusinessBenefitInput,
  type UpdateBusinessConsentInput,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { clampLimit } from './community-posts.service';
import { SERVICE_LISTING_ORG_ROLES } from './community-directory.service';

const EMPTY_IMPACT: BusinessImpact = {
  contributionsDelivered: 0,
  sheltersSupported: 0,
  adoptersBenefited: 0,
  liveBenefits: 0,
};

function toImpact(raw: Partial<Record<keyof BusinessImpact, number | string>> | null | undefined) {
  const impact: BusinessImpact = {
    contributionsDelivered: Number(raw?.contributionsDelivered ?? 0),
    sheltersSupported: Number(raw?.sheltersSupported ?? 0),
    adoptersBenefited: Number(raw?.adoptersBenefited ?? 0),
    liveBenefits: Number(raw?.liveBenefits ?? 0),
  };
  if (raw?.passesIssued !== undefined) impact.passesIssued = Number(raw.passesIssued);
  return impact;
}

/** Camino al sello: perfil aprobado + (un aporte entregado o un beneficio vigente). */
export function allyProgress(
  impact: BusinessImpact,
  listings: Array<{ status: string; isPartner: boolean }>,
): AllyProgress {
  const profileApproved = listings.some((l) => l.status === ServiceListingStatus.Approved);
  const firstContribution = impact.contributionsDelivered > 0;
  const benefitLive = impact.liveBenefits > 0;
  return {
    steps: [
      { key: 'profile_approved', done: profileApproved },
      { key: 'first_contribution', done: firstContribution },
      { key: 'benefit_live', done: benefitLive },
    ],
    eligible: profileApproved && (firstContribution || benefitLive),
    isAlly: listings.some((l) => l.isPartner),
  };
}

/** Código de pase aleatorio (criptográfico), 8 caracteres sin ambigüedades. */
export function newBenefitPassCode(): string {
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    code += BENEFIT_PASS_ALPHABET[randomInt(BENEFIT_PASS_ALPHABET.length)];
  }
  return code;
}

function opt<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

function dateOnly(value: Date | null): string | undefined {
  return value ? value.toISOString().slice(0, 10) : undefined;
}

function toOwnBenefit(row: BusinessBenefitRow): BusinessBenefit {
  return {
    id: row.id,
    listingId: row.listingId,
    title: row.title,
    description: opt(row.description),
    terms: opt(row.terms),
    validUntil: dateOnly(row.validUntil),
    active: row.active,
    status: row.status as BusinessBenefitStatus,
    moderationReason: opt(row.moderationReason),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

type RawPublicBenefit = {
  id: string;
  listingId: string;
  title: string;
  description: string | null;
  terms: string | null;
  validUntil: string | null;
};

function toPublicBenefit(raw: RawPublicBenefit): BusinessBenefitPublic {
  return {
    id: raw.id,
    listingId: raw.listingId,
    title: raw.title,
    description: opt(raw.description),
    terms: opt(raw.terms),
    validUntil: opt(raw.validUntil),
  };
}

type RawPass = Omit<
  BenefitPass,
  'benefit' | 'redeemedAt' | 'listingAddress' | 'listingWhatsapp' | 'listingPhone'
> & {
  benefit: RawPublicBenefit;
  redeemedAt: string | null;
  listingAddress: string | null;
  listingWhatsapp: string | null;
  listingPhone: string | null;
};

function toPass(raw: RawPass): BenefitPass {
  return {
    id: raw.id,
    code: raw.code,
    status: raw.status,
    issuedAt: raw.issuedAt,
    redeemedAt: opt(raw.redeemedAt),
    benefit: toPublicBenefit(raw.benefit),
    benefitLive: raw.benefitLive === true,
    listingName: raw.listingName,
    listingCategory: raw.listingCategory,
    listingCity: raw.listingCity,
    listingAddress: opt(raw.listingAddress),
    listingWhatsapp: opt(raw.listingWhatsapp),
    listingPhone: opt(raw.listingPhone),
  };
}

type RawQueueItem = RawPublicBenefit & {
  listingName: string;
  listingCity: string;
  active: boolean;
  status: string;
  moderationReason: string | null;
  updatedAt: string;
};

function toQueueItem(raw: RawQueueItem): BusinessBenefitQueueItem {
  return {
    ...toPublicBenefit(raw),
    listingName: raw.listingName,
    listingCity: raw.listingCity,
    active: raw.active,
    status: raw.status as BusinessBenefitStatus,
    moderationReason: opt(raw.moderationReason),
    updatedAt: raw.updatedAt,
  };
}

/**
 * Comunidad · Negocios aliados: panel de negocio, beneficios para quien
 * adopta, pases de canje e impacto comprobable.
 *
 * - Cuenta y beneficios viven en el tenant del negocio (RLS normal). La app no
 *   escribe el estado de moderación (GRANT por columna + triggers).
 * - Los pases y todo lo cruzado (vitrina pública, impacto, canje) pasan por
 *   funciones SECURITY DEFINER acotadas: la app no tiene privilegios sobre la
 *   tabla de pases y el negocio nunca ve la identidad de quien adoptó.
 */
@Injectable()
export class CommunityBusinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Una Persona gestiona su tenant; en una organización, Owner/Administrator. */
  private async assertCanManage(actor: RequestUser, tx: Prisma.TransactionClient): Promise<void> {
    if (actor.accountType === 'person') return;
    const roles = await tx.userRole.findMany({ where: { userId: actor.id } });
    if (!roles.some((r) => SERVICE_LISTING_ORG_ROLES.includes(r.role))) {
      throw new ForbiddenException('Insufficient role');
    }
  }

  private toAccount(row: {
    commercialConsent: boolean;
    commercialConsentAt: Date | null;
    createdAt: Date;
  }): BusinessAccount {
    return {
      commercialConsent: row.commercialConsent,
      commercialConsentAt: row.commercialConsentAt?.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async impactOf(organizationId: string): Promise<BusinessImpact> {
    const rows = await this.prisma.$queryRaw<Array<{ data: Record<string, number> | null }>>(
      Prisma.sql`SELECT community_business_impact(${organizationId}::uuid) AS data`,
    );
    return toImpact(rows[0]?.data);
  }

  // -------------------------------------------------------------------------
  // Panel del negocio
  // -------------------------------------------------------------------------

  /** Panel en una llamada. Una cuenta sin panel activo recibe `account: null`
   *  (el menú no cambia); nunca 403, así el menú puede preguntar sin ruido. */
  async overview(actor: RequestUser): Promise<BusinessOverview> {
    const { account, listings } = await this.prisma.withOrgContext(
      actor.organizationId,
      async (tx) => ({
        account: await tx.businessAccount.findUnique({
          where: { organizationId: actor.organizationId },
        }),
        listings: await tx.serviceListing.findMany({
          select: { status: true, isPartner: true },
          take: 50,
        }),
      }),
    );
    if (!account) {
      return { account: null, impact: EMPTY_IMPACT, ally: allyProgress(EMPTY_IMPACT, listings) };
    }
    const impact = await this.impactOf(actor.organizationId);
    return { account: this.toAccount(account), impact, ally: allyProgress(impact, listings) };
  }

  async activate(
    actor: RequestUser,
    input: ActivateBusinessAccountInput,
  ): Promise<BusinessAccount> {
    const organizationId = actor.organizationId;
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      await this.assertCanManage(actor, tx);
      const existing = await tx.businessAccount.findUnique({ where: { organizationId } });
      if (existing) return this.toAccount(existing);
      const now = new Date();
      const row = await tx.businessAccount.create({
        data: {
          organizationId,
          userId: actor.id,
          commercialConsent: input.commercialConsent,
          commercialConsentAt: input.commercialConsent ? now : null,
          commercialConsentVersion: input.commercialConsent
            ? BUSINESS_COMMERCIAL_CONSENT_VERSION
            : null,
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId: actor.id,
        action: 'community_business_account.activated',
        entityType: 'community_business_account',
        entityId: row.id,
        metadata: { commercialConsent: input.commercialConsent },
      });
      return this.toAccount(row);
    });
  }

  /** Dar o retirar la autorización comercial (Ley 1581: revocable siempre). */
  async setConsent(
    actor: RequestUser,
    input: UpdateBusinessConsentInput,
  ): Promise<BusinessAccount> {
    const organizationId = actor.organizationId;
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      await this.assertCanManage(actor, tx);
      const existing = await tx.businessAccount.findUnique({ where: { organizationId } });
      if (!existing) throw new NotFoundException('Activa primero tu panel de negocio.');
      const row = await tx.businessAccount.update({
        where: { organizationId },
        data: {
          commercialConsent: input.commercialConsent,
          commercialConsentAt: input.commercialConsent ? new Date() : null,
          commercialConsentVersion: input.commercialConsent
            ? BUSINESS_COMMERCIAL_CONSENT_VERSION
            : null,
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId: actor.id,
        action: input.commercialConsent
          ? 'community_business_account.commercial_consent_given'
          : 'community_business_account.commercial_consent_withdrawn',
        entityType: 'community_business_account',
        entityId: row.id,
        metadata: { version: BUSINESS_COMMERCIAL_CONSENT_VERSION },
      });
      return this.toAccount(row);
    });
  }

  // -------------------------------------------------------------------------
  // Beneficios del negocio
  // -------------------------------------------------------------------------

  private async requireAccount(tx: Prisma.TransactionClient, organizationId: string) {
    const account = await tx.businessAccount.findUnique({ where: { organizationId } });
    if (!account) throw new ForbiddenException('Activa primero tu panel de negocio.');
  }

  async listBenefits(actor: RequestUser): Promise<BusinessBenefit[]> {
    return this.prisma.withOrgContext(actor.organizationId, async (tx) => {
      await this.assertCanManage(actor, tx);
      const rows = await tx.businessBenefit.findMany({ orderBy: { createdAt: 'desc' }, take: 20 });
      return rows.map(toOwnBenefit);
    });
  }

  async createBenefit(
    actor: RequestUser,
    input: CreateBusinessBenefitInput,
  ): Promise<BusinessBenefit> {
    const organizationId = actor.organizationId;
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      await this.assertCanManage(actor, tx);
      await this.requireAccount(tx, organizationId);
      // Bajo RLS, un perfil de otro tenant simplemente no existe → 404.
      const listing = await tx.serviceListing.findUnique({ where: { id: input.listingId } });
      if (!listing) throw new NotFoundException('Listing not found');
      const open = await tx.businessBenefit.count({
        where: { status: { in: ['pending', 'approved'] }, active: true },
      });
      if (open >= BUSINESS_MAX_BENEFITS) {
        throw new ConflictException(
          `Puedes tener hasta ${BUSINESS_MAX_BENEFITS} beneficios activos. Pausa uno para crear otro.`,
        );
      }
      const row = await tx.businessBenefit.create({
        data: {
          organizationId,
          listingId: input.listingId,
          createdByUserId: actor.id,
          title: input.title,
          description: input.description ?? null,
          terms: input.terms ?? null,
          validUntil: input.validUntil ? new Date(`${input.validUntil}T00:00:00.000Z`) : null,
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId: actor.id,
        action: 'community_business_benefit.created',
        entityType: 'community_business_benefit',
        entityId: row.id,
        metadata: { listingId: input.listingId },
      });
      return toOwnBenefit(row);
    });
  }

  async updateBenefit(
    actor: RequestUser,
    id: string,
    input: UpdateBusinessBenefitInput,
  ): Promise<BusinessBenefit> {
    const organizationId = actor.organizationId;
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      await this.assertCanManage(actor, tx);
      const existing = await tx.businessBenefit.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Benefit not found');
      if (input.active === true && !existing.active) {
        const open = await tx.businessBenefit.count({
          where: { status: { in: ['pending', 'approved'] }, active: true, id: { not: id } },
        });
        if (open >= BUSINESS_MAX_BENEFITS) {
          throw new ConflictException(
            `Puedes tener hasta ${BUSINESS_MAX_BENEFITS} beneficios activos. Pausa uno antes.`,
          );
        }
      }
      const data: Prisma.BusinessBenefitUpdateInput = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.description !== undefined) data.description = input.description;
      if (input.terms !== undefined) data.terms = input.terms;
      if (input.validUntil !== undefined) {
        data.validUntil = input.validUntil ? new Date(`${input.validUntil}T00:00:00.000Z`) : null;
      }
      if (input.active !== undefined) data.active = input.active;
      const row = await tx.businessBenefit.update({ where: { id }, data });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId: actor.id,
        action: 'community_business_benefit.updated',
        entityType: 'community_business_benefit',
        entityId: id,
        metadata: { fields: Object.keys(input) },
      });
      return toOwnBenefit(row);
    });
  }

  // -------------------------------------------------------------------------
  // Canje en el negocio
  // -------------------------------------------------------------------------

  async redeem(actor: RequestUser, rawCode: string): Promise<BenefitRedemption> {
    const code = normalizeBenefitPassCode(rawCode);
    if (code.length !== 8) throw new BadRequestException('El código tiene 8 caracteres.');
    await this.prisma.withOrgContext(actor.organizationId, async (tx) => {
      await this.assertCanManage(actor, tx);
      await this.requireAccount(tx, actor.organizationId);
    });
    try {
      const rows = await this.prisma.$queryRaw<Array<{ data: BenefitRedemption }>>(
        Prisma.sql`SELECT community_benefit_redeem(${code}, ${actor.organizationId}::uuid, ${actor.id}::uuid) AS data`,
      );
      return rows[0].data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/pass not found/i.test(message)) {
        throw new NotFoundException('Ese código no corresponde a un beneficio de tu negocio.');
      }
      throw error;
    }
  }

  async redemptions(actor: RequestUser): Promise<BenefitRedemptionRecord[]> {
    await this.prisma.withOrgContext(actor.organizationId, (tx) => this.assertCanManage(actor, tx));
    const rows = await this.prisma.$queryRaw<Array<{ data: BenefitRedemptionRecord[] }>>(
      Prisma.sql`SELECT community_benefit_redemptions(${actor.organizationId}::uuid, 20) AS data`,
    );
    return rows[0]?.data ?? [];
  }

  // -------------------------------------------------------------------------
  // Quien adopta
  // -------------------------------------------------------------------------

  async adopterStatus(actor: RequestUser): Promise<AdopterBenefitStatus> {
    const rows = await this.prisma.$queryRaw<
      Array<{ data: { eligible: boolean; adoptedAnimals: string[]; passes: RawPass[] } }>
    >(Prisma.sql`SELECT community_adopter_benefit_status(${actor.id}::uuid) AS data`);
    const data = rows[0]?.data;
    return {
      eligible: data?.eligible === true,
      adoptedAnimals: data?.adoptedAnimals ?? [],
      passes: (data?.passes ?? []).map(toPass),
    };
  }

  async issuePass(actor: RequestUser, benefitId: string): Promise<BenefitPass> {
    // Un choque de código (1 en ~8·10¹¹) se resuelve generando otro.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const rows = await this.prisma.$queryRaw<Array<{ data: RawPass }>>(
          Prisma.sql`SELECT community_benefit_issue_pass(${benefitId}::uuid, ${actor.id}::uuid, ${actor.organizationId}::uuid, ${newBenefitPassCode()}) AS data`,
        );
        return toPass(rows[0].data);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/benefit not found/i.test(message)) throw new NotFoundException('Benefit not found');
        if (/cannot use own benefit/i.test(message)) {
          throw new ForbiddenException('No puedes usar un beneficio de tu propio negocio.');
        }
        if (/no confirmed adoption/i.test(message)) {
          throw new ForbiddenException(
            'Los beneficios se activan cuando tu adopción queda confirmada en AdoptaFácil.',
          );
        }
        if (/community_benefit_passes_code_key/i.test(message)) continue;
        throw error;
      }
    }
    throw new ConflictException('No pudimos generar tu código. Inténtalo de nuevo.');
  }

  // -------------------------------------------------------------------------
  // Público (sin sesión)
  // -------------------------------------------------------------------------

  async publicBenefits(limit: number, offset: number, city?: string): Promise<AdopterBenefitsPage> {
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    const rows = await this.prisma.$queryRaw<
      Array<{ data: { items: Array<RawPublicBenefit & Record<string, unknown>>; total: number } }>
    >(
      Prisma.sql`SELECT public_adopter_benefits(${take}::int, ${skip}::int, ${city ?? null}::text) AS data`,
    );
    const data = rows[0]?.data ?? { items: [], total: 0 };
    return {
      items: (data.items ?? []).map((raw) => ({
        ...toPublicBenefit(raw),
        listingName: String(raw.listingName),
        listingCategory:
          raw.listingCategory as AdopterBenefitsPage['items'][number]['listingCategory'],
        listingCity: String(raw.listingCity),
        listingDepartment: String(raw.listingDepartment),
        listingIsPartner: raw.listingIsPartner === true,
      })),
      total: Number(data.total ?? 0),
      limit: take,
      offset: skip,
    };
  }

  async listingBenefits(listingId: string): Promise<BusinessBenefitPublic[]> {
    const rows = await this.prisma.$queryRaw<Array<{ data: RawPublicBenefit[] }>>(
      Prisma.sql`SELECT public_service_listing_benefits(${listingId}::uuid) AS data`,
    );
    return (rows[0]?.data ?? []).map(toPublicBenefit);
  }

  async listingImpact(listingId: string, scope: 'public' | 'platform'): Promise<BusinessImpact> {
    const rows = await this.prisma.$queryRaw<Array<{ data: Record<string, number> | null }>>(
      scope === 'public'
        ? Prisma.sql`SELECT public_service_listing_impact(${listingId}::uuid) AS data`
        : Prisma.sql`SELECT service_listing_impact(${listingId}::uuid) AS data`,
    );
    const data = rows[0]?.data;
    if (!data) throw new NotFoundException('Listing not found');
    return toImpact(data);
  }

  // -------------------------------------------------------------------------
  // Moderación de plataforma
  // -------------------------------------------------------------------------

  async benefitsQueue(
    limit: number,
    offset: number,
    status?: string,
  ): Promise<BusinessBenefitsQueuePage> {
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    const rows = await this.prisma.$queryRaw<
      Array<{ data: { items: RawQueueItem[]; total: number } }>
    >(
      Prisma.sql`SELECT community_benefits_moderation_queue(${take}::int, ${skip}::int, ${status ?? null}::text) AS data`,
    );
    const data = rows[0]?.data ?? { items: [], total: 0 };
    return {
      items: (data.items ?? []).map(toQueueItem),
      total: Number(data.total ?? 0),
      limit: take,
      offset: skip,
    };
  }

  async moderateBenefit(
    reviewerUserId: string,
    id: string,
    input: ModerateBusinessBenefitInput,
  ): Promise<BusinessBenefitQueueItem> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ data: RawQueueItem }>>(
        Prisma.sql`SELECT community_benefit_moderate(${id}::uuid, ${input.decision}, ${reviewerUserId}::uuid, ${input.reason ?? null}) AS data`,
      );
      return toQueueItem(rows[0].data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/benefit not found/i.test(message)) throw new NotFoundException('Benefit not found');
      if (/reason is required/i.test(message)) {
        throw new BadRequestException('El motivo es obligatorio para rechazar u ocultar.');
      }
      throw error;
    }
  }
}
