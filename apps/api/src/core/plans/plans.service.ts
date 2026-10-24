import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OrganizationSubscription as SubscriptionRow, Prisma } from '@prisma/client';
import {
  PLAN_CATALOG,
  PLAN_KEYS,
  PLAN_REQUIRED_CODE,
  graceEnd,
  launchPromoEnd,
  minimumPlanFor,
  minimumPlanForLimit,
  planIncludes,
  resolveEffectivePlan,
  type AssignOrganizationPlanInput,
  type BillingProvider,
  type OrganizationPlanView,
  type OrganizationSubscription,
  type PlanCapability,
  type PlanKey,
  type PlanLimit,
  type PlanRequiredError,
  type SubscriptionStatus,
} from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { STORAGE_PORT, type StoragePort } from '../storage/storage.port';

const MB = 1024 * 1024;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toContract(row: SubscriptionRow): OrganizationSubscription {
  return {
    organizationId: row.organizationId,
    plan: row.plan as PlanKey,
    status: row.status as SubscriptionStatus,
    currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
    provider: row.provider as BillingProvider,
    providerReference: row.providerReference,
    discountPercent: row.discountPercent,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Plans and subscriptions of organizations (planes y suscripciones). Answers
 * "which plan is in effect for this org" and enforces plan capabilities and
 * limits. It sits AFTER the module feature flags: a capability is available only
 * when its module flag is on AND the org's plan includes it.
 *
 * While `PLAN_ENFORCEMENT` is off every org is `pro`, so no request is ever
 * refused for plan reasons until the owner turns charging on.
 */
@Injectable()
export class PlansService {
  readonly enforced: boolean;
  /** End of the launch promotion (Pro for free), or null without a launch date. */
  readonly promoEndsAt: Date | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    config: ConfigService<Env, true>,
    @Optional() @Inject(STORAGE_PORT) private readonly storage?: StoragePort,
  ) {
    this.enforced = config.get('PLAN_ENFORCEMENT', { infer: true }) === true;
    const launch = config.get('PLAN_LAUNCH_DATE', { infer: true });
    this.promoEndsAt = launch ? launchPromoEnd(new Date(launch)) : null;
  }

  private async findSubscription(organizationId: string): Promise<SubscriptionRow | null> {
    return this.prisma.withOrgContext(organizationId, (tx) =>
      tx.organizationSubscription.findUnique({ where: { organizationId } }),
    );
  }

  /** The plan in effect right now for `organizationId`. */
  async effectivePlan(organizationId: string, now = new Date()): Promise<PlanKey> {
    if (!this.enforced) {
      return 'pro';
    }
    const row = await this.findSubscription(organizationId);
    return resolveEffectivePlan(row ? toContract(row) : null, now, true, this.promoEndsAt);
  }

  /** Whether the org's plan includes `capability` (no exception). */
  async hasCapability(organizationId: string, capability: PlanCapability): Promise<boolean> {
    return planIncludes(await this.effectivePlan(organizationId), capability);
  }

  /** 403 `PLAN_REQUIRED` unless the org's plan includes `capability`. */
  async assertCapability(organizationId: string, capability: PlanCapability): Promise<void> {
    const plan = await this.effectivePlan(organizationId);
    if (!planIncludes(plan, capability)) {
      const requiredPlan = minimumPlanFor(capability);
      const body: PlanRequiredError = {
        code: PLAN_REQUIRED_CODE,
        capability,
        requiredPlan,
        message: `Esta función está disponible desde el plan ${PLAN_CATALOG[requiredPlan].name}.`,
      };
      throw new ForbiddenException(body);
    }
  }

  /**
   * 403 `PLAN_REQUIRED` when creating one more item would exceed `limit`.
   * `countAfter` is the total the org would hold AFTER the creation. Only call
   * it on creation paths: existing data above a limit (after a downgrade) stays
   * readable and is never removed. Pass `plan` (from {@link effectivePlan},
   * read before opening a transaction) when calling from inside one.
   */
  async assertWithinLimit(
    organizationId: string,
    limit: PlanLimit,
    countAfter: number,
    plan?: PlanKey,
  ): Promise<void> {
    plan ??= await this.effectivePlan(organizationId);
    const max = PLAN_CATALOG[plan].limits[limit];
    if (max !== null && countAfter > max) {
      const requiredPlan = minimumPlanForLimit(limit, countAfter);
      const body: PlanRequiredError = {
        code: PLAN_REQUIRED_CODE,
        limit,
        requiredPlan,
        message: `Tu plan ${PLAN_CATALOG[plan].name} permite hasta ${max}. Mejora a ${PLAN_CATALOG[requiredPlan].name} para continuar.`,
      };
      throw new ForbiddenException(body);
    }
  }

  /**
   * Storage quota of the plan (1 / 10 / 50 GB): 403 `PLAN_REQUIRED` when saving
   * `addBytes` more would exceed it. Applies only with plans on and an adapter
   * that can measure; files already stored are never removed.
   */
  async assertStorageAvailable(organizationId: string, addBytes: number): Promise<void> {
    if (!this.enforced || !this.storage?.measureOrganizationUsage) {
      return;
    }
    const used = await this.storage.measureOrganizationUsage(organizationId);
    await this.assertWithinLimit(organizationId, 'storageMb', Math.ceil((used + addBytes) / MB));
  }

  /** `GET /org/plan`: plan, limits, usage and catalog for the caller's org. */
  async view(organizationId: string, now = new Date()): Promise<OrganizationPlanView> {
    const [row, members] = await this.prisma.withOrgContext(organizationId, (tx) =>
      Promise.all([
        tx.organizationSubscription.findUnique({ where: { organizationId } }),
        this.countMembers(tx, organizationId),
      ]),
    );
    const subscription = row ? toContract(row) : null;
    const effectivePlan = resolveEffectivePlan(subscription, now, this.enforced, this.promoEndsAt);
    const definition = PLAN_CATALOG[effectivePlan];
    const inPromo =
      this.enforced &&
      subscription === null &&
      this.promoEndsAt !== null &&
      now.getTime() <= this.promoEndsAt.getTime();
    const lapsing =
      this.enforced &&
      subscription !== null &&
      subscription.status !== 'canceled' &&
      subscription.currentPeriodEnd !== null &&
      effectivePlan !== 'free';
    return {
      enforced: this.enforced,
      effectivePlan,
      subscription,
      graceEndsAt: lapsing
        ? graceEnd(new Date(subscription.currentPeriodEnd as string)).toISOString()
        : null,
      launchPromoEndsAt: inPromo ? (this.promoEndsAt as Date).toISOString() : null,
      limits: definition.limits,
      capabilities: definition.capabilities,
      usage: {
        members,
        ...(this.storage?.measureOrganizationUsage
          ? {
              storageMb: Math.ceil(
                (await this.storage.measureOrganizationUsage(organizationId)) / MB,
              ),
            }
          : {}),
      },
      catalog: PLAN_KEYS.map((key) => PLAN_CATALOG[key]),
    };
  }

  /** Platform: the stored subscription of any org (null when it has none). */
  async platformGet(organizationId: string): Promise<OrganizationPlanView> {
    await this.assertOrganizationExists(organizationId);
    return this.view(organizationId);
  }

  /**
   * Platform: activate, extend or cancel an org's plan after a manual payment
   * (link de pago o transferencia a la cuenta de AdoptaFácil + factura). Runs
   * under the TARGET org's context so the RLS WITH CHECK still applies, and the
   * audit event commits atomically with the change.
   */
  async assign(
    actorUserId: string,
    organizationId: string,
    input: AssignOrganizationPlanInput,
  ): Promise<OrganizationSubscription> {
    await this.assertOrganizationExists(organizationId);
    const data = {
      plan: input.plan,
      status: input.status,
      currentPeriodEnd: input.currentPeriodEnd ? new Date(input.currentPeriodEnd) : null,
      providerReference: input.providerReference ?? null,
      ...(input.discountPercent !== undefined ? { discountPercent: input.discountPercent } : {}),
    } satisfies Prisma.OrganizationSubscriptionUpdateInput;

    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const previous = await tx.organizationSubscription.findUnique({ where: { organizationId } });
      const row = await tx.organizationSubscription.upsert({
        where: { organizationId },
        create: { organizationId, provider: 'manual', ...data },
        update: data,
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'organization.plan_changed',
        entityType: 'organization_subscription',
        entityId: row.id,
        metadata: {
          fromPlan: previous?.plan ?? null,
          fromStatus: previous?.status ?? null,
          plan: row.plan,
          status: row.status,
          currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
          discountPercent: row.discountPercent,
          providerReference: row.providerReference,
        },
      });
      return toContract(row);
    });
  }

  /** Team size = distinct people holding a role in the org (the `members`
   *  limit counts the same thing when invitations are accepted). */
  async countMembers(tx: Prisma.TransactionClient, organizationId: string): Promise<number> {
    const rows = await tx.userRole.findMany({
      where: { organizationId },
      distinct: ['userId'],
      select: { userId: true },
    });
    return rows.length;
  }

  private async assertOrganizationExists(organizationId: string): Promise<void> {
    if (!UUID_RE.test(organizationId)) {
      throw new NotFoundException('Organization not found');
    }
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
  }
}
