import { FormalizationState } from '@adoptafacil/contracts';
import {
  donorBenefitFor,
  rankDirectory,
  toDirectoryOrganization,
  type DirectoryPaymentMode,
  type RawDirectoryOrganization,
} from './donation-directory';

const NOW = new Date('2026-11-21T12:00:00Z');
const MP: DirectoryPaymentMode = { mercadopago: true, requiresCollector: true };

function raw(overrides: Partial<RawDirectoryOrganization>): RawDirectoryOrganization {
  return {
    id: overrides.id ?? overrides.name ?? 'org',
    name: 'Org',
    slug: 'org',
    logoUrl: null,
    city: null,
    formalizationState: 'informal',
    rteVigente: false,
    mercadoPagoConnected: true,
    validDocumentTypes: [],
    lastExpenseOn: null,
    reviewAverage: null,
    reviewCount: 0,
    activeCampaigns: 0,
    ...overrides,
  };
}

const build = (r: RawDirectoryOrganization, mode = MP) => toDirectoryOrganization(r, mode, NOW);

describe('donation directory', () => {
  it('derives the donor benefit from the capability matrix (expired RTE counts as ESAL)', () => {
    expect(donorBenefitFor(FormalizationState.ESAL_RTE, true)).toBe('tax_certificate');
    expect(donorBenefitFor(FormalizationState.ESAL_RTE, false)).toBe('accounting_certificate');
    expect(donorBenefitFor(FormalizationState.ESAL, false)).toBe('accounting_certificate');
    expect(donorBenefitFor(FormalizationState.Formalizada, false)).toBe('receipt');
    expect(donorBenefitFor(FormalizationState.Informal, false)).toBe('receipt');
  });

  it('only a formal org with an active Mercado Pago account can receive donations', () => {
    expect(build(raw({ formalizationState: 'esal' })).canReceiveDonations).toBe(true);
    expect(
      build(raw({ formalizationState: 'esal', mercadoPagoConnected: false })).canReceiveDonations,
    ).toBe(false);
    expect(build(raw({ formalizationState: 'informal' })).canReceiveDonations).toBe(false);
    expect(build(raw({ formalizationState: 'en_proceso' })).canReceiveDonations).toBe(false);
    // Fake driver (dev/test): no collector needed; disabled: never.
    const fake = { mercadopago: false, requiresCollector: false };
    const off = { mercadopago: false, requiresCollector: true };
    const noMp = raw({ formalizationState: 'formalizada', mercadoPagoConnected: false });
    expect(build(noMp, fake).canReceiveDonations).toBe(true);
    expect(build(noMp, off).canReceiveDonations).toBe(false);
  });

  it('never trusts rteVigente outside ESAL_RTE and falls back to informal on unknown states', () => {
    const esal = build(raw({ formalizationState: 'esal', rteVigente: true }));
    expect(esal.rteVigente).toBe(false);
    expect(esal.donorBenefit).toBe('accounting_certificate');
    expect(build(raw({ formalizationState: 'weird' })).formalizationState).toBe('informal');
  });

  it('computes documents and ledger signals', () => {
    const ok = build(
      raw({
        formalizationState: 'formalizada',
        validDocumentTypes: ['rut', 'existence_representation_certificate'],
        lastExpenseOn: '2026-10-01',
      }),
    );
    expect(ok.signals.documentsUpToDate).toBe(true);
    expect(ok.signals.publishesExpenses).toBe(true);
    expect(ok.verified).toBe(true);
    const stale = build(
      raw({
        formalizationState: 'formalizada',
        validDocumentTypes: ['rut'],
        lastExpenseOn: '2026-01-01',
      }),
    );
    expect(stale.signals.documentsUpToDate).toBe(false);
    expect(stale.signals.publishesExpenses).toBe(false);
    // Informal has no required documents: never shown as "al día".
    expect(build(raw({})).signals.documentsUpToDate).toBe(false);
  });

  it('ranks: can receive first, then formalization level, then diligence, then name', () => {
    const items = [
      raw({ name: 'Informal', formalizationState: 'informal' }),
      raw({
        name: 'RTE sin cobros',
        formalizationState: 'esal_rte',
        rteVigente: true,
        mercadoPagoConnected: false,
      }),
      raw({ name: 'Formalizada', formalizationState: 'formalizada' }),
      raw({ name: 'ESAL B', formalizationState: 'esal' }),
      raw({
        name: 'ESAL A diligente',
        formalizationState: 'esal',
        validDocumentTypes: ['existence_representation_certificate'],
        lastExpenseOn: '2026-11-01',
      }),
      raw({ name: 'RTE', formalizationState: 'esal_rte', rteVigente: true }),
      raw({ name: 'RTE vencido', formalizationState: 'esal_rte', rteVigente: false }),
    ].map((r) => build(r));
    expect(rankDirectory(items).map((o) => o.name)).toEqual([
      'RTE',
      'ESAL A diligente',
      'ESAL B',
      'RTE vencido',
      'Formalizada',
      'RTE sin cobros',
      'Informal',
    ]);
  });

  it('reviews weigh with a bayesian prior: one 5-star review does not beat many good ones', () => {
    const one = build(
      raw({ name: 'Una', formalizationState: 'esal', reviewAverage: 5, reviewCount: 1 }),
    );
    const many = build(
      raw({ name: 'Muchas', formalizationState: 'esal', reviewAverage: '4.80', reviewCount: 40 }),
    );
    expect(rankDirectory([one, many]).map((o) => o.name)).toEqual(['Muchas', 'Una']);
  });
});
