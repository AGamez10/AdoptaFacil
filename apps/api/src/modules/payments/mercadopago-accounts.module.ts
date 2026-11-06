import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MercadoPagoOAuthClient } from '../../core/payments/mercadopago-oauth.client';
import { MERCADOPAGO_TOKEN_REFRESH_QUEUE } from './mercadopago-connect.constants';
import { MercadoPagoConnectionsService } from './mercadopago-connections.service';
import {
  loadMercadoPagoTokensEncryptionKey,
  MERCADOPAGO_TOKENS_ENCRYPTION_KEY,
} from './mercadopago-token-crypto';
import { MercadoPagoTokenRefreshProcessor } from './mercadopago-token-refresh.processor';
import { MercadoPagoTokenRefreshScheduler } from './mercadopago-token-refresh.scheduler';

/**
 * ADR-PAG-003 — the organizations' Mercado Pago connections as a reusable
 * unit: `PaymentsModule` exposes the connect endpoints and `DonationsModule`
 * resolves the collector of each charge from here. Owns the token-renewal
 * queue (shared global BullMQ↔Redis connection).
 */
@Module({
  imports: [BullModule.registerQueue({ name: MERCADOPAGO_TOKEN_REFRESH_QUEUE })],
  providers: [
    MercadoPagoOAuthClient,
    MercadoPagoConnectionsService,
    MercadoPagoTokenRefreshScheduler,
    MercadoPagoTokenRefreshProcessor,
    { provide: MERCADOPAGO_TOKENS_ENCRYPTION_KEY, useFactory: loadMercadoPagoTokensEncryptionKey },
  ],
  exports: [MercadoPagoConnectionsService, MercadoPagoOAuthClient],
})
export class MercadoPagoAccountsModule {}
