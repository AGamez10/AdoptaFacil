import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';
import { groupQueue } from './platform-documents-review-page';

function sessionWith(roles: Role[]) {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'admin-1',
        name: 'Admin',
        email: 'admin@plataforma.test',
        roles,
        organizationId: 'org-self',
        accountType: 'organization' as const,
      },
    },
  };
}

const doc = (
  id: string,
  organizationId: string,
  organizationName: string,
  type: string,
  createdAt: string,
) => ({
  id,
  organizationId,
  organizationName,
  type,
  version: 1,
  status: 'pending',
  storageRef: `private/${organizationId}/documents/${id}.pdf`,
  createdAt,
});

const QUEUE = [
  doc('d-1', 'org-new', 'Refugio Nuevo', 'rut', '2026-10-05T12:00:00.000Z'),
  doc('d-2', 'org-old', 'Fundación Antigua', 'rut', '2026-10-01T12:00:00.000Z'),
  doc(
    'd-3',
    'org-old',
    'Fundación Antigua',
    'existence_representation_certificate',
    '2026-10-02T12:00:00.000Z',
  ),
];

const FUTURE = new Date(Date.now() + 20 * 60 * 1000).toISOString();

function stubFetch(
  handler: (url: string, init?: RequestInit) => { status?: number; body?: unknown },
) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      const { status = 200, body } = handler(url, init);
      return Promise.resolve({
        ok: status < 400,
        status,
        headers: { get: () => null },
        json: async () => body,
      });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('groupQueue', () => {
  it('groups by organization, oldest first, and lists missing key documents', () => {
    const groups = groupQueue(QUEUE as never);
    expect(groups.map((g) => g.organizationName)).toEqual(['Fundación Antigua', 'Refugio Nuevo']);
    expect(groups[0]?.documents).toHaveLength(2);
    expect(groups[0]?.missingKeyDocuments).toEqual([]);
    expect(groups[1]?.missingKeyDocuments).toEqual(['existence_representation_certificate']);
  });
});

describe('PlatformDocumentsReviewPage (R3-6 workspace)', () => {
  it('shows expedientes grouped by organization; decisions only after reserving', async () => {
    const calls = stubFetch((url, init) => {
      if (url.includes('/platform/review-claims/org-old') && init?.method === 'PUT') {
        return {
          body: {
            organizationId: 'org-old',
            reviewerUserId: 'admin-1',
            reviewerEmail: 'admin@plataforma.test',
            claimedAt: new Date().toISOString(),
            expiresAt: FUTURE,
          },
        };
      }
      if (url.includes('/platform/review-claims')) return { body: [] };
      if (url.includes('/platform/documents/queue')) return { body: QUEUE };
      return { body: {} };
    });
    renderShell({ route: '/plataforma/documentos', ...sessionWith([Role.PlatformAdmin]) });

    const groups = await screen.findAllByTestId('review-group');
    expect(groups).toHaveLength(2);
    expect(
      within(groups[0]!).getByRole('heading', { name: 'Fundación Antigua' }),
    ).toBeInTheDocument();
    expect(
      within(groups[1]!).getByText(/Aún no envía: Certificado de existencia/),
    ).toBeInTheDocument();

    // Sin reserva no hay botones de decisión.
    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument();
    fireEvent.click(within(groups[0]!).getByRole('button', { name: 'Reservar expediente' }));

    expect(await within(groups[0]!).findByText(/Lo revisas tú/)).toBeInTheDocument();
    expect(within(groups[0]!).getAllByRole('button', { name: 'Aprobar' })).toHaveLength(2);
    expect(calls.some((c) => c.init?.method === 'PUT')).toBe(true);
  });

  it('a group reserved by someone else shows who has it and no decisions', async () => {
    stubFetch((url) => {
      if (url.includes('/platform/review-claims')) {
        return {
          body: [
            {
              organizationId: 'org-old',
              reviewerUserId: 'admin-2',
              reviewerEmail: 'otra@plataforma.test',
              claimedAt: new Date().toISOString(),
              expiresAt: FUTURE,
            },
          ],
        };
      }
      if (url.includes('/platform/documents/queue')) return { body: QUEUE };
      return { body: {} };
    });
    renderShell({ route: '/plataforma/documentos', ...sessionWith([Role.PlatformAdmin]) });

    const groups = await screen.findAllByTestId('review-group');
    expect(within(groups[0]!).getByText('Lo revisa otra@plataforma.test')).toBeInTheDocument();
    expect(within(groups[0]!).queryByRole('button', { name: 'Reservar expediente' })).toBeNull();
    expect(within(groups[0]!).queryByRole('button', { name: 'Liberar reserva' })).toBeNull();
    expect(within(groups[0]!).queryByRole('button', { name: 'Aprobar' })).toBeNull();
  });

  it('observing still requires a reason', async () => {
    const calls = stubFetch((url) => {
      if (url.includes('/platform/review-claims')) {
        return {
          body: [
            {
              organizationId: 'org-new',
              reviewerUserId: 'admin-1',
              reviewerEmail: 'admin@plataforma.test',
              claimedAt: new Date().toISOString(),
              expiresAt: FUTURE,
            },
          ],
        };
      }
      if (url.includes('/platform/documents/queue')) return { body: QUEUE };
      return { body: {} };
    });
    renderShell({ route: '/plataforma/documentos', ...sessionWith([Role.PlatformAdmin]) });

    fireEvent.click(await screen.findByRole('button', { name: 'Observar' }));
    await waitFor(() => expect(calls.some((c) => c.init?.method === 'POST')).toBe(false));
  });

  it('org roles get no access', async () => {
    stubFetch(() => ({ body: [] }));
    renderShell({ route: '/plataforma/documentos', ...sessionWith([Role.Owner]) });
    expect(
      await screen.findByText(/No tienes permisos|Sin acceso|no tienes acceso/i),
    ).toBeInTheDocument();
  });
});
