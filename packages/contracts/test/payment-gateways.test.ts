import { describe, expect, it } from 'vitest';
import {
  COLLECTION_MODES,
  GATEWAY_CATALOG,
  GATEWAY_PROVIDERS,
  findPaymentMismatches,
  planCollection,
  type CollectionPolicy,
  type ExpectedGatewayPayment,
  type GatewayCapability,
  type GatewayPaymentSnapshot,
  type OrgGatewayConnection,
} from '../src/payment-gateways';
import { computeBreakdown, DIRECT_COLLECTION_RATES, PAYMENT_FEE_CONFIG } from '../src/payments';

const ORG_A = '00000000-0000-0000-0000-00000000000a';
const ORG_B = '00000000-0000-0000-0000-00000000000b';

const LAUNCH: CollectionPolicy = {
  enabledModes: ['direct_to_org', 'external_link'],
  splitPlatformFeeRate: 0.04,
  splitApprovalRef: null,
};

function conn(over: Partial<OrgGatewayConnection> = {}): OrgGatewayConnection {
  return {
    organizationId: ORG_A,
    provider: 'wompi',
    mode: 'direct_to_org',
    status: 'active',
    gatewayAccountId: '292020059',
    ...over,
  };
}

describe('planCollection — sin custodia (D1)', () => {
  it('direct_to_org: the organization collects and the platform fee is 0', () => {
    const d = planCollection(ORG_A, conn(), LAUNCH);
    expect(d).toEqual({
      ok: true,
      plan: {
        provider: 'wompi',
        mode: 'direct_to_org',
        collector: 'organization',
        platformFeeRate: 0,
        verifiable: true,
      },
    });
  });

  it('every possible plan names the organization as collector', () => {
    const policy: CollectionPolicy = {
      enabledModes: COLLECTION_MODES,
      splitPlatformFeeRate: 0.04,
      splitApprovalRef: 'TICKET-123',
    };
    for (const provider of GATEWAY_PROVIDERS) {
      for (const mode of COLLECTION_MODES) {
        const d = planCollection(ORG_A, conn({ provider, mode }), policy);
        if (d.ok) expect(d.plan.collector).toBe('organization');
      }
    }
  });

  it('payments off when no mode is enabled', () => {
    expect(planCollection(ORG_A, conn(), { ...LAUNCH, enabledModes: [] })).toEqual({
      ok: false,
      reason: 'payments_disabled',
    });
  });

  it('refuses an org without an active connection (no fallback to a platform account)', () => {
    expect(planCollection(ORG_A, null, LAUNCH)).toEqual({
      ok: false,
      reason: 'no_active_connection',
    });
    expect(planCollection(ORG_A, conn({ status: 'revoked' }), LAUNCH)).toEqual({
      ok: false,
      reason: 'no_active_connection',
    });
    expect(planCollection(ORG_A, conn({ status: 'pending' }), LAUNCH)).toEqual({
      ok: false,
      reason: 'no_active_connection',
    });
  });

  it("refuses another organization's connection (tenant A vs B)", () => {
    expect(planCollection(ORG_B, conn(), LAUNCH)).toEqual({
      ok: false,
      reason: 'connection_of_other_org',
    });
  });

  it('refuses a mode that is not enabled in this environment', () => {
    expect(planCollection(ORG_A, conn(), { ...LAUNCH, enabledModes: ['external_link'] })).toEqual({
      ok: false,
      reason: 'mode_disabled',
    });
  });

  it('refuses a provider/mode pair the catalog does not support', () => {
    const d = planCollection(ORG_A, conn({ provider: 'bold', mode: 'direct_to_org' }), LAUNCH);
    expect(d).toEqual({ ok: false, reason: 'mode_not_supported_by_provider' });
  });
});

describe('planCollection — split con comisión', () => {
  const SPLIT_ON: CollectionPolicy = {
    enabledModes: ['platform_split'],
    splitPlatformFeeRate: 0.04,
    splitApprovalRef: null,
  };

  it('a provider without split in the catalog stays refused', () => {
    const d = planCollection(ORG_A, conn({ provider: 'wompi', mode: 'platform_split' }), {
      ...SPLIT_ON,
      splitApprovalRef: 'TICKET-123',
    });
    expect(d).toEqual({ ok: false, reason: 'mode_not_supported_by_provider' });
  });

  // No listed gateway offers a split today: these cases run against a
  // test-only catalog so the approval and fee-rate rules stay pinned.
  const SPLIT_CATALOG: readonly GatewayCapability[] = [
    {
      provider: 'wompi',
      mode: 'platform_split',
      credentialKind: 'oauth',
      verifiable: true,
      platformFeeAtSource: true,
      status: 'requires_written_confirmation',
      checkedAt: '2026-10-29',
      sources: [],
    },
  ];
  const splitConn = () => conn({ provider: 'wompi', mode: 'platform_split' });

  it('a split needs a written approval reference', () => {
    expect(planCollection(ORG_A, splitConn(), SPLIT_ON, SPLIT_CATALOG)).toEqual({
      ok: false,
      reason: 'split_without_written_approval',
    });
    expect(
      planCollection(ORG_A, splitConn(), { ...SPLIT_ON, splitApprovalRef: '   ' }, SPLIT_CATALOG),
    ).toEqual({
      ok: false,
      reason: 'split_without_written_approval',
    });
  });

  it('with approval, the 4 % fee applies and the org is still the collector', () => {
    const d = planCollection(
      ORG_A,
      splitConn(),
      { ...SPLIT_ON, splitApprovalRef: 'PSP-2026-10' },
      SPLIT_CATALOG,
    );
    expect(d).toEqual({
      ok: true,
      plan: {
        provider: 'wompi',
        mode: 'platform_split',
        collector: 'organization',
        platformFeeRate: 0.04,
        verifiable: true,
      },
    });
  });

  it.each([-0.01, 1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects fee rate %s', (rate) => {
    const d = planCollection(
      ORG_A,
      splitConn(),
      { ...SPLIT_ON, splitApprovalRef: 'X', splitPlatformFeeRate: rate },
      SPLIT_CATALOG,
    );
    expect(d).toEqual({ ok: false, reason: 'invalid_fee_rate' });
  });
});

describe('planCollection — enlaces externos', () => {
  it('is allowed but not verifiable', () => {
    const d = planCollection(
      ORG_A,
      conn({ provider: 'external_link', mode: 'external_link' }),
      LAUNCH,
    );
    expect(d.ok && d.plan.verifiable).toBe(false);
  });
});

describe('GATEWAY_CATALOG', () => {
  it('has one entry per provider/mode pair and a check date', () => {
    const keys = GATEWAY_CATALOG.map((c) => `${c.provider}:${c.mode}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const c of GATEWAY_CATALOG) expect(c.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('only split modes may deduct a platform fee at source', () => {
    for (const c of GATEWAY_CATALOG) {
      if (c.platformFeeAtSource) expect(c.mode).toBe('platform_split');
    }
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

describe('computeBreakdown — cobro directo (ADR-PAG-001)', () => {
  it.each([1000, 33333, 100000, 1234567])(
    'no platform fee and the sum still reconciles (%i)',
    (amount) => {
      for (const payer of ['organization', 'donor'] as const) {
        const b = computeBreakdown(amount, payer, DIRECT_COLLECTION_RATES);
        expect(b.platformFee).toBe(0);
        expect(b.platformIva).toBe(0);
        expect(b.gross).toBe(b.net + b.gatewayFee + b.gatewayIva);
      }
    },
  );

  it('defaults stay unchanged for callers that pass no rates', () => {
    expect(computeBreakdown(100000, 'organization')).toEqual(
      computeBreakdown(100000, 'organization', { platformRate: PAYMENT_FEE_CONFIG.platformRate }),
    );
  });

  it.each([-0.1, 1, Number.NaN])('rejects platformRate %s', (rate) => {
    expect(() => computeBreakdown(1000, 'organization', { platformRate: rate })).toThrow(
      RangeError,
    );
  });
});
