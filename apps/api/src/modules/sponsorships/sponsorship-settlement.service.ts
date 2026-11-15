import { ForbiddenException, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  computeBreakdown,
  type NormalizedWebhookEvent,
  type PaymentPort,
  type WebhookVerificationContext,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { PAYMENT_PORT } from '../../core/payments/payment.port';
import { PrismaService } from '../../prisma/prisma.service';
import { MercadoPagoConnectionsService } from '../payments/mercadopago-connections.service';
import {
  type PendingAttemptRow,
  SponsorshipPaymentPollerService,
} from './sponsorship-payment-poller.service';

/** What happened with a notification about a sponsorship order. */
export interface SponsorshipSettlementOutcome {
  /** The reference is a sponsorship attempt of ours (false = not ours, try elsewhere). */
  matched: boolean;
  /** The month was confirmed as paid by this notification. */
  confirmed: boolean;
}

/**
 * Mercado Pago Orders notification for a SPONSORSHIP month. Orders has one
 * notification URL for the whole application (the one already registered for
 * donations), so `DonationsService` hands over any reference that is not a
 * donation. Same trust rules as a donation: the signature must verify, the
 * order is READ BACK with the organization's own token (a forged reference
 * fails there), and the amount, currency and receiving account must match
 * what the plan charges. Only then is the month marked paid.
 */
@Injectable()
export class SponsorshipSettlementService {
  private readonly logger = new Logger(SponsorshipSettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly confirmations: SponsorshipPaymentPollerService,
    @Inject(PAYMENT_PORT) private readonly payments: PaymentPort,
    @Optional() private readonly connections?: MercadoPagoConnectionsService,
  ) {}

  async applyMercadoPagoOrder(
    reference: string,
    payload: unknown,
    signature: string,
    context: WebhookVerificationContext = {},
  ): Promise<SponsorshipSettlementOutcome> {
    const rows = await this.prisma.$queryRaw<PendingAttemptRow[]>(Prisma.sql`
      SELECT * FROM sponsorship_pending_payment_attempts() WHERE collection_id = ${reference}
    `);
    const row = rows[0];
    if (!row) return { matched: false, confirmed: false };

    const mercadopagoCollector = await this.connections?.resolveCollector(row.organization_id);
    let event: NormalizedWebhookEvent;
    try {
      event = await this.payments.verifyAndNormalizeWebhook(payload, signature, {
        ...context,
        mercadopagoCollector,
      });
    } catch (error) {
      this.logger.warn(`Aviso de apadrinamiento rechazado: ${(error as Error).message}`);
      throw new ForbiddenException('Webhook verification failed.');
    }
    if (event.collectionId !== reference || event.status !== 'approved') {
      return { matched: true, confirmed: false };
    }

    const planAmount = await this.prisma.withOrgContext(row.organization_id, async (tx) => {
      const payment = await tx.sponsorshipPayment.findUnique({
        where: { id: row.sponsorship_payment_id },
        select: { sponsorship: { select: { plan: { select: { amount: true } } } } },
      });
      return payment?.sponsorship.plan.amount;
    });
    const expected =
      planAmount === undefined ? undefined : computeBreakdown(planAmount).amountCharged;
    const sameAmount = expected !== undefined && event.amountCharged === expected;
    const sameCurrency = !event.currency || event.currency === 'COP';
    const sameAccount =
      !!mercadopagoCollector && event.receiverAccountId === mercadopagoCollector.userId;
    if (!sameAmount || !sameCurrency || !sameAccount) {
      // PAY-003: never mark a month paid on a mismatch; leave a trace to review.
      await this.audit.record({
        organizationId: row.organization_id,
        actorUserId: null,
        action: 'sponsorship.billing_payment_mismatch',
        entityType: 'sponsorship_payment',
        entityId: row.sponsorship_payment_id,
        metadata: {
          expectedAmount: expected ?? null,
          reportedAmount: event.amountCharged ?? null,
          currency: event.currency ?? null,
          sameAccount,
        },
      });
      return { matched: true, confirmed: false };
    }

    await this.confirmations.confirmAttempt(row);
    return { matched: true, confirmed: true };
  }
}
