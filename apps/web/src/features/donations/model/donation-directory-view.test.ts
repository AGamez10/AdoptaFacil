import { describe, expect, it } from 'vitest';
import { FormalizationState, type PublicDonationOrganization } from '@adoptafacil/contracts';
import {
  diligenceChips,
  donateHrefFor,
  filterDirectory,
  groupDirectory,
  initialsOf,
  levelName,
} from './donation-directory-view';

function org(overrides: Partial<PublicDonationOrganization>): PublicDonationOrganization {
  return {
    id: overrides.name ?? 'id',
    name: 'Org',
    slug: 'org',
    formalizationState: FormalizationState.ESAL,
    rteVigente: false,
    donorBenefit: 'accounting_certificate',
    verified: true,
    canReceiveDonations: true,
    signals: {
      documentsUpToDate: false,
      publishesExpenses: false,
      reviewCount: 0,
      activeCampaigns: 0,
    },
    ...overrides,
  };
}

describe('donation directory view', () => {
  const items = [
    org({ name: 'RTE', donorBenefit: 'tax_certificate', city: 'Cali' }),
    org({ name: 'ESAL' }),
    org({ name: 'Formal', donorBenefit: 'receipt' }),
    org({ name: 'Sin cobros', donorBenefit: 'tax_certificate', canReceiveDonations: false }),
  ];

  it('groups by what the donor gets, keeping the API order, and puts non-collecting orgs last', () => {
    const groups = groupDirectory(items);
    expect(groups.map((g) => g.key)).toEqual(['tax', 'accounting', 'formal', 'unavailable']);
    expect(groups[3]?.items.map((o) => o.name)).toEqual(['Sin cobros']);
    expect(groupDirectory([items[1]!]).map((g) => g.key)).toEqual(['accounting']);
  });

  it('filters by name or city (accent-insensitive) and by tax benefit (only if it can collect)', () => {
    expect(filterDirectory(items, { query: 'cáli', taxOnly: false }).map((o) => o.name)).toEqual([
      'RTE',
    ]);
    expect(filterDirectory(items, { query: '', taxOnly: true }).map((o) => o.name)).toEqual([
      'RTE',
    ]);
  });

  it('shows only the signals the organization meets', () => {
    expect(diligenceChips(org({ verified: false }))).toEqual([]);
    const chips = diligenceChips(
      org({
        signals: {
          documentsUpToDate: true,
          publishesExpenses: true,
          reviewAverage: 4.75,
          reviewCount: 1,
          activeCampaigns: 2,
        },
      }),
    ).map((c) => c.label);
    expect(chips).toEqual([
      'Verificada',
      'Documentos al día',
      'Publica sus gastos',
      '★ 4,8 · 1 reseña',
      '2 campañas activas',
    ]);
  });

  it('never presents an expired RTE as current', () => {
    expect(levelName({ formalizationState: FormalizationState.ESAL_RTE, rteVigente: true })).toBe(
      'ESAL con RTE',
    );
    expect(levelName({ formalizationState: FormalizationState.ESAL_RTE, rteVigente: false })).toBe(
      'ESAL (RTE por renovar)',
    );
  });

  it('builds the same donate link the portal uses and readable initials', () => {
    const href = donateHrefFor(org({ id: 'o-1', name: 'Huella Verde', slug: 'hv', city: 'Cali' }));
    const params = new URLSearchParams(href.split('?')[1]);
    expect(href.startsWith('/donaciones?')).toBe(true);
    expect(params.get('organizationId')).toBe('o-1');
    expect(params.get('organizationSlug')).toBe('hv');
    expect(params.get('organizationCity')).toBe('Cali');
    expect(initialsOf('Fundación Huella Verde')).toBe('FV');
    expect(initialsOf('Patitas')).toBe('P');
  });
});
