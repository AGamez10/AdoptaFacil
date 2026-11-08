import { describe, expect, it } from 'vitest';
import {
  COLLECTION_MODES,
  GATEWAY_CATALOG,
  GATEWAY_PROVIDERS,
  findPaymentMismatches,
  planCollection,
  type CollectionPolicy,
  type ExpectedGatewayPayment,
  type GatewayPaymentSnapshot,
  type OrgGatewayConnection,
} from '../src/payment-gateways';

const ORG_A = '00000000-0000-0000-0000-00000000000a';
const ORG_B = '00000000-0000-0000-0000-00000000000b';

const LAUNCH: CollectionPolicy = { enabledModes: ['direct_to_org'] };

function conn(over: Partial<OrgGatewayConnection> = {}): OrgGatewayConnection {
  return {
    organizationId: ORG_A,
    provider: 'mercadopago',
    mode: 'direct_to_org',
    status: 'active',
    gatewayAccountId: '292020059',
    ...over,
  };
}

describe('planCollection — sin custodia (D1)', () => {
  it('direct_to_org: the organization collects with its own Mercado Pago account', () => {
    expect(planCollection(ORG_A, conn(), LAUNCH)).toEqual({
      ok: true,
      plan: {
        provider: 'mercadopago',
        mode: 'direct_to_org',
        collector: 'organization',
        verifiable: true,
      },
    });
  });

  it('only Mercado Pago and only direct collection exist (no split, no external links)', () => {
    expect(GATEWAY_PROVIDERS).toEqual(['mercadopago']);
    expect(COLLECTION_MODES).toEqual(['direct_to_org']);
  });

  it('every possible plan names the organization as collector', () => {
    for (const provider of GATEWAY_PROVIDERS) {
      for (const mode of COLLECTION_MODES) {
        const d = planCollection(ORG_A, conn({ provider, mode }), LAUNCH);
        if (d.ok) expect(d.plan.collector).toBe('organization');
      }
    }
  });

  it('payments off when no mode is enabled', () => {
    expect(planCollection(ORG_A, conn(), { enabledModes: [] })).toEqual({
      ok: false,
      reason: 'payments_disabled',
    });
  });

  it('refuses an org without an active connection (no fallback to a platform account)', () => {
    expect(planCollection(ORG_A, null, LAUNCH)).toEqual({
      ok: false,
      reason: 'no_active_connection',
    });
    for (const status of ['revoked', 'pending'] as const) {
      expect(planCollection(ORG_A, conn({ status }), LAUNCH)).toEqual({
        ok: false,
        reason: 'no_active_connection',
      });
    }
  });

  it("refuses another organization's connection (tenant A vs B)", () => {
    expect(planCollection(ORG_B, conn(), LAUNCH)).toEqual({
      ok: false,
      reason: 'connection_of_other_org',
    });
  });

  it('refuses a provider/mode pair the catalog does not support', () => {
    expect(planCollection(ORG_A, conn(), LAUNCH, [])).toEqual({
      ok: false,
      reason: 'mode_not_supported_by_provider',
    });
  });
});

describe('GATEWAY_CATALOG', () => {
  it('has one entry per provider/mode pair and a check date', () => {
    const keys = GATEWAY_CATALOG.map((c) => `${c.provider}:${c.mode}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const c of GATEWAY_CATALOG) expect(c.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('findPaymentMismatches (PAY-003)', () => {
  const expected: ExpectedGatewayPayment = {
    amountCharged: 50000,
    currency: 'COP',
    receiverAccountId: '292020059',
    reference: 'don_abc',
  };
  const ok: GatewayPaymentSnapshot = {
    status: 'approved',
    amount: 50000,
    currency: 'COP',
    receiverAccountId: '292020059',
    reference: 'don_abc',
  };

  it('accepts an exact match', () => {
    expect(findPaymentMismatches(expected, ok)).toEqual([]);
  });

  it('flags money that landed in another account (custody tripwire)', () => {
    expect(
      findPaymentMismatches(expected, { ...ok, receiverAccountId: 'platform-account' }),
    ).toEqual(['receiver']);
  });

  it('flags amount, currency and reference differences', () => {
    expect(
      findPaymentMismatches(expected, {
        ...ok,
        amount: 49999.5,
        currency: 'USD',
        reference: 'don_other',
      }),
    ).toEqual(['reference', 'amount', 'currency']);
  });
});
