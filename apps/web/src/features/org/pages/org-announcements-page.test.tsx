import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

function sessionWith(roles: Role[]) {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'u1',
        name: 'Owner',
        email: 'owner@refugio.test',
        roles,
        organizationId: 'org-1',
        accountType: 'organization' as const,
      },
    },
  };
}

type Call = { url: string; init?: RequestInit };

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      const body = handler(String(input), init);
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => body,
        text: async () => JSON.stringify(body),
      });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const AUDIENCE = { donors: 4, adopters: 2, volunteers: 1, total: 6, remainingToday: 3 };

describe('OrgAnnouncementsPage', () => {
  it('shows reachable contacts and sends only after an explicit confirmation', async () => {
    const calls = stubFetch((_url, init) =>
      init?.method === 'POST' ? { recipients: 4 } : AUDIENCE,
    );
    renderShell({ route: '/organizacion/anuncios', ...sessionWith([Role.Owner]) });

    await userEvent.click(await screen.findByLabelText('Personas que han donado (4)'));
    await userEvent.type(screen.getByLabelText('Título'), 'Hogar temporal hoy');
    await userEvent.type(screen.getByLabelText('Mensaje'), 'Rescatamos 5 cachorros en Suba.');
    await userEvent.click(screen.getByRole('button', { name: 'Revisar y enviar' }));
    expect(calls.some((c) => c.init?.method === 'POST')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Sí, enviar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('4 personas');
    await waitFor(() => {
      const post = calls.find((c) => c.init?.method === 'POST');
      expect(JSON.parse(String(post?.init?.body))).toEqual({
        audiences: ['donors'],
        title: 'Hogar temporal hoy',
        message: 'Rescatamos 5 cachorros en Suba.',
      });
    });
  });

  it('is not reachable for an Operator (deny-by-default)', async () => {
    const calls = stubFetch(() => AUDIENCE);
    renderShell({ route: '/organizacion/anuncios', ...sessionWith([Role.Operator]) });
    await waitFor(() => expect(screen.queryByText('Nuevo anuncio')).not.toBeInTheDocument());
    expect(calls.some((c) => c.url.includes('/org/announcements'))).toBe(false);
  });
});
