import { describe, expect, it } from 'vitest';
import type { OrganizationDashboardSummary } from '@adoptafacil/contracts';
import { deriveFirstSteps } from './first-steps';

const EMPTY: OrganizationDashboardSummary = {
  animalsActive: 0,
  adoptionRequestsPending: 0,
  sponsorshipsActive: 0,
  documentsExpiringSoon: 0,
  documentsRejected: 0,
  donationsReceivedTotal: 0,
  formalizationLevel: 0,
  formalizationPercent: 0,
};

describe('deriveFirstSteps', () => {
  it('un refugio recién registrado tiene todo pendiente', () => {
    const steps = deriveFirstSteps({
      summary: EMPTY,
      profile: { logoUrl: undefined, description: '' },
      payments: 'pending',
      paymentsHref: '/organizacion?tab=pagos',
    });
    expect(steps.map((s) => s.key)).toEqual(['profile', 'documents', 'animal', 'payments']);
    expect(steps.every((s) => !s.done)).toBe(true);
  });

  it('marca cada paso con datos reales y omite cobros cuando no aplican', () => {
    const steps = deriveFirstSteps({
      summary: { ...EMPTY, animalsActive: 2, formalizationPercent: 25 },
      profile: { logoUrl: 'https://x/logo.png', aboutUs: 'Rescatamos desde 2015' },
      payments: null,
      paymentsHref: '/organizacion?tab=pagos',
    });
    expect(steps.map((s) => [s.key, s.done])).toEqual([
      ['profile', true],
      ['documents', true],
      ['animal', true],
    ]);
  });

  it('un logo sin descripción no cuenta como perfil completo', () => {
    const [profile] = deriveFirstSteps({
      summary: EMPTY,
      profile: { logoUrl: 'https://x/logo.png' },
      payments: null,
      paymentsHref: '',
    });
    expect(profile.done).toBe(false);
  });
});
