import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { MercadoPagoAccountsModule } from './mercadopago-accounts.module';
import { MercadoPagoConnectController } from './mercadopago-connect.controller';

/**
 * M15 · Pagos (ADR-PAG-003, cobro directo sin custodia). Owns
 * `organization_mercadopago_connections` (RLS): the org's OWN Mercado Pago
 * account connected by OAuth (`/org/mercadopago/*`), tokens encrypted at rest
 * and renewed by a daily scan (`MercadoPagoAccountsModule`). Every Mercado Pago
 * donation is created with that org's token, so the money lands directly in
 * the organization's account: AdoptaFácil holds no balance, so there are no
 * payouts, bank accounts or dispersions.
 *
 * PaymentPort: consumed from the GLOBAL `PAYMENT_PORT` provider (core
 * `PaymentModule`, @Global).
 */
@Module({
  imports: [AuthModule, MercadoPagoAccountsModule],
  controllers: [MercadoPagoConnectController],
})
export class PaymentsModule {}
