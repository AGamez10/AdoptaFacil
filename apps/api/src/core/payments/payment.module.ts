import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FakePaymentAdapter } from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import { DisabledPaymentAdapter } from './disabled-payment.adapter';
import { PAYMENT_PORT } from './payment.port';

/**
 * Shared PaymentPort provider (T-052). Global so any module injects PAYMENT_PORT
 * without re-binding it — mirrors STORAGE_PORT / NOTIFICATION_PORT (T-107).
 *
 * The adapter is chosen by PAYMENT_DRIVER ('fake' by default). The Fake adapter
 * is IMPORTED from @adoptafacil/contracts (dependency-free, deterministic) — NOT
 * copied here, so Fabián's `computeBreakdown` stays the single source of the
 * commission math. `disabled` refuses every call.
 *
 * EXTENSION POINT: there is no real gateway today (the previous ones were
 * retired by the owner). A real adapter implements `PaymentPort` from
 * @adoptafacil/contracts, gets its own `PAYMENT_DRIVER` value in
 * env.validation.ts (+ REAL_PAYMENT_DRIVERS) and one branch here; no consumer
 * changes.
 */
@Global()
@Module({
  providers: [
    {
      provide: PAYMENT_PORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const driver = config.get('PAYMENT_DRIVER', { infer: true }) ?? 'fake';
        if (driver === 'disabled') {
          return new DisabledPaymentAdapter();
        }
        // Dev/test only: env validation refuses 'fake' in production (R0-1).
        return new FakePaymentAdapter();
      },
    },
  ],
  exports: [PAYMENT_PORT],
})
export class PaymentModule {}
