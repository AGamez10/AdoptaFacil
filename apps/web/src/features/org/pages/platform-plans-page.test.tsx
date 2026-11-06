import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OrganizationStatus,
  PLAN_CATALOG,
  PLAN_KEYS,
  Role,
  type OrganizationPlanView,
} from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';
import { endOfColombiaDay } from './platform-plans-page';

/** `/plataforma/planes` — el equipo de plataforma asigna planes a mano. */
function session(roles: Role[]) {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'staff-1',
        name: 'Staff',
        email: 'staff@adoptafacil.test',
        roles,
        organizationId: 'org-platform',
        accountType: 'organization' as const,
      },
    },
  };
}

const ORG_ID = '11111111-1111-4111-8111-111111111111';

function planView(overrides: Partial<OrganizationPlanView> = {}): OrganizationPlanView {
  return {
    enforced: true,
    effectivePlan: 'free',
    subscription: null,
    graceEndsAt: null,
    limits: PLAN_CATALOG.free.limits,
    capabilities: PLAN_CATALOG.free.capabilities,
    usage: { members: 1 },
    catalog: PLAN_KEYS.map((k) => PLAN_CATALOG[k]),
    ...overrides,
  };
}

function stub(view: OrganizationPlanView) {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? 'GET', body: init?.body as string | undefined });
      const json = url.includes('/platform/organizations?')
        ? [
            {
              organizationId: ORG_ID,
              name: 'Refugio Huellitas',
              status: OrganizationStatus.Approved,
              reason: null,
              changedAt: null,
              createdAt: '2026-10-01T00:00:00.000Z',
            },
          ]
        : url.endsWith('/plan')
          ? view
          : {};
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => json,
      });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('PlatformPlansPage', () => {
  it('lista las organizaciones aprobadas y guarda el plan con PUT', async () => {
    const calls = stub(planView());
    renderShell({ route: '/plataforma/planes', ...session([Role.PlatformAdmin]) });
    (await screen.findByTestId(`plan-open-${ORG_ID}`)).click();
    expect(await screen.findByText(/sin suscripción/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Pagado hasta'), { target: { value: '2026-12-31' } });
    fireEvent.change(screen.getByLabelText('Factura o referencia'), {
      target: { value: 'FAC-77' },
    });
    screen.getByText('Guardar plan').click();
    await vi.waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.url).toContain(`/platform/organizations/${ORG_ID}/plan`);
    expect(JSON.parse(put.body as string)).toMatchObject({
      plan: 'crece',
      status: 'active',
      providerReference: 'FAC-77',
      currentPeriodEnd: endOfColombiaDay('2026-12-31'),
    });
  });

  it('avisa que guardar cancela el cobro de Mercado Pago', async () => {
    stub(
      planView({
        effectivePlan: 'pro',
        subscription: {
          organizationId: ORG_ID,
          plan: 'pro',
          status: 'active',
          currentPeriodEnd: '2026-12-06T05:00:00.000Z',
          provider: 'mercadopago',
          providerReference: 'pre1',
          discountPercent: 0,
          updatedAt: '2026-11-06T00:00:00.000Z',
        },
      }),
    );
    renderShell({ route: '/plataforma/planes', ...session([Role.PlatformSuperAdmin]) });
    (await screen.findByTestId(`plan-open-${ORG_ID}`)).click();
    expect(await screen.findByText(/paga con Mercado Pago/)).toBeInTheDocument();
  });

  it('un rol de organización no entra', async () => {
    stub(planView());
    renderShell({ route: '/plataforma/planes', ...session([Role.Owner]) });
    await vi.waitFor(() => expect(screen.queryByText('Planes de organizaciones')).toBeNull());
  });

  it('la fecha elegida cuenta hasta el final de ese día en Colombia', () => {
    expect(endOfColombiaDay('2026-12-31')).toBe('2027-01-01T04:59:59.000Z');
  });
});
