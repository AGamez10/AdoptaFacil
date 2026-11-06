import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FakePaymentAdapter } from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import { DisabledPaymentAdapter } from './disabled-payment.adapter';
import { PAYMENT_PORT } from './payment.port';
import { EpaycoPaymentAdapter } from './epayco-payment.adapter';
import { MercadoPagoPaymentAdapter } from './mercadopago-payment.adapter';

/**
 * Shared PaymentPort provider (T-052). Global so any module injects PAYMENT_PORT
 * without re-binding it — mirrors STORAGE_PORT / NOTIFICATION_PORT (T-107).
 *
 * The adapter is chosen by PAYMENT_DRIVER ('fake' by default). The Fake adapter
 * is IMPORTED from @adoptafacil/contracts (dependency-free, deterministic) — NOT
 * copied here, so Fabián's `computeBreakdown` stays the single source of the
 * commission math. `mercadopago` (ADR-PAG-003, 2026-11-06) binds Checkout Pro
 * with each organization's OWN OAuth token; `epayco` (ADR-PAG-002) binds the
 * ePayco checkout v2 adapter with the organization's own keys. Both collect
 * directly to the organization (no custody); `disabled` refuses every call.
 */
@Global()
@Module({
  providers: [
    {
      provide: PAYMENT_PORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const driver = config.get('PAYMENT_DRIVER', { infer: true }) ?? 'fake';
        if (driver === 'mercadopago') {
          return new MercadoPagoPaymentAdapter(config);
        }
        if (driver === 'epayco') {
          return new EpaycoPaymentAdapter(config);
        }
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
