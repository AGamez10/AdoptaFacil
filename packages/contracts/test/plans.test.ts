import { describe, expect, it } from 'vitest';
import { PORTAL_TEMPLATES, isPremiumTemplate } from '../src/portals';
import {
  PLAN_CAPABILITIES,
  PLAN_CATALOG,
  PLAN_KEYS,
  launchPromoEnd,
  minimumPlanFor,
  minimumPlanForLimit,
  planHighlights,
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

  it('premium portal designs need a paid plan (decisión 2026-10-17)', () => {
    expect(minimumPlanFor('portalPremiumDesigns')).toBe('crece');
    const premium = PORTAL_TEMPLATES.filter((t) => isPremiumTemplate(t.id)).map((t) => t.id);
    expect(premium).toEqual(['historias']);
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

describe('planHighlights (landing and plans screen share the catalog)', () => {
  it('lists the free limits and, for each paid plan, only what it adds', () => {
    const free = planHighlights('free').map((h) => h.text);
    expect(free).toContain('Hasta 3 personas del equipo');
    expect(free).toContain('1 GB para fotos y documentos');

    const crece = planHighlights('crece').map((h) => h.text);
    expect(crece[0]).toBe('Todo lo del plan Gratis');
    expect(crece).not.toContain('Todos los diseños de portal público');
    expect(crece).toContain('Hasta 10 personas del equipo');

    const pro = planHighlights('pro');
    expect(pro[0].text).toBe('Todo lo del plan Crece');
    expect(pro.map((h) => h.text)).toContain('Equipo sin límite de personas');
    expect(pro.find((h) => h.text.startsWith('Dominio propio'))?.available).toBe(false);
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

describe('launch promotion', () => {
  const launch = new Date('2026-11-01T00:00:00Z');
  const end = launchPromoEnd(launch);

  it('lasts three calendar months from the launch date', () => {
    expect(end.toISOString()).toBe('2027-02-01T00:00:00.000Z');
  });

  it('gives pro to an org without subscription until it ends, then free', () => {
    expect(resolveEffectivePlan(null, new Date('2027-01-31T23:00:00Z'), true, end)).toBe('pro');
    expect(resolveEffectivePlan(null, new Date('2027-02-02T00:00:00Z'), true, end)).toBe('free');
  });

  it('does not override a stored subscription, even a canceled one', () => {
    const during = new Date('2026-12-01T00:00:00Z');
    expect(
      resolveEffectivePlan(sub({ currentPeriodEnd: '2027-06-01T00:00:00Z' }), during, true, end),
    ).toBe('crece');
    expect(resolveEffectivePlan(sub({ status: 'canceled' }), during, true, end)).toBe('free');
  });
});
