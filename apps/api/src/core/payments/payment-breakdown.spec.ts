import { computeBreakdown } from '@adoptafacil/contracts';

/**
 * Smoke test of the money invariant (RNF12), REUSING the single source of the
 * amounts from contracts (computeBreakdown) — no reimplementation here. The
 * donor pays exactly what they chose; AdoptaFácil takes 0 % and no gateway fee
 * is invented. All amounts are integer COP (no float).
 */
describe('computeBreakdown money invariant (T-052 smoke)', () => {
  for (const amount of [1_000, 25_000, 100_000, 1_234_567]) {
    it(`sums to the peso and charges exactly the amount (${amount})`, () => {
      const b = computeBreakdown(amount);
      expect(b.gross).toBe(b.net + b.platformFee + b.platformIva + b.gatewayFee + b.gatewayIva);
      for (const value of Object.values(b)) {
        expect(Number.isInteger(value)).toBe(true);
      }
      expect(b.amountCharged).toBe(amount);
      expect(b.net).toBe(amount);
      expect(b.platformFee).toBe(0);
      expect(b.gatewayFee).toBe(0);
    });
  }
});
