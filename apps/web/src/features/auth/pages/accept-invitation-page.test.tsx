import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcceptInvitationInput, InvitationPreview } from '@adoptafacil/contracts';
import { MockAuthApi, Role } from '../../../shell/api';
import { renderShell } from '../../../test-utils';
import { tokenFromHash } from './accept-invitation-page';

const TOKEN = 'A'.repeat(43);

function stubPreview(preview: InvitationPreview | null) {
  const calls: Array<{ url: string; body?: string }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, body: init?.body as string | undefined });
      const isPreview = url.includes('/auth/invitations/preview');
      const ok = !isPreview || preview !== null;
      return Promise.resolve({
        ok,
        status: ok ? 200 : 400,
        statusText: ok ? 'OK' : 'Bad Request',
        headers: { get: () => 'application/json' },
        json: async () =>
          isPreview ? (preview ?? { message: 'Invalid or expired invitation' }) : [],
      });
    }),
  );
  return calls;
}

const VET: InvitationPreview = {
  organizationName: 'Refugio Arrullo Animal',
  email: 'vet@correo.co',
  role: Role.Veterinarian,
  expiresAt: '2026-11-07T22:12:00.000Z',
};

function route() {
  window.location.hash = `#token=${TOKEN}`;
  return '/invitacion';
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = '';
});

describe('AcceptInvitationPage (/invitacion)', () => {
  it('reads the token from the fragment only', () => {
    expect(tokenFromHash(`#token=${TOKEN}`)).toBe(TOKEN);
    expect(tokenFromHash('')).toBe('');
    expect(tokenFromHash('#otra=1')).toBe('');
  });

  it('shows the organization, the invited role and what it allows, as the email said', async () => {
    const calls = stubPreview(VET);
    renderShell({ route: route(), session: { initialStatus: 'unauthenticated' } });

    expect(
      await screen.findByRole('heading', { name: 'Únete a Refugio Arrullo Animal' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Veterinario/a')).toBeInTheDocument();
    expect(screen.getByText(/historia clínica, vacunas y tratamientos/)).toBeInTheDocument();
    expect(screen.getByLabelText('Correo')).toHaveValue('vet@correo.co');
    // The token goes in the POST body, never in a URL, and leaves the address bar.
    const preview = calls.find((c) => c.url.includes('/auth/invitations/preview'));
    expect(preview?.body).toBe(JSON.stringify({ token: TOKEN }));
    expect(window.location.hash).toBe('');
  });

  it('a signer invitation shows the signer seat, not the read-only role', async () => {
    stubPreview({ ...VET, role: Role.ReadOnlyAuditor, signerRole: 'fiscal_reviewer' });
    renderShell({ route: route(), session: { initialStatus: 'unauthenticated' } });
    expect(await screen.findByText('Revisor/a fiscal')).toBeInTheDocument();
    expect(screen.queryByText('Auditor/a de solo lectura')).not.toBeInTheDocument();
  });

  it('an unusable or missing link says so instead of a blank 404', async () => {
    stubPreview(null);
    renderShell({ route: route(), session: { initialStatus: 'unauthenticated' } });
    expect(
      await screen.findByRole('heading', { name: 'Esta invitación ya no sirve' }),
    ).toBeInTheDocument();
  });

  it('creates the account only with name, a valid password and the legal authorization', async () => {
    stubPreview(VET);
    const authApi: MockAuthApi & {
      acceptInvitation?: (input: AcceptInvitationInput) => ReturnType<MockAuthApi['register']>;
    } = new MockAuthApi();
    const accepted: AcceptInvitationInput[] = [];
    authApi.acceptInvitation = (input: AcceptInvitationInput) => {
      accepted.push(input);
      return authApi.register({
        accountType: 'organization',
        organizationName: VET.organizationName,
        displayName: input.displayName,
        email: VET.email,
        password: input.password,
      });
    };
    const user = userEvent.setup();
    renderShell({ route: route(), session: { initialStatus: 'unauthenticated', authApi } });

    await screen.findByRole('heading', { name: 'Únete a Refugio Arrullo Animal' });
    await user.click(screen.getByRole('button', { name: 'Crear mi cuenta' }));
    expect(await screen.findByText('Tu nombre es obligatorio.')).toBeVisible();

    await user.type(screen.getByLabelText('Tu nombre completo'), 'Laura Pérez');
    await user.type(screen.getByLabelText('Contraseña'), 'supersecret12');
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'supersecret12');
    await user.click(screen.getByRole('button', { name: 'Crear mi cuenta' }));
    // Without the authorization nothing is sent (Ley 1581).
    expect(accepted).toHaveLength(0);

    await user.click(screen.getByTestId('invite-legal-terms'));
    await user.click(screen.getByTestId('invite-legal-data'));
    await user.click(screen.getByTestId('invite-legal-organization'));
    await user.click(screen.getByRole('button', { name: 'Crear mi cuenta' }));

    await vi.waitFor(() => expect(accepted).toHaveLength(1));
    expect(accepted[0]).toMatchObject({
      token: TOKEN,
      displayName: 'Laura Pérez',
      password: 'supersecret12',
    });
    expect(accepted[0].legalAcceptances?.length).toBeGreaterThan(0);
  });
});
