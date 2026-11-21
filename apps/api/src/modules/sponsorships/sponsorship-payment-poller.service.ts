import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { BILLING_FAILURE_SUSPENSION_REASON, SponsorshipStatus } from '@adoptafacil/contracts';
import type { PaymentPort } from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { InboxService } from '../../core/notifications/inbox/inbox.service';
import type { Env } from '../../config/env.validation';
import { PAYMENT_PORT } from '../../core/payments/payment.port';
import { PrismaService } from '../../prisma/prisma.service';
import { SponsorshipsService } from './sponsorships.service';

/** Row from `sponsorship_pending_payment_attempts()` (snake_case, raw SQL). */
const copFormat = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

/** `2026-11` → "noviembre de 2026". */
function monthLabel(period: string): string {
  const [year, month] = period.split('-').map(Number);
  if (!year || !month) return period;
  return new Intl.DateTimeFormat('es-CO', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export interface PendingAttemptRow {
  attempt_id: string;
  organization_id: string;
  sponsorship_payment_id: string;
  collection_id: string;
}

/**
 * Payment CONFIRMATION for the recurring-billing ledger (S-5-REDISEÑO, M07/
 * RF17, T-057) — by POLLING `PaymentPort.getCollectionStatus()`, not the
 * gateway webhook. The single webhook the gateway calls is already wired inside
 * `donations/**` with a hardcoded `if (concept_kind === 'campaign')` branch
 * (Fabián's domain) — extending it for `'sponsorship'` would mean editing
 * that module, out of scope for this task (confirmed with the user,
 * 2026-08-24). This poller runs frequently (see
 * `SPONSORSHIP_PAYMENT_POLL_INTERVAL_MS`) so confirmation stays close to
 * real time without that cross-domain change — still "consume PaymentPort,
 * read-only/call, no changes to its code" per this task's own Cruce.
 *
 * On `approved`: the attempt + its period are marked `paid` immediately, any
 * remaining ladder for that period stops (it is no longer `pending`, so the
 * daily scan's `sponsorship_open_payment_periods()` no longer returns it),
 * and — if the sponsorship had been auto-suspended for billing failure — it
 * is REACTIVATED automatically (Objetivo 6), unlike a manual suspension by
 * the organization, which still needs a manual reactivation on their side.
 */
@Injectable()
export class SponsorshipPaymentPollerService {
  private readonly logger = new Logger(SponsorshipPaymentPollerService.name);

  /** Mercado Pago confirms through its signed notification
   *  (`SponsorshipSettlementService`); its adapter has no status read. */
  private readonly polls: boolean;
  private readonly sponsorshipsLink: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sponsorships: SponsorshipsService,
    @Inject(PAYMENT_PORT) private readonly payments: PaymentPort,
    config: ConfigService<Env, true>,
    @Optional() private readonly inbox?: InboxService,
  ) {
    this.polls = config.get('PAYMENT_DRIVER', { infer: true }) !== 'mercadopago';
    this.sponsorshipsLink = `${(config.get('WEB_BASE_URL', { infer: true }) ?? 'http://localhost:5173').replace(/\/+$/, '')}/apadrinar`;
  }

  async pollPending(): Promise<void> {
    if (!this.polls) return;
    const rows = await this.prisma.$queryRaw<PendingAttemptRow[]>(
      Prisma.sql`SELECT * FROM sponsorship_pending_payment_attempts()`,
    );
    for (const row of rows) {
      await this.pollOne(row);
    }
  }

  private async pollOne(row: PendingAttemptRow): Promise<void> {
    let status: string;
    try {
      status = await this.payments.getCollectionStatus(row.collection_id);
    } catch (error) {
      this.logger.warn(
        `getCollectionStatus failed for ${row.collection_id}: ${(error as Error).message}`,
      );
      return;
    }
    if (status !== 'approved') {
      return; // still pending/declined — the ladder handles expiry, not this poller
    }
    await this.confirmAttempt(row);
  }

  /**
   * Marks one attempt and its period as paid (idempotent), reactivates a
   * billing-failure suspension, and welcomes the padrino on their FIRST paid
   * month. Shared by this poller, the Mercado Pago notification and a driver
   * that settles on the spot.
   */
  async confirmAttempt(row: PendingAttemptRow): Promise<void> {
    const confirmed = await this.prisma.withOrgContext(row.organization_id, async (tx) => {
      const attempt = await tx.sponsorshipPaymentAttempt.findUnique({
        where: { id: row.attempt_id },
      });
      if (!attempt || attempt.result !== 'pending') {
        return null; // already resolved by a previous poll run (idempotent)
      }
      await tx.sponsorshipPaymentAttempt.update({
        where: { id: row.attempt_id },
        data: { result: 'paid' },
      });
      const payment = await tx.sponsorshipPayment.update({
        where: { id: row.sponsorship_payment_id },
        data: { status: 'paid', paidAt: new Date() },
      });
      await this.audit.recordWithTx(tx, {
        organizationId: row.organization_id,
        actorUserId: null,
        action: 'sponsorship.billing_payment_confirmed',
        entityType: 'sponsorship_payment',
        entityId: payment.id,
        metadata: { attemptId: row.attempt_id },
      });

      const sponsorship = await tx.sponsorship.findUnique({
        where: { id: payment.sponsorshipId },
      });
      if (sponsorship?.status === SponsorshipStatus.Suspended) {
        // Only auto-reactivate a BILLING-failure suspension — a manual
        // suspension by the organization still needs manual reactivation.
        const lastSuspension = await tx.sponsorshipStatusHistory.findFirst({
          where: { sponsorshipId: sponsorship.id, toStatus: SponsorshipStatus.Suspended },
          orderBy: { createdAt: 'desc' },
        });
        if (lastSuspension?.reason === BILLING_FAILURE_SUSPENSION_REASON) {
          await this.sponsorships.applySystemTransition(
            tx,
            row.organization_id,
            sponsorship.id,
            SponsorshipStatus.Active,
            'Pago confirmado tras suspensión automática por impago.',
          );
        }
      }
      const paidPeriods = await tx.sponsorshipPayment.count({
        where: { sponsorshipId: payment.sponsorshipId, status: 'paid' },
      });
      return sponsorship ? { sponsorship, period: payment.period, first: paidPeriods === 1 } : null;
    });

    if (confirmed) {
      await this.notifyConfirmed(row.organization_id, confirmed);
    }
  }

  /**
   * The padrino and the organization's team hear about every confirmed month
   * (bell + the padrino's email). The first month carries the welcome.
   * Best-effort: never undoes the confirmation.
   */
  private async notifyConfirmed(
    organizationId: string,
    confirmed: {
      sponsorship: { id: string; sponsorUserId: string; animalId: string; planId: string };
      period: string;
      first: boolean;
    },
  ): Promise<void> {
    if (!this.inbox) return;
    try {
      const { sponsorship, period, first } = confirmed;
      const [org, details] = await Promise.all([
        this.prisma.organization.findUnique({
          where: { id: organizationId },
          select: { name: true },
        }),
        this.prisma.withOrgContext(organizationId, async (tx) => ({
          animal: await tx.animal.findUnique({
            where: { id: sponsorship.animalId },
            select: { name: true },
          }),
          plan: await tx.sponsorshipPlan.findUnique({
            where: { id: sponsorship.planId },
            select: { amount: true },
          }),
        })),
      ]);
      const animal = details.animal?.name ?? 'tu ahijado';
      const organization = org?.name ?? 'la organización';
      const money = copFormat.format(details.plan?.amount ?? 0);
      const month = monthLabel(period);
      await this.inbox.toUser(
        sponsorship.sponsorUserId,
        {
          kind: first ? 'sponsorships.welcome' : 'sponsorships.payment_confirmed',
          tone: 'kudos',
          title: first
            ? `¡Desde hoy apadrinas a ${animal}!`
            : `Recibimos tu apadrinamiento de ${month} para ${animal}`,
          body: `Tu pago de ${money} llegó directo a ${organization}. Puedes verlo en "Mis apadrinamientos".`,
          href: '/apadrinar',
          dedupeKey: `sponsorship_paid:${sponsorship.id}:${period}`,
        },
        ({ displayName }) => ({
          subject: first
            ? `¡Gracias, ${displayName}! Ya apadrinas a ${animal}`
            : `Recibimos tu apadrinamiento de ${month}`,
          body: first
            ? `¡Gracias! Desde hoy apadrinas a ${animal} en ${organization} con ${money} al mes. Tu pago llegó directo a la organización. Cada mes te avisaremos cuando toque el siguiente pago; lo haces desde "Mis apadrinamientos".`
            : `Tu pago de ${money} del apadrinamiento de ${animal} (${month}) llegó directo a ${organization}. ¡Gracias por seguir ahí!`,
          // El primero comparte la clave con la bienvenida de SponsorshipsService:
          // la cola descarta el repetido y la persona recibe UNA bienvenida.
          idempotencyKey: first
            ? `sponsorship.welcome:${sponsorship.id}`
            : `sponsorship.payment_received:${sponsorship.id}:${period}`,
          template: first
            ? {
                event: 'sponsorship.welcome',
                organizationName: org?.name ?? undefined,
                organizationId,
                data: {
                  animal,
                  organizacion: organization,
                  monto: details.plan?.amount ?? 0,
                  enlace: this.sponsorshipsLink,
                },
              }
            : {
                event: 'sponsorship.payment_received',
                organizationName: org?.name ?? undefined,
                organizationId,
                data: {
                  nombre: displayName,
                  animal,
                  organizacion: organization,
                  monto: details.plan?.amount ?? 0,
                  mes: month,
                  enlace: this.sponsorshipsLink,
                },
              },
        }),
      );
      await this.inbox.toOrgStaff(organizationId, {
        kind: 'sponsorships.payment_received',
        tone: 'success',
        title: first
          ? `${animal} tiene un nuevo padrino`
          : `Recibieron el apadrinamiento de ${month} de ${animal}`,
        body: `El pago de ${money} llegó a la cuenta de Mercado Pago de la organización.`,
        href: '/organizacion/apadrinamientos',
        dedupeKey: `sponsorship_paid_org:${sponsorship.id}:${period}`,
      });
    } catch (error) {
      this.logger.warn(`Sponsorship payment notice failed: ${(error as Error).message}`);
    }
  }
}
