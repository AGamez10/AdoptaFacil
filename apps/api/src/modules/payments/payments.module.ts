import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { BankAccountsController } from './bank-accounts.controller';
import { BankAccountsService } from './bank-accounts.service';
import { EpaycoConnectController } from './epayco-connect.controller';
import { EpaycoConnectService } from './epayco-connect.service';
import { EPAYCO_KEYS_ENCRYPTION_KEY, loadEpaycoKeysEncryptionKey } from './epayco-keys-crypto';
import { PayoutsController } from './payouts.controller';
import { PayoutsProcessor } from './payouts.processor';
import { PayoutsService } from './payouts.service';
import { PAYOUTS_QUEUE } from './payouts.constants';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';

/**
 * M15b · Dispersión T+1 (RF26) — Fase 2, BLOQUEADA (sin adaptador de payouts
 * real: Wompi y Mercado Pago fueron retirados; con ePayco el dinero llega
 * directo a la cuenta de cada organización). Owns:
 *   - `organization_bank_accounts` (RLS) — the org's own registered payout
 *     destination (Owner/Administrator self-service, `/org/payout-bank-account`).
 *   - `payouts` (RLS) — one row per dispersión attempt, dispatched through a
 *     BullMQ worker (staggered retry on gateway failure) and settled by the
 *     gateway's payout webhook (`/payments/payouts/webhook`, public).
 *   - `/platform/payouts` — PlatformAdmin/PlatformSuperAdmin trigger + inspect
 *     (treasury operation; an org never self-triggers its own payout).
 *   - `/platform/reconciliation` (F-5, RF26) — read-only report crossing
 *     recaudo (donations) vs. dispersión (payouts), by org and calendar
 *     month; no table of its own, aggregates over the two above.
 *   - `organization_epayco_accounts` (RLS, ADR-PAG-002) — the org's OWN ePayco
 *     merchant keys (`/org/epayco/connect|status`, Owner/Administrator), the
 *     secrets encrypted at rest. Every ePayco checkout is created with them.
 *     (Mercado Pago's OAuth connect + token refresh were retired 2026-10-17;
 *     its table was dropped by migration 20261017110000.)
 *
 * PaymentPort: consumed from the GLOBAL `PAYMENT_PORT` provider (core
 * `PaymentModule`, @Global) — no local binding, same convention as
 * `DonationsModule`. The BullMQ queue runs on the reusable global
 * BullMQ↔Redis connection (`QueueModule`, @Global).
 */
@Module({
  imports: [AuthModule, BullModule.registerQueue({ name: PAYOUTS_QUEUE })],
  controllers: [
    BankAccountsController,
    PayoutsController,
    ReconciliationController,
    EpaycoConnectController,
  ],
  providers: [
    BankAccountsService,
    PayoutsService,
    PayoutsProcessor,
    ReconciliationService,
    EpaycoConnectService,
    { provide: EPAYCO_KEYS_ENCRYPTION_KEY, useFactory: loadEpaycoKeysEncryptionKey },
  ],
})
export class PaymentsModule {}
