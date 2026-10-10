import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { renderShell } from '../../test-utils';
import { colombiaDateTime, describeApproval } from './model/workspace-format';

/**
 * F19 · espacio del equipo de plataforma: la puerta del segundo factor y la
 * pantalla /plataforma/equipo, contra un fetch simulado.
 */
function staffSession(roles: Role[]) {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'lead-1',
        name: 'Líder',
        email: 'lider@plataforma.test',
        roles,
        organizationId: 'team-a',
        accountType: 'person' as const,
      },
    },
  };
}

type Handler = (url: string, init?: RequestInit) => { status?: number; body: unknown } | undefined;

function stubFetch(handler: Handler) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      const result = handler(url, init) ?? { body: {} };
      const status = result.status ?? 200;
      return Promise.resolve({
        ok: status < 400,
        status,
        statusText: '',
        headers: { get: () => null },
        json: async () => result.body,
      });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const ME = {
  userId: 'lead-1',
  email: 'lider@plataforma.test',
  displayName: 'Líder',
  teamOrganizationId: 'team-a',
  teamName: 'Equipo A',
  roles: [Role.PlatformSuperAdmin],
  mfa: {
    required: true,
    enrolled: true,
    verified: true,
    verifiedUntil: '2026-10-10T20:00:00.000Z',
  },
  policy: {
    accessTtlSeconds: 600,
    mfaSessionMaxSeconds: 28800,
    idleTimeoutSeconds: 1800,
    sensitiveActionTtlSeconds: 86400,
  },
};
const TEAM = [
  {
    userId: 'lead-1',
    email: 'lider@plataforma.test',
    displayName: 'Líder',
    roles: [Role.PlatformSuperAdmin],
    mfaEnrolled: true,
    joinedAt: '2026-10-01T15:00:00.000Z',
  },
  {
    userId: 'lead-2',
    email: 'otra@plataforma.test',
    displayName: 'Otra líder',
    roles: [Role.PlatformSuperAdmin],
    mfaEnrolled: true,
    joinedAt: '2026-10-02T15:00:00.000Z',
  },
];
const PENDING = {
  id: 'req-1',
  type: 'staff.role_grant',
  payload: { userId: 'lead-1', role: Role.PlatformAdmin },
  reason: 'Cubrir turnos',
  status: 'pending',
  requestedByUserId: 'lead-2',
  requestedByEmail: 'otra@plataforma.test',
  requestedAt: '2026-10-09T15:00:00.000Z',
  expiresAt: '2026-10-10T15:00:00.000Z',
  decidedByUserId: null,
  decidedByEmail: null,
  decidedAt: null,
  decisionNote: null,
  downloadableUntil: null,
};

describe('PlatformMfaGate (F19)', () => {
  it('asks platform staff for their code before showing the portal, then lets them in', async () => {
    let verified = false;
    const calls = stubFetch((url) => {
      if (url.endsWith('/auth/mfa/status')) {
        return { body: { required: true, enrolled: true, verified, verifiedUntil: null } };
      }
      if (url.endsWith('/auth/mfa/verify')) {
        verified = true;
        return { body: { accessToken: 'new-access', refreshToken: 'new-refresh', expiresIn: 600 } };
      }
      if (url.endsWith('/platform/workspace/me')) return { body: ME };
      if (url.endsWith('/platform/workspace/team')) return { body: TEAM };
      return { body: [] };
    });
    renderShell({ route: '/plataforma/equipo', ...staffSession([Role.PlatformSuperAdmin]) });

    expect(await screen.findByText('Confirma que eres tú')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Código de 6 dígitos'), '12a3456');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText('Equipo · Equipo A')).toBeInTheDocument();
    const verify = calls.find((c) => c.url.endsWith('/auth/mfa/verify'));
    expect(JSON.parse(String(verify?.init?.body))).toEqual({ code: '123456' });
  });

  it('a not-yet-enrolled account goes through password → QR → first code', async () => {
    stubFetch((url) => {
      if (url.endsWith('/auth/mfa/status')) {
        return { body: { required: true, enrolled: false, verified: false, verifiedUntil: null } };
      }
      if (url.endsWith('/auth/mfa/enroll')) {
        return {
          body: {
            secret: 'JBSWY3DPEHPK3PXP',
            otpauthUri: 'otpauth://totp/x',
            qrDataUrl: 'data:image/png;base64,AA',
          },
        };
      }
      return { body: [] };
    });
    renderShell({ route: '/plataforma/equipo', ...staffSession([Role.PlatformAdmin]) });

    expect(await screen.findByText('Activa la verificación en dos pasos')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mi-clave-larga-123');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByAltText(/Código QR/)).toBeInTheDocument();
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activar' })).toBeDisabled();
  });

  it('organization accounts never see the second factor', async () => {
    const calls = stubFetch(() => ({ body: [] }));
    renderShell({ route: '/inicio', ...staffSession([Role.Owner]) });
    await waitFor(() => expect(screen.queryByText('Confirma que eres tú')).not.toBeInTheDocument());
    expect(calls.some((c) => c.url.endsWith('/auth/mfa/status'))).toBe(false);
  });
});

describe('PlatformTeamPage (F19)', () => {
  it('a lead approves another lead’s request with a fresh code', async () => {
    const calls = stubFetch((url, init) => {
      if (url.endsWith('/auth/mfa/status')) {
        return { body: { required: true, enrolled: true, verified: true, verifiedUntil: null } };
      }
      if (url.endsWith('/platform/workspace/me')) return { body: ME };
      if (url.endsWith('/platform/workspace/team')) return { body: TEAM };
      if (
        url.endsWith('/platform/workspace/approvals') &&
        (!init?.method || init.method === 'GET')
      ) {
        return { body: [PENDING] };
      }
      if (url.endsWith('/approvals/req-1/approve'))
        return { body: { ...PENDING, status: 'approved' } };
      return { body: [] };
    });
    renderShell({ route: '/plataforma/equipo', ...staffSession([Role.PlatformSuperAdmin]) });

    await userEvent.click(await screen.findByRole('tab', { name: 'Aprobaciones' }));
    expect(await screen.findByText('Dar Analista (PlatformAdmin) a Tú')).toBeInTheDocument();
    const approve = screen.getByRole('button', { name: 'Aprobar' });
    expect(approve).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Tu código para aprobar'), '654321');
    await userEvent.click(approve);

    await waitFor(() =>
      expect(calls.some((c) => c.url.endsWith('/approvals/req-1/approve'))).toBe(true),
    );
    const sent = calls.find((c) => c.url.endsWith('/approvals/req-1/approve'));
    expect(JSON.parse(String(sent?.init?.body))).toEqual({ code: '654321' });
  });
});

describe('workspace format', () => {
  it('shows UTC instants in Colombia time', () => {
    // 15:00 UTC = 10:00 a. m. in Bogotá (UTC-5, no DST).
    expect(colombiaDateTime('2026-10-09T15:00:00.000Z')).toMatch(/10:00/);
  });

  it('describes what a request will do in plain words', () => {
    expect(
      describeApproval(
        { type: 'audit.export', payload: { from: '2026-01-01', to: '2026-01-31' } },
        () => 'x',
      ),
    ).toBe('Exportar la bitácora del 2026-01-01 al 2026-01-31');
  });
});
