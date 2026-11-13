import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Role, type OrganizationInvitation, type OrgTeamView } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/** `/organizacion/miembros` — equipo de la organización con cargos fijos. */
function sessionWith(roles: Role[], id = 'owner-1') {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id,
        name: 'Dueña',
        email: 'owner@refugio.test',
        roles,
        organizationId: 'org-self',
        accountType: 'organization' as const,
      },
    },
  };
}

function teamView(overrides: Partial<OrgTeamView> = {}): OrgTeamView {
  return {
    members: [
      {
        userId: 'owner-1',
        displayName: 'Dueña',
        email: 'owner@refugio.test',
        roles: [Role.Owner],
        joinedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        userId: 'op-1',
        displayName: 'Oscar',
        email: 'oscar@refugio.test',
        roles: [Role.Operator],
        joinedAt: '2026-02-01T00:00:00.000Z',
      },
      {
        userId: 'acc-1',
        displayName: 'Carla',
        email: 'carla@refugio.test',
        roles: [Role.ReadOnlyAuditor],
        signerRole: 'accountant',
        joinedAt: '2026-02-01T00:00:00.000Z',
      },
    ],
    formerMembers: [],
    seats: { used: 2, pendingInvitations: 0, limit: 3, planName: 'Gratis' },
    ...overrides,
  };
}

const pendingInvite: OrganizationInvitation = {
  id: 'inv-1',
  organizationId: 'org-self',
  email: 'vet@refugio.test',
  role: Role.Veterinarian,
  status: 'pending',
  invitedByUserId: 'owner-1',
  expiresAt: '2026-12-01T00:00:00.000Z',
  createdAt: '2026-11-24T00:00:00.000Z',
};

type Call = { url: string; method: string; body: unknown };

function stubApi(view: OrgTeamView, invitations: OrganizationInvitation[] = []) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      let json: unknown = {};
      if (method === 'GET' && url.endsWith('/org/members')) json = view;
      else if (method === 'GET' && url.endsWith('/org/invitations')) json = invitations;
      else if (method === 'POST' && url.endsWith('/org/invitations'))
        json = { ...pendingInvite, email: 'nueva@refugio.test', emailDelivery: 'sent' };
      return Promise.resolve({
        ok: true,
        status: method === 'GET' || method === 'POST' ? 200 : 204,
        headers: { get: () => null },
        json: async () => json,
      });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('OrgMembersPage', () => {
  it('shows seats, the team, signers apart and what each role can do', async () => {
    stubApi(teamView(), [pendingInvite]);
    renderShell({ route: '/organizacion/miembros', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText('Puestos usados: 2 de 3')).toBeInTheDocument();
    const team = screen.getByRole('list', { name: 'Equipo actual' });
    expect(within(team).getByText('Oscar')).toBeInTheDocument();
    expect(within(team).getByText('Se gestiona en Firmantes')).toBeInTheDocument();
    // La dueña no se gestiona a sí misma.
    expect(screen.queryByLabelText('Cargo de Dueña')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Cargo de Oscar')).toBeInTheDocument();
    expect(screen.getByText('vet@refugio.test')).toBeInTheDocument();
    expect(screen.getByText('Qué puede hacer cada cargo')).toBeInTheDocument();
    // El propietario no se invita desde aquí.
    const roleSelect = screen.getByLabelText('Cargo') as HTMLSelectElement;
    expect([...roleSelect.options].map((o) => o.value)).not.toContain(Role.Owner);
  });

  it('invites by email with the chosen role', async () => {
    const calls = stubApi(teamView());
    renderShell({ route: '/organizacion/miembros', ...sessionWith([Role.Owner]) });

    fireEvent.change(await screen.findByLabelText('Correo'), {
      target: { value: 'nueva@refugio.test' },
    });
    fireEvent.change(screen.getByLabelText('Cargo'), { target: { value: Role.Veterinarian } });
    fireEvent.click(screen.getByRole('button', { name: 'Invitar' }));

    await waitFor(() =>
      expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/org/invitations'))).toBe(
        true,
      ),
    );
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.body).toEqual({ email: 'nueva@refugio.test', role: Role.Veterinarian });
  });

  it('blocks inviting when the plan is full and points to the plans', async () => {
    stubApi(teamView({ seats: { used: 2, pendingInvitations: 1, limit: 3, planName: 'Gratis' } }), [
      pendingInvite,
    ]);
    renderShell({ route: '/organizacion/miembros', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText('Puestos usados: 3 de 3')).toBeInTheDocument();
    expect(screen.getByText(/Llegaste al límite de tu plan/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'mejora tu plan' })).toHaveAttribute(
      'href',
      '/organizacion/plan',
    );
    expect(screen.getByRole('button', { name: 'Invitar' })).toBeDisabled();
  });

  it('changes a role through the API', async () => {
    const calls = stubApi(teamView());
    renderShell({ route: '/organizacion/miembros', ...sessionWith([Role.Owner]) });

    fireEvent.change(await screen.findByLabelText('Cargo de Oscar'), {
      target: { value: Role.Administrator },
    });
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PUT')).toMatchObject({
        body: { role: Role.Administrator },
      }),
    );
    expect(calls.find((c) => c.method === 'PUT')?.url).toMatch(/\/org\/members\/op-1\/role$/);
  });

  it('an Administrator cannot manage an Owner nor give the Owner role', async () => {
    const view = teamView();
    view.members.push({
      userId: 'admin-1',
      displayName: 'Ana',
      email: 'ana@refugio.test',
      roles: [Role.Administrator],
      joinedAt: '2026-02-01T00:00:00.000Z',
    });
    stubApi(view);
    renderShell({
      route: '/organizacion/miembros',
      ...sessionWith([Role.Administrator], 'admin-1'),
    });

    const oscar = (await screen.findByLabelText('Cargo de Oscar')) as HTMLSelectElement;
    expect([...oscar.options].map((o) => o.value)).not.toContain(Role.Owner);
    expect(screen.queryByLabelText('Cargo de Dueña')).not.toBeInTheDocument();
  });

  it('is not reachable for an Operator', async () => {
    stubApi(teamView());
    renderShell({ route: '/organizacion/miembros', ...sessionWith([Role.Operator]) });
    await waitFor(() =>
      expect(screen.queryByText('Miembros del equipo', { selector: 'h1' })).toBeNull(),
    );
  });
});
