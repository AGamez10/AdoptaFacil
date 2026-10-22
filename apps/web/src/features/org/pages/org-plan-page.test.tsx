import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLAN_CATALOG, PLAN_KEYS, Role, type OrganizationPlanView } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/** `/organizacion/plan` — Plan y facturación (planes y suscripciones). */
function sessionWith(roles: Role[]) {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'owner-1',
        name: 'Owner',
        email: 'owner@refugio.test',
        roles,
        organizationId: 'org-self',
        accountType: 'organization' as const,
      },
    },
  };
}

function viewFor(overrides: Partial<OrganizationPlanView>): OrganizationPlanView {
  const plan = overrides.effectivePlan ?? 'free';
  return {
    enforced: true,
    effectivePlan: plan,
    subscription: null,
    graceEndsAt: null,
    limits: PLAN_CATALOG[plan].limits,
    capabilities: PLAN_CATALOG[plan].capabilities,
    usage: { members: 2 },
    catalog: PLAN_KEYS.map((key) => PLAN_CATALOG[key]),
    ...overrides,
  };
}

function stubPlan(view: OrganizationPlanView) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => (String(input).endsWith('/org/plan') ? view : {}),
      }),
    ),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('OrgPlanPage', () => {
  it('shows the free plan, member usage and the three plans with prices + IVA', async () => {
    stubPlan(viewFor({ effectivePlan: 'free' }));
    renderShell({ route: '/organizacion/plan', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText('Estás en el plan Gratis')).toBeInTheDocument();
    expect(screen.getByText(/de 3/)).toBeInTheDocument();
    expect(screen.getByText('Tu plan')).toBeInTheDocument();
    expect(screen.getByText(/46\.410/)).toBeInTheDocument();
    expect(screen.getByText(/94\.010/)).toBeInTheDocument();
    expect(screen.getByText('Dominio propio (www.turefugio.org)')).toBeInTheDocument();
    expect(screen.getAllByText('Opcional')).toHaveLength(2);
    expect(screen.getAllByText('Próximamente').length).toBeGreaterThan(0);
    expect(
      screen.getByText(/Recaudo de donaciones, también si aún no estás formalizado/),
    ).toBeInTheDocument();
  });

  it('says everything is included at no cost while plans are not enforced', async () => {
    stubPlan(viewFor({ enforced: false, effectivePlan: 'pro' }));
    renderShell({ route: '/organizacion/plan', ...sessionWith([Role.Administrator]) });

    expect(
      await screen.findByText('Durante el piloto tienes todas las funciones sin costo.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Tu plan')).not.toBeInTheDocument();
  });

  it('warns about the grace period when a payment is pending', async () => {
    stubPlan(
      viewFor({
        effectivePlan: 'crece',
        graceEndsAt: '2026-11-15T12:00:00.000Z',
        subscription: {
          organizationId: 'org-self',
          plan: 'crece',
          status: 'past_due',
          currentPeriodEnd: '2026-10-31T12:00:00.000Z',
          provider: 'manual',
          providerReference: null,
          discountPercent: 50,
          updatedAt: '2026-10-01T00:00:00.000Z',
        },
      }),
    );
    renderShell({ route: '/organizacion/plan', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText(/Tu pago está pendiente/)).toBeInTheDocument();
    expect(screen.getByText(/50 % de descuento fundador/)).toBeInTheDocument();
  });

  it('is not reachable for an Operator (deny-by-default, same roles as the API)', async () => {
    stubPlan(viewFor({}));
    renderShell({ route: '/organizacion/plan', ...sessionWith([Role.Operator]) });
    expect(screen.queryByText(/Estás en el plan/)).not.toBeInTheDocument();
  });
});
