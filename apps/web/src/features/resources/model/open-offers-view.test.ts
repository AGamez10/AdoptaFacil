import { describe, expect, it } from 'vitest';
import {
  ResourceCategory,
  ResourceNeedStatus,
  ResourceOpenOfferStatus,
  type ResourceNeed,
} from '@adoptafacil/contracts';
import {
  OPEN_OFFER_CATEGORY_OPTIONS,
  compatibleNeeds,
  daysLeft,
  openOfferStatusLabel,
} from './open-offers-view';

const need = (over: Partial<ResourceNeed>): ResourceNeed => ({
  id: 'n',
  organizationId: 'o',
  title: 'Cobijas',
  category: ResourceCategory.Supplies,
  quantityNeeded: 10,
  unit: 'unidades',
  quantityFulfilled: 0,
  progress: 0,
  status: ResourceNeedStatus.Needed,
  createdAt: '',
  updatedAt: '',
  ...over,
});

describe('open offers view', () => {
  it('never offers medicine as an open-offer category', () => {
    expect(OPEN_OFFER_CATEGORY_OPTIONS.map((o) => o.value)).not.toContain(
      ResourceCategory.Medicine,
    );
  });

  it('only active needs of the same category and unit (case/space-insensitive) are compatible', () => {
    const needs = [
      need({ id: 'ok', unit: ' Unidades ' }),
      need({ id: 'cat', category: ResourceCategory.Food }),
      need({ id: 'unit', unit: 'kg' }),
      need({ id: 'done', status: ResourceNeedStatus.Fulfilled }),
      need({ id: 'part', status: ResourceNeedStatus.PartiallyFulfilled }),
    ];
    expect(
      compatibleNeeds(needs, { category: ResourceCategory.Supplies, unit: 'unidades' }).map(
        (n) => n.id,
      ),
    ).toEqual(['ok', 'part']);
  });

  it('labels expired, claimed and withdrawn offers', () => {
    expect(openOfferStatusLabel({ status: ResourceOpenOfferStatus.Open, expired: true })).toBe(
      'Vencido',
    );
    expect(openOfferStatusLabel({ status: ResourceOpenOfferStatus.Claimed, expired: false })).toBe(
      'Una organización lo tomó',
    );
    expect(
      openOfferStatusLabel({ status: ResourceOpenOfferStatus.Withdrawn, expired: false }),
    ).toBe('Retirado');
  });

  it('counts the days left, never negative', () => {
    const now = new Date('2026-10-31T00:00:00Z');
    expect(daysLeft('2026-11-02T00:00:00Z', now)).toBe(2);
    expect(daysLeft('2026-10-01T00:00:00Z', now)).toBe(0);
  });
});
