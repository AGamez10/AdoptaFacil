import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdoptionFollowUpMilestone } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * T-028c — "Mis seguimientos" at `/mis-seguimientos`: the adopter lists their
 * follow-up milestones (`GET /adoptions/followups/mine`) and responds them via
 * `/submit` (JSON) or `/photo` (multipart) when a photo is attached. Same
 * fetch-stub shape as `my-adoption-requests-page.test.tsx`.
 */
function personaSession() {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'u1',
        name: 'Persona',
        email: 'persona@test.local',
        roles: [],
        accountType: 'person' as const,
      },
    },
  };
}

const BASE: AdoptionFollowUpMilestone = {
  id: 'ms-1',
  organizationId: 'org-9',
  contractId: 'ct-1',
  requestId: 'req-1',
  adopterUserId: 'u1',
  adopterName: 'Persona',
  adopterEmail: 'persona@test.local',
  title: 'Seguimiento del primer mes',
  questionnaire: [
    { id: 'q-text', prompt: '¿Cómo se ha adaptado?', kind: 'text', required: true },
    { id: 'q-bool', prompt: '¿Ya fue al veterinario?', kind: 'boolean', required: true },
  ],
  dueAt: '2026-11-01T15:00:00.000Z',
  status: 'scheduled',
  createdAt: '2026-10-01T15:00:00.000Z',
  updatedAt: '2026-10-01T15:00:00.000Z',
  evidence: [],
};

const COMPLETED: AdoptionFollowUpMilestone = {
  ...BASE,
  id: 'ms-0',
  title: 'Seguimiento de la primera semana',
  status: 'completed',
  completedAt: '2026-10-08T20:30:00.000Z',
  evidence: [
    {
      id: 'ev-1',
      milestoneId: 'ms-0',
      kind: 'questionnaire',
      answers: { 'q-text': 'Muy bien, duerme en su cama.', 'q-bool': true },
      submittedByUserId: 'u1',
      createdAt: '2026-10-08T20:30:00.000Z',
    },
  ],
};

function okJson(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 500,
    headers: { get: () => null },
    json: async () => body,
  });
}

function stubApi(mine: unknown, ok = true) {
  const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/adoptions/followups/mine')) return okJson(mine, ok);
    if (url.includes('/adoptions/followups/')) return okJson({ ...BASE, status: 'completed' });
    return okJson({});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function callsTo(fetchMock: ReturnType<typeof stubApi>, suffix: string) {
  return fetchMock.mock.calls.filter(([input]) => String(input).endsWith(suffix));
}

afterEach(() => vi.unstubAllGlobals());

describe('MyFollowUpsPage', () => {
  it('lists pending and completed milestones; completed shows the answers given', async () => {
    stubApi([COMPLETED, BASE]);
    renderShell({ route: '/mis-seguimientos', ...personaSession() });

    expect(await screen.findByText('Seguimiento del primer mes')).toBeInTheDocument();
    expect(screen.getByText('Programado')).toBeInTheDocument();
    expect(screen.getByText('Completado')).toBeInTheDocument();
    expect(screen.getByText(/Completado el/)).toBeInTheDocument();
    expect(screen.getByText('Muy bien, duerme en su cama.')).toBeInTheDocument();
    expect(screen.getAllByText('Sí').some((el) => el.tagName === 'DD')).toBe(true);
    // Only the pending milestone renders a form.
    expect(screen.getAllByRole('button', { name: 'Enviar seguimiento' })).toHaveLength(1);
  });

  it('shows an empty state when there are no milestones', async () => {
    stubApi([]);
    renderShell({ route: '/mis-seguimientos', ...personaSession() });
    expect(await screen.findByText('No tienes seguimientos pendientes')).toBeInTheDocument();
  });

  it('shows an error state when the fetch fails', async () => {
    stubApi(null, false);
    renderShell({ route: '/mis-seguimientos', ...personaSession() });
    expect(await screen.findByText('No se pudieron cargar tus seguimientos')).toBeInTheDocument();
  });

  it('enforces required questions before submitting', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi([BASE]);
    renderShell({ route: '/mis-seguimientos', ...personaSession() });

    await user.click(await screen.findByRole('button', { name: 'Enviar seguimiento' }));
    expect(await screen.findAllByText('Esta pregunta es obligatoria.')).toHaveLength(2);
    expect(callsTo(fetchMock, '/submit')).toHaveLength(0);
  });

  it('submits the answers as JSON when no photo is attached', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi([BASE]);
    renderShell({ route: '/mis-seguimientos', ...personaSession() });

    await user.type(await screen.findByLabelText(/¿Cómo se ha adaptado\?/), 'Feliz y juguetón');
    await user.click(screen.getByRole('radio', { name: 'No' }));
    await user.click(screen.getByRole('button', { name: 'Enviar seguimiento' }));

    await waitFor(() =>
      expect(callsTo(fetchMock, '/adoptions/followups/ms-1/submit')).toHaveLength(1),
    );
    const [, init] = callsTo(fetchMock, '/adoptions/followups/ms-1/submit')[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      answers: { 'q-text': 'Feliz y juguetón', 'q-bool': false },
      complete: true,
    });
    expect(callsTo(fetchMock, '/photo')).toHaveLength(0);
    expect(await screen.findByText('Seguimiento enviado')).toBeInTheDocument();
  });

  it('uses the photo endpoint (multipart) when a photo is attached', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi([BASE]);
    renderShell({ route: '/mis-seguimientos', ...personaSession() });

    await user.type(await screen.findByLabelText(/¿Cómo se ha adaptado\?/), 'Feliz');
    await user.click(screen.getByRole('radio', { name: 'Sí' }));
    const photo = new File(['img'], 'firulais.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Foto o video adicional (opcional)'), photo);
    await user.click(screen.getByRole('button', { name: 'Enviar seguimiento' }));

    await waitFor(() =>
      expect(callsTo(fetchMock, '/adoptions/followups/ms-1/photo')).toHaveLength(1),
    );
    const [, init] = callsTo(fetchMock, '/adoptions/followups/ms-1/photo')[0];
    const form = init?.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect((form.get('file') as File).name).toBe('firulais.png');
    expect(JSON.parse(String(form.get('answers')))).toEqual({ 'q-text': 'Feliz', 'q-bool': true });
    expect(form.get('complete')).toBe('true');
    expect(callsTo(fetchMock, '/submit')).toHaveLength(0);
  });

  it('rejects a non-image file with a plain-language message', async () => {
    const user = userEvent.setup({ applyAccept: false });
    stubApi([BASE]);
    renderShell({ route: '/mis-seguimientos', ...personaSession() });

    const doc = new File(['pdf'], 'doc.pdf', { type: 'application/pdf' });
    await user.upload(await screen.findByLabelText('Foto o video adicional (opcional)'), doc);
    expect(await screen.findByText(/no es válido/)).toBeInTheDocument();
  });

  it('accepts a phone video of up to 30 s and warns when it is longer', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi([BASE]);
    // jsdom no reproduce videos: se simula la duración que leería el navegador.
    let duration = 45;
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const element = createElement(tag);
      if (tag === 'video') {
        Object.defineProperty(element, 'duration', { get: () => duration });
        Object.defineProperty(element, 'src', {
          set: () => setTimeout(() => element.onloadedmetadata?.(new Event('loadedmetadata'))),
        });
      }
      return element;
    });
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:v', revokeObjectURL: () => {} });
    renderShell({ route: '/mis-seguimientos', ...personaSession() });

    await user.type(await screen.findByLabelText(/¿Cómo se ha adaptado\?/), 'Feliz');
    await user.click(screen.getByRole('radio', { name: 'Sí' }));
    const input = screen.getByLabelText('Foto o video adicional (opcional)');
    await user.upload(input, new File(['v'], 'paseo.mp4', { type: 'video/mp4' }));
    expect(await screen.findByText(/El video dura 45 s/)).toBeInTheDocument();

    duration = 20;
    await user.upload(input, new File(['v'], 'paseo.mov', { type: 'video/quicktime' }));
    await waitFor(() => expect(screen.queryByText(/El video dura/)).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Enviar seguimiento' }));
    await waitFor(() =>
      expect(callsTo(fetchMock, '/adoptions/followups/ms-1/photo')).toHaveLength(1),
    );
    const [, init] = callsTo(fetchMock, '/adoptions/followups/ms-1/photo')[0];
    expect(((init?.body as FormData).get('file') as File).name).toBe('paseo.mov');
    vi.restoreAllMocks();
  });
});
