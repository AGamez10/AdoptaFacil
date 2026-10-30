import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Role, type OrgReportPendingSignature, type OrgSigner } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

function sessionWith(roles: Role[]) {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'u-1',
        name: 'Persona',
        email: 'persona@patitas.org',
        roles,
        organizationId: 'org-1',
        accountType: 'organization' as const,
      },
    },
  };
}

const PENDING: OrgReportPendingSignature = {
  role: 'fiscal_reviewer',
  report: {
    id: 'rep-1',
    organizationId: 'org-1',
    kind: 'donations',
    code: 'ADF-REP-2026-ABCDEFGH',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    filters: {},
    legalEffect: 'signed',
    signers: [],
    summary: { rowCount: 2 },
    contentHash: 'a'.repeat(64),
    generatedByUserId: 'drafter-1',
    createdAt: '2026-10-01T15:00:00.000Z',
    status: 'pending_signatures',
  },
};

type Call = { url: string; init?: RequestInit };
let calls: Call[] = [];

function stubApi(routes: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      const key = Object.keys(routes).find((k) => url.includes(k));
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => (key ? routes[key] : []),
      });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('OrgSigningInboxPage (M13)', () => {
  it('lists only what the signer must sign and signs only after an explicit confirmation', async () => {
    stubApi({ '/org/reports/pending-signatures': [PENDING], '/decision': {} });
    renderShell({
      route: '/organizacion/documentos-por-firmar',
      ...sessionWith([Role.ReadOnlyAuditor]),
    });

    expect(await screen.findByText('Informe de donaciones')).toBeInTheDocument();
    expect(screen.getByText('Firmas como Revisor fiscal')).toBeInTheDocument();

    // Un solo clic NO firma: pide confirmación.
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar y firmar' }));
    expect(calls.some((c) => c.url.includes('/decision'))).toBe(false);
    expect(screen.getByText(/No se puede deshacer/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sí, firmar este documento' }));
    await waitFor(() => {
      const decision = calls.find((c) => c.url.includes('/org/reports/rep-1/decision'));
      expect(decision?.init?.method).toBe('POST');
      expect(JSON.parse(String(decision?.init?.body))).toEqual({ decision: 'approved' });
    });
  });

  it('rejecting sends the rejection and nothing else', async () => {
    stubApi({ '/org/reports/pending-signatures': [PENDING], '/decision': {} });
    renderShell({ route: '/organizacion/documentos-por-firmar', ...sessionWith([Role.Owner]) });
    fireEvent.click(await screen.findByRole('button', { name: 'Rechazar' }));
    await waitFor(() => {
      const decision = calls.find((c) => c.url.includes('/decision'));
      expect(JSON.parse(String(decision?.init?.body))).toEqual({ decision: 'rejected' });
    });
  });

  it('an empty inbox points to registering the own signature', async () => {
    stubApi({ '/org/reports/pending-signatures': [] });
    renderShell({
      route: '/organizacion/documentos-por-firmar',
      ...sessionWith([Role.ReadOnlyAuditor]),
    });
    expect(
      await screen.findByText('No tienes documentos pendientes de firma.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Regístrala aquí' })).toHaveAttribute(
      'href',
      '/organizacion/representante-legal',
    );
  });
});

const SIGNERS: OrgSigner[] = [
  {
    id: 's-1',
    role: 'fiscal_reviewer',
    status: 'active',
    email: 'revisor@firma.co',
    displayName: 'Diana Revisora',
    createdAt: '2026-10-01T15:00:00.000Z',
  },
];

describe('OrgSignersPage (M13)', () => {
  const READY = { policies: [], signers: [], nextSteps: [], schools: [] };

  it('the Owner invites by email with the auditor role and a seat; the platform never sees a password', async () => {
    stubApi({ '/org/signers': SIGNERS, '/org/reports/readiness': READY, '/org/invitations': {} });
    renderShell({ route: '/organizacion/firmantes', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText('Diana Revisora')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Correo de la persona'), {
      target: { value: 'contador@firma.co' },
    });
    fireEvent.change(screen.getByLabelText('Cargo'), { target: { value: 'accountant' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invitar' }));

    await waitFor(() => {
      const invite = calls.find((c) => c.url.endsWith('/org/invitations'));
      const body = JSON.parse(String(invite?.init?.body));
      expect(body).toEqual({
        email: 'contador@firma.co',
        role: 'read_only_auditor',
        signerRole: 'accountant',
      });
      expect(JSON.stringify(body)).not.toMatch(/password/i);
    });
  });

  it('when the server sends no real email, it says so and offers the link to copy', async () => {
    stubApi({
      '/org/signers': SIGNERS,
      '/org/reports/readiness': READY,
      '/org/invitations': {
        email: 'contador@firma.co',
        emailDelivery: 'simulated',
        simulatedInviteLink: 'http://localhost:5173/invitacion#token=abc',
      },
    });
    renderShell({ route: '/organizacion/firmantes', ...sessionWith([Role.Owner]) });

    await screen.findByText('Diana Revisora');
    fireEvent.change(screen.getByLabelText('Correo de la persona'), {
      target: { value: 'contador@firma.co' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Invitar' }));

    expect(
      await screen.findByText('El correo de invitación a contador@firma.co no se envió.'),
    ).toBeInTheDocument();
    expect(screen.getByText('http://localhost:5173/invitacion#token=abc')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copiar enlace' })).toBeInTheDocument();
    expect(screen.getByText('Invitación creada, pero el correo no salió')).toBeInTheDocument();
  });

  it('an Administrator can see the signers but gets no invite form nor revoke buttons', async () => {
    stubApi({ '/org/signers': SIGNERS, '/org/reports/readiness': READY });
    renderShell({ route: '/organizacion/firmantes', ...sessionWith([Role.Administrator]) });
    expect(await screen.findByText('Diana Revisora')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Invitar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revocar' })).not.toBeInTheDocument();
    expect(screen.getByText(/Solo el propietario de la organización vincula/)).toBeInTheDocument();
  });
});
