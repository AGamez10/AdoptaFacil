import { describe, expect, it } from 'vitest';
import {
  PLAN_CAPABILITIES,
  PLAN_CATALOG,
  PLAN_KEYS,
  minimumPlanFor,
  minimumPlanForLimit,
  priceWithIva,
  resolveEffectivePlan,
  type OrganizationSubscription,
} from '../src/plans';

const NOW = new Date('2026-10-08T12:00:00Z');
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

type SubFields = Pick<OrganizationSubscription, 'plan' | 'status' | 'currentPeriodEnd'>;
const sub = (overrides: Partial<SubFields> = {}): SubFields => ({
  plan: 'crece',
  status: 'active',
  currentPeriodEnd: days(10),
  ...overrides,
});

describe('plan catalog', () => {
  it('free includes no paid capability (all current designs are free) and pro includes all of them', () => {
    for (const capability of PLAN_CAPABILITIES) {
      expect(PLAN_CATALOG.free.capabilities[capability]).toBe(capability === 'portalAllDesigns');
      expect(PLAN_CATALOG.pro.capabilities[capability]).toBe(true);
    }
  });

  it('limits never shrink when upgrading', () => {
    for (let i = 1; i < PLAN_KEYS.length; i++) {
      const lower = PLAN_CATALOG[PLAN_KEYS[i - 1]].limits;
      const higher = PLAN_CATALOG[PLAN_KEYS[i]].limits;
      for (const limit of Object.keys(higher) as Array<keyof typeof higher>) {
        const prev = lower[limit];
        const next = higher[limit];
        if (prev === null) expect(next).toBeNull();
        else if (next !== null) expect(next).toBeGreaterThanOrEqual(prev);
      }
    }
  });

  it('every current portal design is free; no seal from crece, own domain only in pro', () => {
    expect(minimumPlanFor('portalAllDesigns')).toBe('free');
    expect(minimumPlanFor('portalRemoveSeal')).toBe('crece');
    expect(minimumPlanFor('customDomain')).toBe('pro');
  });

  it('finds the cheapest plan for a limit', () => {
    expect(minimumPlanForLimit('members', 3)).toBe('free');
    expect(minimumPlanForLimit('members', 4)).toBe('crece');
    expect(minimumPlanForLimit('members', 500)).toBe('pro');
  });

  it('adds 19 % IVA', () => {
    expect(priceWithIva(39_000)).toBe(46_410);
    expect(priceWithIva(79_000)).toBe(94_010);
  });
});

describe('resolveEffectivePlan', () => {
  it('gives everyone pro while enforcement is off', () => {
    expect(resolveEffectivePlan(null, NOW, false)).toBe('pro');
  });

  it('is free without a subscription or when canceled', () => {
    expect(resolveEffectivePlan(null, NOW, true)).toBe('free');
    expect(resolveEffectivePlan(sub({ status: 'canceled' }), NOW, true)).toBe('free');
  });

  it('keeps the plan during the period and the 15 grace days, then falls back to free', () => {
    expect(resolveEffectivePlan(sub(), NOW, true)).toBe('crece');
    expect(
      resolveEffectivePlan(sub({ status: 'past_due', currentPeriodEnd: days(-14) }), NOW, true),
    ).toBe('crece');
    expect(resolveEffectivePlan(sub({ currentPeriodEnd: days(-16) }), NOW, true)).toBe('free');
  });

  it('never lapses an open-ended period', () => {
    expect(resolveEffectivePlan(sub({ plan: 'pro', currentPeriodEnd: null }), NOW, true)).toBe(
      'pro',
    );
  });
});
