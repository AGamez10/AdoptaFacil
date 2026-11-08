import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReminderStatus, Role } from '@adoptafacil/contracts';
import { renderShell } from '../../test-utils';
import { DATA_CHANGED_EVENT } from '../api';
import { isUnread, kudosMessage } from './pending-bell';

/**
 * Campana de pendientes del encabezado: recordatorios clínicos abiertos + acciones
 * por revisar (del resumen de Inicio). Reemplaza la entrada "Recordatorios" del menú.
 */
function sessionWith(roles: Role[]) {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'u1',
        name: 'Tester',
        email: 'tester@example.test',
        roles,
        organizationId: 'org-1',
        accountType: 'organization' as const,
      },
    },
  };
}

const reminder = (id: string, status: ReminderStatus, dueDate: string) => ({
  id,
  organizationId: 'org-1',
  animalId: 'a1',
  clinicalEventId: 'e1',
  type: 'vaccine',
  dueDate,
  status,
  createdAt: '2026-10-01T00:00:00.000Z',
});

const SUMMARY = {
  animalsActive: 1,
  adoptionRequestsPending: 2,
  sponsorshipsActive: 0,
  donationsReceivedTotal: 0,
  documentsExpiringSoon: 0,
  documentsRejected: 0,
  formalizationLevel: 0,
  formalizationPercent: 100,
};

function stubFetch(reminders: unknown[], reads: unknown[] = [], summary: object = SUMMARY) {
  const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    const body = url.includes('/org/pending-reads')
      ? reads
      : url.includes('/clinical-reminders')
        ? reminders
        : url.includes('/org/summary')
          ? summary
          : url.includes('/org/dashboard/donations')
            ? {}
            : [];
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => body,
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('PendingBell (encabezado)', () => {
  it('muestra el contador (recordatorios abiertos + acciones) y los lista al hacer clic', async () => {
    stubFetch([
      reminder('r1', ReminderStatus.Pending, '2026-11-01T00:00:00.000Z'),
      reminder('r2', ReminderStatus.Acknowledged, '2026-10-01T00:00:00.000Z'), // atendido: no cuenta
    ]);
    renderShell({ route: '/inicio', ...sessionWith([Role.Owner]) });

    // 1 recordatorio abierto + 1 acción ("solicitudes de adopción sin revisar").
    const count = await screen.findByTestId('pending-bell-count');
    expect(count).toHaveTextContent('2');

    fireEvent.click(screen.getByTestId('pending-bell'));
    const panel = within(await screen.findByTestId('pending-bell-panel'));
    expect(panel.getByText(/2 solicitudes de adopción sin revisar/i)).toBeInTheDocument();
    expect(panel.getByText('Vacuna')).toBeInTheDocument();
    expect(panel.getByTestId('pending-bell-all')).toHaveAttribute('href', '/recordatorios');
  });

  it('sin pendientes no muestra contador y dice que todo está al día', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) =>
        Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () =>
            String(input).includes('/org/summary')
              ? { ...SUMMARY, adoptionRequestsPending: 0 }
              : [],
        }),
      ),
    );
    renderShell({ route: '/inicio', ...sessionWith([Role.Owner]) });

    const bell = await screen.findByTestId('pending-bell');
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByTestId('pending-bell-count')).not.toBeInTheDocument();
    fireEvent.click(bell);
    expect(await screen.findByText(/Todo al día/i)).toBeInTheDocument();
  });

  it('se cierra con Escape', async () => {
    stubFetch([]);
    renderShell({ route: '/inicio', ...sessionWith([Role.Owner]) });

    fireEvent.click(await screen.findByTestId('pending-bell'));
    expect(await screen.findByTestId('pending-bell-panel')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('pending-bell-panel')).not.toBeInTheDocument());
  });

  it('un rol sin acceso (Volunteer) no ve la campana ni dispara consultas de pendientes', async () => {
    stubFetch([]);
    renderShell({ route: '/inicio', ...sessionWith([Role.Volunteer]) });

    await screen.findByRole('heading', { name: 'Inicio' });
    expect(screen.queryByTestId('pending-bell')).not.toBeInTheDocument();
    const urls = vi.mocked(fetch).mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('/clinical-reminders'))).toBe(false);
  });
});

describe('PendingBell — lo atendido desaparece (Ola 3)', () => {
  it('recuenta tras una escritura, quita el pendiente y agradece al usuario', async () => {
    let summary = { ...SUMMARY, adoptionRequestsPending: 1, adoptionRequestsNew: 1 };
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.includes('/clinical-reminders')
          ? []
          : url.includes('/org/summary')
            ? summary
            : {};
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => body,
        });
      }),
    );
    renderShell({ route: '/inicio', ...sessionWith([Role.Owner]) });
    expect(await screen.findByTestId('pending-bell-count')).toHaveTextContent('1');

    // La organización abre la solicitud: pasa a "En evaluación" en el servidor.
    summary = { ...summary, adoptionRequestsNew: 0 };
    window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT));

    await waitFor(() => expect(screen.queryByTestId('pending-bell-count')).not.toBeInTheDocument());
    expect(await screen.findByTestId('pending-bell-kudos')).toHaveTextContent(/Todo al día/);
  });

  it('no felicita en la primera carga', async () => {
    stubFetch([]);
    renderShell({ route: '/inicio', ...sessionWith([Role.Owner]) });
    await screen.findByTestId('pending-bell-count');
    expect(screen.queryByTestId('pending-bell-kudos')).not.toBeInTheDocument();
  });

  it('el mensaje de reconocimiento es fijo y cuenta lo atendido', () => {
    expect(kudosMessage(1, 2)).toMatch(/Atendiste un pendiente/);
    expect(kudosMessage(3, 1)).toMatch(/Atendiste 3 pendientes/);
    expect(kudosMessage(2, 0)).toMatch(/Todo al día/);
  });
});

describe('PendingBell · marcar como leído', () => {
  it('"Marcar todas como leídas" vacía el contador y guarda las marcas', async () => {
    const fetchMock = stubFetch([
      reminder(
        '11111111-1111-4111-8111-111111111111',
        ReminderStatus.Pending,
        '2026-11-01T00:00:00.000Z',
      ),
    ]);
    renderShell({ route: '/inicio', ...sessionWith([Role.Owner]) });
    expect(await screen.findByTestId('pending-bell-count')).toHaveTextContent('2');

    fireEvent.click(screen.getByTestId('pending-bell'));
    fireEvent.click(await screen.findByTestId('pending-bell-mark-all'));

    await waitFor(() => expect(screen.queryByTestId('pending-bell-count')).toBeNull());
    // Leer no es atender: sin felicitación.
    expect(screen.queryByTestId('pending-bell-kudos')).toBeNull();
    const post = fetchMock.mock.calls.find(
      ([url, init]) => String(url).includes('/org/pending-reads') && init?.method === 'POST',
    );
    expect(post).toBeDefined();
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      keys: ['adoptions', 'reminder:11111111-1111-4111-8111-111111111111'],
    });
  });

  it('un aviso leído no cuenta, pero vuelve si llega algo nuevo después', async () => {
    stubFetch([], [{ key: 'adoptions', readAt: '2026-10-20T00:00:00.000Z' }], {
      ...SUMMARY,
      adoptionRequestsNewSince: '2026-10-10T00:00:00.000Z',
    });
    renderShell({ route: '/inicio', ...sessionWith([Role.Owner]) });
    fireEvent.click(await screen.findByTestId('pending-bell'));
    expect(await screen.findByText(/Todo al día/i)).toBeInTheDocument();
    expect(screen.queryByTestId('pending-bell-count')).toBeNull();
  });

  it('isUnread: sin marca cuenta; con marca solo cuenta si hay algo más nuevo', () => {
    expect(isUnread(undefined, null)).toBe(true);
    expect(isUnread('2026-10-20T00:00:00.000Z', null)).toBe(false);
    expect(isUnread('2026-10-20T00:00:00.000Z', '2026-10-10T00:00:00.000Z')).toBe(false);
    expect(isUnread('2026-10-20T00:00:00.000Z', '2026-10-25T00:00:00.000Z')).toBe(true);
  });
});
