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
    // Everyone already has Pro for free: nothing is offered for payment online.
    expect(screen.queryByText(/con Mercado Pago/)).not.toBeInTheDocument();
  });

  it('offers to pay a paid plan with Mercado Pago once plans are enforced', async () => {
    stubPlan(viewFor({ effectivePlan: 'free' }));
    renderShell({ route: '/organizacion/plan', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText('Pagar Crece con Mercado Pago')).toBeInTheDocument();
    expect(screen.getByText('Pagar Pro con Mercado Pago')).toBeInTheDocument();
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

  it('shows branded emails used this month against the plan cap, and the cap per plan', async () => {
    stubPlan(
      viewFor({
        effectivePlan: 'crece',
        usage: { members: 2, brandedEmails: { sent: 1250, limit: 5000 } },
      }),
    );
    renderShell({ route: '/organizacion/plan', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText(/Correos con tu marca este mes/)).toHaveTextContent(
      'Correos con tu marca este mes: 1.250 de 5.000.',
    );
    expect(screen.getAllByText(/hasta 5\.000 al mes/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/hasta 20\.000 al mes/).length).toBeGreaterThan(0);
  });
});

describe('OrgPlanPage · cancelar el plan', () => {
  const paid = viewFor({
    effectivePlan: 'crece',
    subscription: {
      organizationId: 'org-self',
      plan: 'crece',
      status: 'active',
      currentPeriodEnd: '2026-12-06T05:00:00.000Z',
      provider: 'mercadopago',
      providerReference: 'pre123',
      discountPercent: 0,
      updatedAt: '2026-11-06T00:00:00.000Z',
    },
  });

  it('pide confirmación y llama POST /org/plan/cancel', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), method: init?.method ?? 'GET' });
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => (String(input).endsWith('/org/plan') ? paid : {}),
        });
      }),
    );
    renderShell({ route: '/organizacion/plan', ...sessionWith([Role.Owner]) });
    (await screen.findByTestId('plan-cancel')).click();
    (await screen.findByTestId('plan-cancel-confirm')).click();
    await vi.waitFor(() =>
      expect(calls.some((c) => c.url.endsWith('/org/plan/cancel') && c.method === 'POST')).toBe(
        true,
      ),
    );
  });

  it('un plan cancelado dice hasta cuándo se puede usar y no ofrece cancelar otra vez', async () => {
    stubPlan({ ...paid, subscription: { ...paid.subscription!, status: 'canceled' } });
    renderShell({ route: '/organizacion/plan', ...sessionWith([Role.Owner]) });
    expect(await screen.findByText(/Cancelaste tu plan/)).toBeInTheDocument();
    expect(screen.queryByTestId('plan-cancel')).not.toBeInTheDocument();
  });

  it('sin planes encendidos no se ofrece cancelar', async () => {
    stubPlan({ ...paid, enforced: false });
    renderShell({ route: '/organizacion/plan', ...sessionWith([Role.Owner]) });
    await screen.findByText('Durante el piloto tienes todas las funciones sin costo.');
    expect(screen.queryByTestId('plan-cancel')).not.toBeInTheDocument();
  });
});
