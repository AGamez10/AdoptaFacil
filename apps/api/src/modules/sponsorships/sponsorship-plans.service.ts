import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, SponsorshipPlan as PlanRow } from '@prisma/client';
import {
  type AnimalSponsorshipSettings,
  type CreateSponsorshipPlanInput,
  DEFAULT_SPONSORSHIP_AMOUNT_COP,
  DEFAULT_SPONSORSHIP_PLAN_NAME,
  type MarkAnimalNeedsSponsorshipInput,
  type Paginated,
  type SponsorshipPlan,
  SponsorshipPeriodicity,
  SponsorshipStatus,
  type UpdateSponsorshipPlanInput,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';

const MAX_PAGE = 50;
const DEFAULT_PAGE = 20;

/** Clamp a requested page size to [1, MAX_PAGE] (local to this module — kept
 *  independent from other modules' pagination helpers by design). */
export function clampLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_PAGE;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE);
}

function toPlan(row: PlanRow): SponsorshipPlan {
  return {
    id: row.id,
    organizationId: row.organizationId,
    animalId: row.animalId,
    name: row.name,
    amount: row.amount,
    periodicity: row.periodicity as SponsorshipPeriodicity,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Sponsorship states that still bind the sponsor to the plan's amount. */
const LIVE_STATUSES = [SponsorshipStatus.Active, SponsorshipStatus.Suspended];

/**
 * Sponsorship PLANS (RF17 · T-056) — tenant-scoped (RLS): an org creates/edits
 * plans only for ITS OWN animals. Money is validated as an integer COP > 0 by the
 * zod schema at the controller boundary; archiving (`isActive:false`) never
 * physically removes a plan (existing sponsorships on it are unaffected).
 */
@Injectable()
export class SponsorshipPlansService {
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

  /** Create a plan for one of the caller's OWN active animals; audited. */
  async create(actorUserId: string, input: CreateSponsorshipPlanInput): Promise<SponsorshipPlan> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const animal = await tx.animal.findUnique({ where: { id: input.animalId } });
      if (!animal || !animal.isActive) {
        throw new BadRequestException('Animal not found or inactive');
      }
      const row = await tx.sponsorshipPlan.create({
        data: {
          organizationId,
          animalId: input.animalId,
          name: input.name,
          amount: input.amount,
          periodicity: input.periodicity,
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'sponsorship_plan.created',
        entityType: 'sponsorship_plan',
        entityId: row.id,
        metadata: { animalId: input.animalId, amount: input.amount },
      });
      return toPlan(row);
    });
  }

  /** Paginated list of the caller's org plans, newest first; optional animalId filter. */
  async list(
    limit: number,
    offset: number,
    animalId?: string,
  ): Promise<Paginated<SponsorshipPlan>> {
    const organizationId = this.requireOrgId();
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const where = { organizationId, ...(animalId ? { animalId } : {}) };
      const [rows, total] = await Promise.all([
        tx.sponsorshipPlan.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
        tx.sponsorshipPlan.count({ where }),
      ]);
      return { items: rows.map(toPlan), total, limit: take, offset: skip };
    });
  }

  /** One plan of the caller's org. */
  async get(id: string): Promise<SponsorshipPlan> {
    const organizationId = this.requireOrgId();
    const row = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.sponsorshipPlan.findUnique({ where: { id } }),
    );
    if (!row || row.organizationId !== organizationId) {
      throw new NotFoundException('Sponsorship plan not found');
    }
    return toPlan(row);
  }

  /** Patch a plan (incl. archiving via isActive:false); audited. */
  async update(
    actorUserId: string,
    id: string,
    input: UpdateSponsorshipPlanInput,
  ): Promise<SponsorshipPlan> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const existing = await tx.sponsorshipPlan.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException('Sponsorship plan not found');
      }
      // Changing the price of a plan that sponsors already joined would bill
      // them an amount they never accepted. The per-animal endpoint handles it
      // (archives this plan and opens a new one for new sponsors only).
      if (input.amount !== undefined && input.amount !== existing.amount) {
        const live = await tx.sponsorship.count({
          where: { planId: id, status: { in: LIVE_STATUSES } },
        });
        if (live > 0) {
          throw new ConflictException(
            'Este plan ya tiene padrinos: cambia el monto desde la ficha del animal para que aplique solo a los nuevos padrinos.',
          );
        }
      }
      const updated = await tx.sponsorshipPlan.update({
        where: { id },
        data: {
          name: input.name,
          amount: input.amount,
          periodicity: input.periodicity,
          isActive: input.isActive,
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'sponsorship_plan.updated',
        entityType: 'sponsorship_plan',
        entityId: id,
        metadata: { fields: Object.keys(input) },
      });
      return toPlan(updated);
    });
  }

  /** Sponsorship settings of one of the caller's animals. */
  async getForAnimal(animalId: string): Promise<AnimalSponsorshipSettings> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      await this.requireAnimal(tx, animalId, { mustBeActive: false });
      return this.settingsFor(tx, animalId);
    });
  }

  /**
   * "Este animal necesita apadrinamiento" — idempotent. Without an active plan,
   * opens one with the given amount (or the suggested default). With one, a
   * new amount is applied in place when nobody sponsors on it yet; otherwise
   * that plan is archived and a new one opened, so current sponsors keep
   * paying what they agreed to and only new sponsors see the new amount.
   * Serialized per animal (advisory lock) so a double click or a retried
   * request never opens two plans.
   */
  async markNeedsSponsorship(
    actorUserId: string,
    animalId: string,
    input: MarkAnimalNeedsSponsorshipInput,
  ): Promise<AnimalSponsorshipSettings> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      await this.lockAnimal(tx, animalId);
      await this.requireAnimal(tx, animalId, { mustBeActive: true });
      const current = await tx.sponsorshipPlan.findFirst({
        where: { organizationId, animalId, isActive: true },
        orderBy: { createdAt: 'desc' },
      });

      if (!current) {
        const amount = input.amount ?? DEFAULT_SPONSORSHIP_AMOUNT_COP;
        const row = await tx.sponsorshipPlan.create({
          data: {
            organizationId,
            animalId,
            name: DEFAULT_SPONSORSHIP_PLAN_NAME,
            amount,
            periodicity: SponsorshipPeriodicity.Monthly,
          },
        });
        await this.audit.recordWithTx(tx, {
          organizationId,
          actorUserId,
          action: 'sponsorship_plan.created',
          entityType: 'sponsorship_plan',
          entityId: row.id,
          metadata: { animalId, amount, source: 'needs_sponsorship' },
        });
        return this.settingsFor(tx, animalId);
      }

      if (input.amount === undefined || input.amount === current.amount) {
        return this.settingsFor(tx, animalId);
      }

      const live = await tx.sponsorship.count({
        where: { planId: current.id, status: { in: LIVE_STATUSES } },
      });
      if (live === 0) {
        await tx.sponsorshipPlan.update({
          where: { id: current.id },
          data: { amount: input.amount },
        });
        await this.audit.recordWithTx(tx, {
          organizationId,
          actorUserId,
          action: 'sponsorship_plan.updated',
          entityType: 'sponsorship_plan',
          entityId: current.id,
          metadata: { fields: ['amount'], from: current.amount, to: input.amount },
        });
        return this.settingsFor(tx, animalId);
      }

      await tx.sponsorshipPlan.update({ where: { id: current.id }, data: { isActive: false } });
      const next = await tx.sponsorshipPlan.create({
        data: {
          organizationId,
          animalId,
          name: current.name,
          amount: input.amount,
          periodicity: current.periodicity,
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'sponsorship_plan.repriced',
        entityType: 'sponsorship_plan',
        entityId: next.id,
        metadata: {
          animalId,
          previousPlanId: current.id,
          from: current.amount,
          to: input.amount,
          sponsorsKeepingPreviousAmount: live,
        },
      });
      return this.settingsFor(tx, animalId);
    });
  }

  /**
   * "Ya no necesita apadrinamiento" — archives the animal's active plans so no
   * new sponsor can join. Current sponsorships are untouched (the organization
   * suspends or cancels them explicitly, with a reason). Idempotent.
   */
  async unmarkNeedsSponsorship(
    actorUserId: string,
    animalId: string,
  ): Promise<AnimalSponsorshipSettings> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      await this.lockAnimal(tx, animalId);
      await this.requireAnimal(tx, animalId, { mustBeActive: false });
      const active = await tx.sponsorshipPlan.findMany({
        where: { organizationId, animalId, isActive: true },
        select: { id: true },
      });
      for (const plan of active) {
        await tx.sponsorshipPlan.update({ where: { id: plan.id }, data: { isActive: false } });
        await this.audit.recordWithTx(tx, {
          organizationId,
          actorUserId,
          action: 'sponsorship_plan.updated',
          entityType: 'sponsorship_plan',
          entityId: plan.id,
          metadata: { fields: ['isActive'], source: 'needs_sponsorship_off' },
        });
      }
      return this.settingsFor(tx, animalId);
    });
  }

  /** Serializes per-animal sponsorship writes until the transaction ends. */
  private async lockAnimal(tx: Prisma.TransactionClient, animalId: string): Promise<void> {
    const lockKey = `sponsorship_plan:${animalId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
  }

  private async requireAnimal(
    tx: Prisma.TransactionClient,
    animalId: string,
    { mustBeActive }: { mustBeActive: boolean },
  ): Promise<void> {
    // RLS already hides other tenants' animals: not found = not yours.
    const animal = await tx.animal.findUnique({
      where: { id: animalId },
      select: { isActive: true },
    });
    if (!animal) {
      throw new NotFoundException('Animal not found');
    }
    if (mustBeActive && !animal.isActive) {
      throw new BadRequestException('Animal not found or inactive');
    }
  }

  private async settingsFor(
    tx: Prisma.TransactionClient,
    animalId: string,
  ): Promise<AnimalSponsorshipSettings> {
    const [plan, activeSponsorsCount] = await Promise.all([
      tx.sponsorshipPlan.findFirst({
        where: { animalId, isActive: true },
        orderBy: { createdAt: 'desc' },
      }),
      tx.sponsorship.count({ where: { animalId, status: { in: LIVE_STATUSES } } }),
    ]);
    return {
      animalId,
      needsSponsorship: plan !== null,
      plan: plan ? toPlan(plan) : null,
      activeSponsorsCount,
      suggestedAmount: DEFAULT_SPONSORSHIP_AMOUNT_COP,
    };
  }
}
