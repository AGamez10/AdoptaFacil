import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CollectionResult, PaymentPort } from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import { PAYMENT_PORT } from '../../core/payments/payment.port';
import { MercadoPagoConnectionsService } from '../payments/mercadopago-connections.service';

export interface SponsorshipCheckoutInput {
  organizationId: string;
  sponsorshipId: string;
  /** Integer COP pesos of the plan (what must reach the organization). */
  amount: number;
  /** The billing attempt's own key: one attempt, one order. */
  idempotencyKey: string;
  /** The link dies with its attempt. */
  expiresAt: Date;
  payerEmail?: string;
}

/** Shown when the organization has not connected its Mercado Pago account. */
export const SPONSORSHIP_NO_COLLECTOR_MESSAGE =
  'Esta organización todavía no recibe pagos en línea. Podrás apadrinar en cuanto conecte su cuenta de Mercado Pago.';

/**
 * Opens the checkout of ONE sponsorship billing attempt (first month, "Pagar
 * este mes" or the recovery after a suspension). PAY-001 / ADR-PAG-003: the
 * order is created with the ORGANIZATION's own Mercado Pago grant, so the
 * padrino pays the organization directly; AdoptaFácil never holds the money
 * and never falls back to its own account.
 */
@Injectable()
export class SponsorshipCheckoutService {
  private readonly logger = new Logger(SponsorshipCheckoutService.name);
  private readonly requiresCollector: boolean;

  constructor(
    @Inject(PAYMENT_PORT) private readonly payments: PaymentPort,
    config: ConfigService<Env, true>,
    @Optional() private readonly connections?: MercadoPagoConnectionsService,
  ) {
    this.requiresCollector = config.get('PAYMENT_DRIVER', { infer: true }) === 'mercadopago';
  }

  async open(input: SponsorshipCheckoutInput): Promise<CollectionResult> {
    const mercadopagoCollector = this.requiresCollector
      ? await this.connections?.resolveCollector(input.organizationId)
      : undefined;
    if (this.requiresCollector && !mercadopagoCollector) {
      throw new ConflictException(SPONSORSHIP_NO_COLLECTOR_MESSAGE);
    }
    try {
      return await this.payments.createCollection({
        intendedAmount: input.amount,
        currency: 'COP',
        concept: { kind: 'sponsorship', id: input.sponsorshipId },
        idempotencyKey: input.idempotencyKey,
        expiresAt: input.expiresAt,
        ...(input.payerEmail ? { payer: { email: input.payerEmail } } : {}),
        mercadopagoCollector,
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // Mercado Pago's own reason goes to the log; the person gets plain words.
      this.logger.error(
        `Sponsorship checkout for ${input.sponsorshipId}: ${(error as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'No pudimos abrir el pago en Mercado Pago. Intenta de nuevo en unos minutos.',
      );
    }
  }
}
