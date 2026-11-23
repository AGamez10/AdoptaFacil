import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AlertsService } from '../../core/observability/alerts.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DonationsService } from './donations.service';
import {
  RECONCILE_DAILY_WINDOW_HOURS,
  RECONCILE_MIN_AGE_MINUTES,
  RECONCILE_PENDING_WINDOW_HOURS,
} from './payment-reconciliation.constants';

export interface ReconcileRunResult {
  organizations: number;
  fetched: number;
  settled: number;
  failed: number;
}

/**
 * Automatic reconciliation with Mercado Pago (go/no-go audit 2026-11-23, B3:
 * "no payment is lost"). If Mercado Pago's notification never reached the API
 * (server down, deploy, network), the donation stays pending although the
 * shelter already has the money. This re-reads, with each shelter's OWN token,
 * the payments of its account and applies what is missing — exactly what the
 * "Releer Mercado Pago" button of accounting does, now without anyone pressing
 * it. Read-only on Mercado Pago: nothing is charged, refunded or moved.
 *
 *   - `pending`: orgs with a donation pending for > 10 min (every 15 min).
 *   - `daily`: every connected org (refunds and chargebacks of the last days).
 */
@Injectable()
export class PaymentReconciliationService {
  private readonly logger = new Logger('PaymentReconciliation');

  constructor(
    private readonly prisma: PrismaService,
    private readonly donations: DonationsService,
    @Optional() private readonly alerts?: AlertsService,
  ) {}

  async run(mode: 'pending' | 'daily', now = new Date()): Promise<ReconcileRunResult> {
    const onlyPending = mode === 'pending';
    const windowHours = onlyPending ? RECONCILE_PENDING_WINDOW_HOURS : RECONCILE_DAILY_WINDOW_HOURS;
    const rows = await this.prisma.$queryRaw<{ organization_id: string }[]>(Prisma.sql`
      SELECT organization_id FROM mercadopago_reconciliation_candidates(
        ${onlyPending}::boolean, ${RECONCILE_MIN_AGE_MINUTES}::int, ${windowHours}::int)
    `);
    const from = new Date(now.getTime() - windowHours * 3_600_000);
    const result: ReconcileRunResult = {
      organizations: rows.length,
      fetched: 0,
      settled: 0,
      failed: 0,
    };
    for (const { organization_id: organizationId } of rows) {
      try {
        const { fetched, settled } = await this.donations.rereadMercadoPagoPayments(
          organizationId,
          from,
          now,
        );
        result.fetched += fetched;
        result.settled += settled;
        if (settled > 0) {
          this.logger.warn(
            `Conciliación: ${settled} pago(s) aprobados en Mercado Pago que no habían llegado (org ${organizationId})`,
          );
        }
      } catch (error) {
        result.failed += 1;
        this.logger.warn(
          `Conciliación falló para org ${organizationId}: ${(error as Error).message}`,
        );
      }
    }
    this.logger.log(
      `payment-reconcile ${mode}: ${result.organizations} org(s), ${result.fetched} pago(s) leídos, ` +
        `${result.settled} recuperado(s), ${result.failed} con error`,
    );
    if (result.failed > 0) {
      await this.alerts?.notify(
        `reconcile:${mode}:failed`,
        `Conciliación de pagos (${mode}): ${result.failed} de ${result.organizations} organizaciones no se pudieron releer en Mercado Pago. Revisa los logs del worker.`,
      );
    }
    if (result.settled > 0) {
      // Not an error (the money is safe now), but someone should know the
      // notification URL lost payments: it usually means downtime or a bad webhook.
      await this.alerts?.notify(
        `reconcile:${mode}:recovered`,
        `Conciliación de pagos: se recuperaron ${result.settled} pago(s) aprobados cuyo aviso de Mercado Pago no había llegado. Revisa el webhook y la disponibilidad.`,
      );
    }
    return result;
  }
}
