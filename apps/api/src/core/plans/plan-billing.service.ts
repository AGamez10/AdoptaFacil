import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PLAN_CATALOG,
  mercadoPagoPreapprovalStatus,
  parsePlanSubscriptionReference,
  planSubscriptionReference,
  priceWithIva,
  type PlanCheckoutView,
  type PlanKey,
  type WebhookVerificationContext,
} from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../auth/auth.types';
import {
  MercadoPagoBillingClient,
  type MercadoPagoPreapproval,
} from '../payments/mercadopago-billing.client';
import {
  assertMercadoPagoSignature,
  mercadoPagoNotificationDataId,
  mercadoPagoNotificationType,
} from '../payments/mercadopago-payment.adapter';
import { PrismaService } from '../../prisma/prisma.service';

type PaidPlan = Exclude<PlanKey, 'free'>;

/** Monthly amount (COP, IVA included) after the founding discount. Pure. */
export function planMonthlyAmount(plan: PaidPlan, discountPercent: number): number {
  const base = PLAN_CATALOG[plan].monthlyPriceCop;
  const discount = Math.min(Math.max(discountPercent, 0), 100);
  return priceWithIva(Math.round((base * (100 - discount)) / 100));
}

/** One calendar month after `from` (UTC). Pure. */
export function addOneMonth(from: Date): Date {
  const d = new Date(from.getTime());
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

export interface PlanWebhookOutcome {
  applied: boolean;
}

/**
 * ADR-PAG-003 — AdoptaFácil charges its plans with ITS OWN Mercado Pago
 * account (monthly subscription / preapproval). This is AdoptaFácil's revenue
 * for the software: it never touches a donation, and an organization's own
 * Mercado Pago grant is never used here.
 *
 * Flow: Owner/Administrator starts a checkout → Mercado Pago asks the payer to
 * authorize the monthly charge → signed notifications (`subscription_preapproval`
 * and `subscription_authorized_payment`) → read back with the PLATFORM token →
 * the org's subscription row is activated/extended/cancelled, audited.
 * Idempotent: every write is derived from Mercado Pago's own dates, so a
 * repeated notification yields the same row.
 */
@Injectable()
export class PlanBillingService {
  private readonly logger = new Logger('PlanBilling');
  private readonly webBaseUrl: string;
  private readonly webhookSecret: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly billing: MercadoPagoBillingClient,
    config: ConfigService<Env, true>,
  ) {
    this.webBaseUrl = (config.get('WEB_BASE_URL', { infer: true }) as string).replace(/\/+$/, '');
    this.webhookSecret = config.get('MERCADOPAGO_WEBHOOK_SECRET', { infer: true }) as
      string | undefined;
  }

  /** `POST /org/plan/checkout` (Owner/Administrator of the caller's org). */
  async startCheckout(actor: RequestUser, plan: PaidPlan): Promise<PlanCheckoutView> {
    if (!this.billing.isConfigured()) {
      throw new ServiceUnavailableException(
        'El pago de planes en línea todavía no está disponible. Escríbenos y lo activamos a mano.',
      );
    }
    const organizationId = actor.organizationId;
    if (!organizationId) throw new ForbiddenException('Missing tenant context');
    if (!actor.email) {
      throw new BadRequestException('Tu cuenta necesita un correo para pagar el plan.');
    }
    const current = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.organizationSubscription.findUnique({
        where: { organizationId },
        select: { discountPercent: true },
      }),
    );
    const monthlyAmountCop = planMonthlyAmount(plan, current?.discountPercent ?? 0);
    const reference = planSubscriptionReference(organizationId, plan);
    const { id, checkoutUrl } = await this.billing.createMonthlySubscription({
      reason: `AdoptaFácil · Plan ${PLAN_CATALOG[plan].name} (mensual)`,
      externalReference: reference,
      payerEmail: actor.email,
      amountCop: monthlyAmountCop,
      backUrl: `${this.webBaseUrl}/organizacion/plan?pago=mercadopago`,
      // A new checkout per click; Mercado Pago dedups only true retries.
      idempotencyKey: `${reference}:${Date.now()}`,
    });
    await this.audit.record({
      organizationId,
      actorUserId: actor.id,
      action: 'organization.plan_checkout_started',
      entityType: 'organization_subscription',
      entityId: organizationId,
      metadata: { plan, monthlyAmountCop, provider: 'mercadopago', preapprovalId: id },
    });
    return { plan, monthlyAmountCop, checkoutUrl };
  }

  /**
   * `POST /billing/webhooks/mercadopago` (PUBLIC). Verifies `x-signature`,
   * reads the resource back with the PLATFORM token and applies it. Anything
   * that is not a subscription notification is acknowledged without effect.
   * Throws (→ 403) on a bad signature or a failed read-back.
   */
  async applyWebhook(
    payload: unknown,
    signature: string,
    context: WebhookVerificationContext = {},
  ): Promise<PlanWebhookOutcome> {
    if (!this.billing.isConfigured()) {
      throw new NotFoundException();
    }
    const type = mercadoPagoNotificationType(payload, context.query);
    if (type !== 'subscription_preapproval' && type !== 'subscription_authorized_payment') {
      return { applied: false };
    }
    const dataId = mercadoPagoNotificationDataId(payload, context.query);
    assertMercadoPagoSignature(
      this.webhookSecret,
      signature,
      context.headers?.['x-request-id'],
      dataId,
    );

    if (type === 'subscription_preapproval') {
      const preapproval = await this.billing.getPreapproval(dataId as string);
      return this.applyPreapproval(preapproval, null);
    }
    const charge = await this.billing.getAuthorizedPayment(dataId as string);
    if (!charge.preapprovalId || charge.paymentStatus !== 'approved' || !charge.chargedAt) {
      return { applied: false };
    }
    const preapproval = await this.billing.getPreapproval(charge.preapprovalId);
    if (charge.amount !== preapproval.amount || charge.currency !== 'COP') {
      this.logger.warn(`Plan charge ${charge.id} does not match its subscription`);
      return { applied: false };
    }
    return this.applyPreapproval(preapproval, addOneMonth(charge.chargedAt));
  }

  /**
   * Apply a read-back preapproval. `paidThrough` = end of the period a
   * confirmed charge covers (only for `subscription_authorized_payment`).
   */
  private async applyPreapproval(
    preapproval: MercadoPagoPreapproval,
    paidThrough: Date | null,
  ): Promise<PlanWebhookOutcome> {
    const ref = parsePlanSubscriptionReference(preapproval.externalReference);
    if (!ref) {
      this.logger.warn(`Preapproval ${preapproval.id} is not an AdoptaFácil plan`);
      return { applied: false };
    }
    const status = paidThrough ? 'active' : mercadoPagoPreapprovalStatus(preapproval.status);
    if (!status) return { applied: false };

    const org = await this.prisma.organization.findUnique({
      where: { id: ref.organizationId },
      select: { id: true },
    });
    if (!org) return { applied: false };

    return this.prisma.withOrgContext(ref.organizationId, async (tx) => {
      const previous = await tx.organizationSubscription.findUnique({
        where: { organizationId: ref.organizationId },
      });
      const expected = planMonthlyAmount(ref.plan, previous?.discountPercent ?? 0);
      const monthly = preapproval.frequency === 1 && preapproval.frequencyType === 'months';
      if (preapproval.amount !== expected || preapproval.currency !== 'COP' || !monthly) {
        await this.audit.recordWithTx(tx, {
          organizationId: ref.organizationId,
          actorUserId: null,
          action: 'organization.plan_payment_mismatch',
          entityType: 'organization_subscription',
          entityId: ref.organizationId,
          metadata: { preapprovalId: preapproval.id, plan: ref.plan, expected },
        });
        return { applied: false };
      }
      // Cancelling/pausing only touches the subscription THIS preapproval made.
      if (
        status !== 'active' &&
        (previous?.provider !== 'mercadopago' || previous.providerReference !== preapproval.id)
      ) {
        return { applied: false };
      }

      const now = new Date();
      const candidates = [
        previous?.currentPeriodEnd ?? null,
        paidThrough,
        status === 'active' && !previous?.currentPeriodEnd && !paidThrough
          ? (preapproval.nextPaymentDate ?? addOneMonth(now))
          : null,
      ].filter((d): d is Date => d instanceof Date);
      const currentPeriodEnd =
        candidates.length > 0 ? new Date(Math.max(...candidates.map((d) => d.getTime()))) : null;

      const data = {
        plan: ref.plan,
        status,
        provider: 'mercadopago',
        providerReference: preapproval.id,
        currentPeriodEnd,
      };
      const unchanged =
        previous &&
        previous.plan === data.plan &&
        previous.status === data.status &&
        previous.provider === data.provider &&
        previous.providerReference === data.providerReference &&
        (previous.currentPeriodEnd?.getTime() ?? null) === (currentPeriodEnd?.getTime() ?? null);
      if (unchanged) return { applied: false };

      const row = await tx.organizationSubscription.upsert({
        where: { organizationId: ref.organizationId },
        create: { organizationId: ref.organizationId, ...data },
        update: data,
      });
      await this.audit.recordWithTx(tx, {
        organizationId: ref.organizationId,
        actorUserId: null,
        action: 'organization.plan_changed',
        entityType: 'organization_subscription',
        entityId: row.id,
        metadata: {
          fromPlan: previous?.plan ?? null,
          fromStatus: previous?.status ?? null,
          plan: row.plan,
          status: row.status,
          currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
          provider: 'mercadopago',
          providerReference: preapproval.id,
        },
      });
      return { applied: true };
    });
  }
}
