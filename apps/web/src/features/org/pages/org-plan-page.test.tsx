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
  it('señala el plan que la organización eligió en la landing antes de registrarse', async () => {
    stubPlan(viewFor({ effectivePlan: 'free' }));
    renderShell({ route: '/organizacion/plan?elegir=crece', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText('Lo elegiste')).toBeInTheDocument();
    expect(screen.getByTestId('plan-card-crece')).toHaveAttribute('data-chosen', 'true');
    expect(screen.getByTestId('plan-card-pro')).not.toHaveAttribute('data-chosen');
    expect(screen.getByTestId('plan-pay-mercadopago-crece')).toBeInTheDocument();
  });

  it('shows the free plan, member usage and the three plans with prices (sin IVA: el titular no es responsable de IVA)', async () => {
    stubPlan(viewFor({ effectivePlan: 'free' }));
    renderShell({ route: '/organizacion/plan', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText('Estás en el plan Gratis')).toBeInTheDocument();
    expect(screen.getByText(/de 3/)).toBeInTheDocument();
    expect(screen.getByText('Tu plan')).toBeInTheDocument();
    expect(screen.getAllByText(/No se cobra IVA/)).toHaveLength(2);
    expect(screen.queryByText(/\+ IVA/)).not.toBeInTheDocument();
    expect(screen.queryByText(/46\.410/)).not.toBeInTheDocument();
    expect(screen.getByText('Dominio propio (www.turefugio.org)')).toBeInTheDocument();
    expect(screen.getAllByText('Opcional')).toHaveLength(2);
    // Lo que aún no funciona no se anuncia junto a un precio (Ley 1480), ni un
    // límite de diseños que no existe.
    expect(screen.queryByText('Próximamente')).not.toBeInTheDocument();
    expect(screen.queryByText(/Patrocinio de empresas/)).not.toBeInTheDocument();
    expect(screen.queryByText('Diseños de portal')).not.toBeInTheDocument();
    expect(
      screen.getByText(/Recaudo de donaciones, también si aún no estás formalizado/),
    ).toBeInTheDocument();
  });

  it('Pro muestra el canal de soporte prioritario por WhatsApp', async () => {
    stubPlan(viewFor({ effectivePlan: 'pro' }));
    renderShell({ route: '/organizacion/plan', ...sessionWith([Role.Owner]) });
    const support = await screen.findByTestId('plan-priority-support');
    expect(support.querySelector('a')?.getAttribute('href')).toMatch(/^https:\/\/wa\.me\//);
    expect(support).toHaveTextContent('Soporte prioritario');
  });

  it('Crece no ofrece soporte prioritario (es de Pro)', async () => {
    stubPlan(viewFor({ effectivePlan: 'crece' }));
    renderShell({ route: '/organizacion/plan', ...sessionWith([Role.Owner]) });
    expect(await screen.findByText('Estás en el plan Crece')).toBeInTheDocument();
    expect(screen.queryByTestId('plan-priority-support')).not.toBeInTheDocument();
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

  it('si la API dice que el pago en línea no está configurado, no ofrece un botón que falle', async () => {
    stubPlan(viewFor({ effectivePlan: 'free', onlineBilling: false }));
    renderShell({ route: '/organizacion/plan', ...sessionWith([Role.Owner]) });
    expect(await screen.findByTestId('plan-request-crece')).toHaveTextContent(
      'Quiero el plan Crece (te ayudamos por WhatsApp)',
    );
    expect(screen.queryByText(/con Mercado Pago/)).not.toBeInTheDocument();
  });

  it('muestra el motivo real cuando el pago no se puede abrir (no el genérico "aún no disponible")', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/org/plan/checkout') && init?.method === 'POST') {
          return Promise.resolve({
            ok: false,
            status: 409,
            headers: { get: () => 'application/json' },
            json: async () => ({
              statusCode: 409,
              message: 'Tu organización ya tiene este plan activo.',
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => (url.endsWith('/org/plan') ? viewFor({ onlineBilling: true }) : {}),
        });
      }),
    );
    renderShell({ route: '/organizacion/plan', ...sessionWith([Role.Owner]) });
    (await screen.findByTestId('plan-pay-mercadopago-crece')).click();
    expect(
      (await screen.findAllByText('Tu organización ya tiene este plan activo.')).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/aún no está disponible/)).not.toBeInTheDocument();
  });

  it('un plan vencido se puede volver a pagar desde su propia tarjeta', async () => {
    stubPlan(
      viewFor({
        effectivePlan: 'crece',
        onlineBilling: true,
        subscription: {
          organizationId: 'org-self',
          plan: 'crece',
          status: 'past_due',
          currentPeriodEnd: '2026-10-31T12:00:00.000Z',
          provider: 'mercadopago',
          providerReference: 'pre-1',
          discountPercent: 0,
          updatedAt: '2026-10-01T00:00:00.000Z',
        },
      }),
    );
    renderShell({ route: '/organizacion/plan', ...sessionWith([Role.Owner]) });
    expect(await screen.findByTestId('plan-pay-mercadopago-crece')).toBeInTheDocument();
  });

  it('bajada programada: dice hasta cuándo sigue Pro y cuándo empieza Crece, al volver y en el plan', async () => {
    const end = '2026-12-20T15:00:00.000Z';
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.includes('/org/plan/checkout/status')
          ? { state: 'scheduled', plan: 'crece', startsAt: end }
          : url.endsWith('/org/plan')
            ? viewFor({
                effectivePlan: 'pro',
                subscription: {
                  organizationId: 'org-self',
                  plan: 'pro',
                  status: 'canceled',
                  currentPeriodEnd: end,
                  provider: 'mercadopago',
                  providerReference: 'pre-pro',
                  discountPercent: 0,
                  updatedAt: end,
                  scheduledPlan: 'crece',
                },
              })
            : {};
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => body,
        });
      }),
    );
    renderShell({
      route: '/organizacion/plan?pago=mercadopago&preapproval_id=pre-crece',
      ...sessionWith([Role.Owner]),
    });
    expect(await screen.findByText('Cambio de plan programado')).toBeInTheDocument();
    expect(
      screen.getByText(/Conservas tu plan actual hasta el 20 de diciembre de 2026/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Sigues en Pro hasta el 20 de diciembre de 2026.*empieza el plan Crece/),
    ).toBeInTheDocument();
    expect(screen.getByTestId('plan-cancel')).toBeInTheDocument();
  });

  it('al volver de Mercado Pago: "confirmando" mientras está en proceso y "activo" cuando se aprueba', async () => {
    let state: 'processing' | 'active' = 'processing';
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        const body = url.includes('/org/plan/checkout/status')
          ? { state, plan: 'pro' }
          : url.endsWith('/org/plan')
            ? viewFor({ onlineBilling: true })
            : {};
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => body,
        });
      }),
    );
    renderShell({
      route: '/organizacion/plan?pago=mercadopago&preapproval_id=pre123',
      ...sessionWith([Role.Owner]),
    });
    expect(await screen.findByText('Estamos confirmando tu pago')).toBeInTheDocument();
    expect(urls.some((u) => u.includes('preapproval_id=pre123'))).toBe(true);
    state = 'active';
    expect(
      await screen.findByText('¡Listo! Tu plan está activo', undefined, { timeout: 7000 }),
    ).toBeInTheDocument();
  }, 10_000);

  it('al volver de Mercado Pago con el pago rechazado lo dice claro', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.includes('/org/plan/checkout/status')
          ? { state: 'rejected', plan: 'crece' }
          : url.endsWith('/org/plan')
            ? viewFor({})
            : {};
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => body,
        });
      }),
    );
    renderShell({
      route: '/organizacion/plan?pago=mercadopago&preapproval_id=pre9',
      ...sessionWith([Role.Owner]),
    });
    expect(await screen.findByText('Mercado Pago rechazó el pago')).toBeInTheDocument();
  });
});
