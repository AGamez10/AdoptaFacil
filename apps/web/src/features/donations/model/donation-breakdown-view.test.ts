import { describe, expect, it } from 'vitest';
import { computeBreakdown, MIN_DONATION_AMOUNT } from '@adoptafacil/contracts';
import {
  breakdownLines,
  buildDonationBreakdown,
  formatCop,
  safeBuildDonationBreakdown,
} from './donation-breakdown-view';

/**
 * §M05 — what is SHOWN to the donor must be, to the peso, `computeBreakdown`
 * (the single source of the money math), so the UI can never drift into its own
 * arithmetic, and it never shows an invented fee.
 */
const AMOUNTS = [1000, 5000, 33333, 50000, 100000, 1234567];

describe('donation-breakdown-view', () => {
  it('shows EXACTLY computeBreakdown (no own arithmetic)', () => {
    for (const amount of AMOUNTS) {
      expect(buildDonationBreakdown(amount).breakdown).toEqual(computeBreakdown(amount));
    }
  });

  it('the donor pays exactly what they chose and sees no fee line', () => {
    const { breakdown, lines } = buildDonationBreakdown(50000);
    expect(breakdown.amountCharged).toBe(50000);
    expect(lines).toEqual([
      { key: 'amountCharged', label: 'Total que pagas', amount: 50000, emphasis: 'charged' },
    ]);
    expect(lines.map((l) => l.label).join(' ')).not.toMatch(/comisi[oó]n|estimad|wompi/i);
  });

  it('a stored gateway fee (if any) is shown with the net, never an AdoptaFácil fee', () => {
    const lines = breakdownLines({
      amountCharged: 50000,
      gross: 50000,
      platformFee: 0,
      platformIva: 0,
      gatewayFee: 1500,
      gatewayIva: 285,
      net: 48215,
    });
    expect(lines.map((l) => l.key)).toEqual(['amountCharged', 'gatewayFee', 'gatewayIva', 'net']);
    expect(lines.find((l) => l.emphasis === 'net')?.amount).toBe(48215);
  });

  it('safe variant returns null below the minimum / for non-integers, never throwing', () => {
    expect(safeBuildDonationBreakdown(MIN_DONATION_AMOUNT - 1)).toBeNull();
    expect(safeBuildDonationBreakdown(1000.5)).toBeNull();
    expect(safeBuildDonationBreakdown(Number.NaN)).toBeNull();
    expect(safeBuildDonationBreakdown(MIN_DONATION_AMOUNT)).not.toBeNull();
  });

  it('formats integer pesos in es-CO currency without decimals', () => {
    const out = formatCop(50000);
    expect(out).toMatch(/50\.000/);
    expect(out).not.toMatch(/,\d\d/);
  });
});
