import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Role, type MyTeamWork, type TeamAssignment } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/** `/mi-trabajo` — el panel de cada cargo (decisión del dueño, 2026-11-22). */
function sessionWith(roles: Role[]) {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'user-1',
        name: 'Vale',
        email: 'vale@refugio.test',
        roles,
        organizationId: 'org-self',
        accountType: 'organization' as const,
      },
    },
  };
}

const luna = {
  id: 'animal-1',
  name: 'Luna',
  species: 'dog' as const,
  sex: 'female' as const,
  size: 'medium' as const,
  status: 'available' as const,
  breed: 'Criolla',
  tags: ['juguetona'],
};

const task: TeamAssignment = {
  id: 'task-1',
  kind: 'task',
  status: 'open',
  title: 'Lavar los platos de comida',
  assigneeUserId: 'user-1',
  assigneeName: 'Vale',
  createdByName: 'Oscar',
  createdAt: '2026-11-22T10:00:00.000Z',
};

const work: MyTeamWork = {
  assignments: [
    task,
    {
      id: 'care-1',
      kind: 'animal_care',
      status: 'open',
      title: 'Cuidar a Luna',
      assigneeUserId: 'user-1',
      assigneeName: 'Vale',
      animal: luna,
      createdByName: 'Oscar',
      createdAt: '2026-11-22T10:00:00.000Z',
    },
  ],
  animals: [luna],
};

type Call = { url: string; method: string; body: unknown };

function stubApi() {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      let json: unknown = [];
      if (url.endsWith('/team/me/work')) json = work;
      else if (url.endsWith('/complete')) json = { ...task, status: 'done' };
      else if (method === 'POST' && url.includes('/care-logs'))
        json = {
          id: 'log-1',
          animalId: luna.id,
          kind: 'walk',
          authorName: 'Vale',
          occurredAt: '2026-11-22T11:00:00.000Z',
          createdAt: '2026-11-22T11:00:00.000Z',
        };
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

describe('MyWorkPage', () => {
  it('shows a volunteer their tasks, the animals in their care and their volunteering', async () => {
    const calls = stubApi();
    renderShell({ route: '/mi-trabajo', ...sessionWith([Role.Volunteer]) });

    const pending = await screen.findByRole('list', { name: 'Tareas pendientes' });
    expect(within(pending).getByText('Lavar los platos de comida')).toBeInTheDocument();
    const animals = screen.getByRole('region', { name: 'Animales a mi cargo' });
    expect(within(animals).getByText('Luna')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a mi voluntariado' })).toHaveAttribute(
      'href',
      '/voluntariado',
    );
    // Ni panel clínico ni encargos del equipo.
    expect(screen.queryByText('Panel clínico')).not.toBeInTheDocument();
    expect(screen.queryByText('Encargos del equipo')).not.toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith('/team/assignees'))).toBe(false);

    fireEvent.click(within(pending).getByRole('button', { name: 'Marcar hecha' }));
    await waitFor(() =>
      expect(
        calls.some(
          (c) => c.method === 'POST' && c.url.endsWith('/team/me/assignments/task-1/complete'),
        ),
      ).toBe(true),
    );
  });

  it('lets a volunteer register a walk for an animal in their care', async () => {
    const calls = stubApi();
    renderShell({ route: '/mi-trabajo', ...sessionWith([Role.Volunteer]) });

    const card = await screen.findByTestId('care-animal-animal-1');
    fireEvent.change(within(card).getByLabelText('Nota del cuidado'), {
      target: { value: 'Caminó 20 minutos' },
    });
    fireEvent.click(within(card).getByRole('button', { name: 'Registrar' }));

    await waitFor(() =>
      expect(
        calls.find(
          (c) => c.method === 'POST' && c.url.endsWith('/team/me/animals/animal-1/care-logs'),
        )?.body,
      ).toEqual({ kind: 'walk', note: 'Caminó 20 minutos' }),
    );
  });

  it('gives a vet the clinical panel first', async () => {
    stubApi();
    renderShell({ route: '/mi-trabajo', ...sessionWith([Role.Veterinarian]) });

    expect(await screen.findByText('Panel clínico')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Recordatorios de salud' })).toHaveAttribute(
      'href',
      '/recordatorios',
    );
    expect(screen.queryByText('Mi voluntariado')).not.toBeInTheDocument();
    expect(screen.queryByText('Encargos del equipo')).not.toBeInTheDocument();
  });

  it('lets an operator hand out work', async () => {
    const calls = stubApi();
    renderShell({ route: '/mi-trabajo', ...sessionWith([Role.Operator]) });

    expect(await screen.findByText('Encargos del equipo')).toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/team/assignees'))).toBe(true));
    expect(screen.queryByText('Panel clínico')).not.toBeInTheDocument();
  });
});
