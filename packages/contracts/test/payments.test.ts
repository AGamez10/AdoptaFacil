import { describe, expect, it } from 'vitest';
import { computeBreakdown, FakePaymentAdapter, type PaymentBreakdown } from '../src/payments';

/** The RNF12 sum invariant: gross reconciles to the peso against net + commissions. */
function assertSumInvariant(b: PaymentBreakdown): void {
  expect(b.gross).toBe(b.net + b.platformFee + b.platformIva + b.gatewayFee + b.gatewayIva);
  // Everything is integer pesos (never float).
  for (const v of Object.values(b)) expect(Number.isInteger(v)).toBe(true);
}

const AMOUNTS = [1000, 1250, 5000, 10000, 33333, 100000, 1234567];

describe('computeBreakdown — cobro directo, 0 % de AdoptaFácil', () => {
  it.each(AMOUNTS)('the donor pays exactly what they chose (%i)', (amount) => {
    const b = computeBreakdown(amount);
    assertSumInvariant(b);
    expect(b.amountCharged).toBe(amount);
    expect(b.gross).toBe(amount);
    expect(b.net).toBe(amount);
  });

  it('never invents a platform or gateway fee', () => {
    const b = computeBreakdown(50000);
    expect(b.platformFee).toBe(0);
    expect(b.platformIva).toBe(0);
    expect(b.gatewayFee).toBe(0);
    expect(b.gatewayIva).toBe(0);
  });

  it('rejects non-positive or non-integer amounts', () => {
    for (const bad of [0, -1, 1000.5, Number.NaN]) {
      expect(() => computeBreakdown(bad)).toThrow(RangeError);
    }
  });
});

describe('FakePaymentAdapter — deterministic + idempotent', () => {
  const port = new FakePaymentAdapter();

  it('same idempotencyKey → same collection id and breakdown', async () => {
    const input = {
      intendedAmount: 50000,
      currency: 'COP' as const,
      concept: { kind: 'campaign' as const, id: 'c1' },
      idempotencyKey: 'key-abc',
    };
    const a = await port.createCollection(input);
    const b = await port.createCollection(input);
    expect(a.collectionId).toBe(b.collectionId);
    expect(a.breakdown).toEqual(b.breakdown);
    expect(a.breakdown.amountCharged).toBe(50000);
    expect(a.status).toBe('approved');
  });

  it('different idempotencyKey → different collection id', async () => {
    const base = {
      intendedAmount: 50000,
      currency: 'COP' as const,
      concept: { kind: 'organization' as const, id: 'o1' },
    };
    const a = await port.createCollection({ ...base, idempotencyKey: 'k1' });
    const b = await port.createCollection({ ...base, idempotencyKey: 'k2' });
    expect(a.collectionId).not.toBe(b.collectionId);
  });

  it('normalizes a webhook with a dedup key', async () => {
    const evt = await port.verifyAndNormalizeWebhook(
      { collectionId: 'fake-col-1', status: 'approved', eventId: 'evt-9' },
      'sig',
    );
    expect(evt).toEqual({
      eventId: 'evt-9',
      collectionId: 'fake-col-1',
      status: 'approved',
      dedupKey: 'evt-9',
    });
  });

  it('reports a collection status', async () => {
    expect(await port.getCollectionStatus('fake-col-1')).toBe('approved');
  });
});
