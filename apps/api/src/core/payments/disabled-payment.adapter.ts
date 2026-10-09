import { ServiceUnavailableException } from '@nestjs/common';
import type {
  CollectionResult,
  CreateCollectionInput,
  CreatePayoutInput,
  NormalizedPayoutWebhookEvent,
  NormalizedWebhookEvent,
  PaymentPort,
  PaymentStatus,
  PayoutResult,
  WebhookVerificationContext,
} from '@adoptafacil/contracts';

/**
 * PaymentPort bound when PAYMENT_DRIVER=disabled (Ola 1, R0-1, SEC-002): no
 * money moves and no webhook is ever trusted. Every call refuses with 503.
 * This is the production value while donations and sponsorships stay off
 * (decisions D1–D7: no real money until the PSP confirms in writing and the
 * lawyer reviews). The fake adapter, which approved any unsigned webhook,
 * can no longer boot in production.
 */
export class DisabledPaymentAdapter implements PaymentPort {
  private refuse(): never {
    throw new ServiceUnavailableException('Payments are not enabled.');
  }

  async createCollection(_input: CreateCollectionInput): Promise<CollectionResult> {
    return this.refuse();
  }

  async getCollectionStatus(_collectionId: string): Promise<PaymentStatus> {
    return this.refuse();
  }

  async verifyAndNormalizeWebhook(
    _payload: unknown,
    _signature: string,
    _context?: WebhookVerificationContext,
  ): Promise<NormalizedWebhookEvent> {
    return this.refuse();
  }

  async createPayout(_input: CreatePayoutInput): Promise<PayoutResult> {
    return this.refuse();
  }

  async verifyAndNormalizePayoutWebhook(
    _payload: unknown,
    _signature: string,
    _context?: WebhookVerificationContext,
  ): Promise<NormalizedPayoutWebhookEvent> {
    return this.refuse();
  }
}
