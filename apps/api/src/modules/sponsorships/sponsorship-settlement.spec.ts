import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  computeBreakdown,
  type MercadoPagoCollectorCredentials,
  type NormalizedWebhookEvent,
  type PaymentPort,
} from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import type { AuditService } from '../../core/audit/audit.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { MercadoPagoConnectionsService } from '../payments/mercadopago-connections.service';
import {
  SPONSORSHIP_NO_COLLECTOR_MESSAGE,
  SponsorshipCheckoutService,
} from './sponsorship-checkout.service';
import type { SponsorshipPaymentPollerService } from './sponsorship-payment-poller.service';
import { SponsorshipSettlementService } from './sponsorship-settlement.service';

const ORG_ID = 'org-1';
const REF = 'af-0123456789abcdef0123456789abcd';
const PLAN_AMOUNT = 1_000;
const COLLECTOR: MercadoPagoCollectorCredentials = {
  organizationId: ORG_ID,
  userId: '555',
  accessToken: 'APP_USR-secret',
};
const ROW = {
  attempt_id: 'attempt-1',
  organization_id: ORG_ID,
  sponsorship_payment_id: 'payment-1',
  collection_id: REF,
};

function event(overrides: Partial<NormalizedWebhookEvent> = {}): NormalizedWebhookEvent {
  return {
    eventId: 'ORD1',
    collectionId: REF,
    status: 'approved',
    dedupKey: 'mercadopago:ORD1:approved',
    amountCharged: computeBreakdown(PLAN_AMOUNT).amountCharged,
    currency: 'COP',
    receiverAccountId: COLLECTOR.userId,
    ...overrides,
  };
}

function setup(
  options: {
    rows?: unknown[];
    verified?: NormalizedWebhookEvent | Error;
    collector?: MercadoPagoCollectorCredentials;
  } = {},
) {
  const tx = {
    sponsorshipPayment: {
      findUnique: jest.fn(async () => ({ sponsorship: { plan: { amount: PLAN_AMOUNT } } })),
    },
  };
  const prisma = {
    $queryRaw: jest.fn(async () => options.rows ?? [ROW]),
    withOrgContext: jest.fn(async (_org: string, fn: (t: typeof tx) => unknown) => fn(tx)),
  } as unknown as PrismaService;
  const audit = { record: jest.fn(async () => undefined) } as unknown as AuditService;
  const confirmations = {
    confirmAttempt: jest.fn(async () => undefined),
  } as unknown as SponsorshipPaymentPollerService;
  const verify = jest.fn(async () => {
    const verified = options.verified ?? event();
    if (verified instanceof Error) throw verified;
    return verified;
  });
  const payments = { verifyAndNormalizeWebhook: verify } as unknown as PaymentPort;
  const connections = {
    resolveCollector: jest.fn(async () => ('collector' in options ? options.collector : COLLECTOR)),
  } as unknown as MercadoPagoConnectionsService;
  const service = new SponsorshipSettlementService(
    prisma,
    audit,
    confirmations,
    payments,
    connections,
  );
  return { service, confirmations, audit, verify };
}

describe('SponsorshipSettlementService (aviso de Orders de un mes de apadrinamiento)', () => {
  it('ignores a reference that is not a sponsorship attempt of ours', async () => {
    const { service, verify } = setup({ rows: [] });
    await expect(service.applyMercadoPagoOrder(REF, {}, 'sig')).resolves.toEqual({
      matched: false,
      confirmed: false,
    });
    expect(verify).not.toHaveBeenCalled();
  });

  it("confirms the month only when the order, read with the org's token, matches the plan", async () => {
    const { service, confirmations, verify } = setup();
    await expect(service.applyMercadoPagoOrder(REF, {}, 'sig')).resolves.toEqual({
      matched: true,
      confirmed: true,
    });
    expect(verify).toHaveBeenCalledWith({}, 'sig', { mercadopagoCollector: COLLECTOR });
    expect(confirmations.confirmAttempt).toHaveBeenCalledWith(ROW);
  });

  it('a bad signature or unreadable order is refused (403) and settles nothing', async () => {
    const { service, confirmations } = setup({ verified: new Error('bad signature') });
    await expect(service.applyMercadoPagoOrder(REF, {}, 'sig')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(confirmations.confirmAttempt).not.toHaveBeenCalled();
  });

  it('a pending order, another amount or another account never marks the month paid', async () => {
    for (const verified of [
      event({ status: 'pending' }),
      event({ amountCharged: 999 }),
      event({ receiverAccountId: '999' }),
      event({ currency: 'USD' }),
    ]) {
      const { service, confirmations } = setup({ verified });
      const outcome = await service.applyMercadoPagoOrder(REF, {}, 'sig');
      expect(outcome).toEqual({ matched: true, confirmed: false });
      expect(confirmations.confirmAttempt).not.toHaveBeenCalled();
    }
  });

  it('leaves an audit trace of a mismatch to review', async () => {
    const { service, audit } = setup({ verified: event({ amountCharged: 999 }) });
    await service.applyMercadoPagoOrder(REF, {}, 'sig');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'sponsorship.billing_payment_mismatch' }),
    );
  });
});

describe('SponsorshipCheckoutService (PAY-001: cada mes a la cuenta de la organización)', () => {
  const config = (driver: string) => ({ get: () => driver }) as unknown as ConfigService<Env, true>;
  const input = {
    organizationId: ORG_ID,
    sponsorshipId: 's-1',
    amount: PLAN_AMOUNT,
    idempotencyKey: 'k-1',
    expiresAt: new Date('2026-11-25T00:00:00Z'),
    payerEmail: 'padrino@test.local',
  };

  it("charges with the organization's own grant, never AdoptaFácil's account", async () => {
    const createCollection = jest.fn(async () => ({
      collectionId: REF,
      status: 'pending' as const,
      breakdown: computeBreakdown(PLAN_AMOUNT),
      paymentLinkUrl: 'https://www.mercadopago.com.co/checkout/v1/redirect?order_id=1',
    }));
    const connections = {
      resolveCollector: jest.fn(async () => COLLECTOR),
    } as unknown as MercadoPagoConnectionsService;
    const service = new SponsorshipCheckoutService(
      { createCollection } as unknown as PaymentPort,
      config('mercadopago'),
      connections,
    );
    await service.open(input);
    expect(createCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        concept: { kind: 'sponsorship', id: 's-1' },
        mercadopagoCollector: COLLECTOR,
        expiresAt: input.expiresAt,
        payer: { email: 'padrino@test.local' },
      }),
    );
  });

  it('says so in plain words when the organization has not connected Mercado Pago', async () => {
    const createCollection = jest.fn();
    const connections = {
      resolveCollector: jest.fn(async () => undefined),
    } as unknown as MercadoPagoConnectionsService;
    const service = new SponsorshipCheckoutService(
      { createCollection } as unknown as PaymentPort,
      config('mercadopago'),
      connections,
    );
    await expect(service.open(input)).rejects.toEqual(
      new ConflictException(SPONSORSHIP_NO_COLLECTOR_MESSAGE),
    );
    expect(createCollection).not.toHaveBeenCalled();
  });

  it("hides Mercado Pago's technical reason from the person", async () => {
    const createCollection = jest.fn(async () => {
      throw new Error('Mercado Pago order create failed (401 invalid token)');
    });
    const service = new SponsorshipCheckoutService(
      { createCollection } as unknown as PaymentPort,
      config('mercadopago'),
      {
        resolveCollector: jest.fn(async () => COLLECTOR),
      } as unknown as MercadoPagoConnectionsService,
    );
    await expect(service.open(input)).rejects.toThrow(/No pudimos abrir el pago/);
  });
});
