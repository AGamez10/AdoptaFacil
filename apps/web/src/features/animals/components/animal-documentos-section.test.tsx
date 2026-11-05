import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClinicalEventType, Role, type ClinicalEvent } from '@adoptafacil/contracts';
import { AppProviders } from '../../../shell/app-providers';
import { AnimalDocumentosSection } from './animal-documentos-section';

/**
 * Fix (T-ANIMALS-ATTACHMENTS-AUDIT): el tab "Documentos" dejó de ser un
 * `ComingSoon` — ahora es la galería consolidada de los adjuntos reales del
 * expediente clínico (fotos, exámenes, carnet), cada uno visible en la misma
 * página sin descargarlo.
 */
function providers(children: React.ReactNode) {
  return (
    <AppProviders
      session={{
        initialStatus: 'authenticated',
        initialUser: {
          id: 'u1',
          name: 'Owner',
          email: 'owner@refugio.org',
          roles: [Role.Owner],
          organizationId: 'org-1',
          accountType: 'organization',
        },
      }}
    >
      {children}
    </AppProviders>
  );
}

function event(overrides: Partial<ClinicalEvent> = {}): ClinicalEvent {
  return {
    id: 'ev-1',
    eventId: 'logical-1',
    organizationId: 'org-1',
    animalId: 'animal-1',
    type: ClinicalEventType.Vaccine,
    occurredAt: '2026-06-01T00:00:00.000Z',
    details: {},
    version: 1,
    authorUserId: 'u1',
    attachments: [],
    createdAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function stubFetch(events: ClinicalEvent[], file: BlobPart = '%PDF-1.4 carnet') {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    let body: unknown = [];
    if (url.includes('/clinical-events')) body = events;
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => body,
      blob: async () => new Blob([file], { type: 'text/html' }),
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('AnimalDocumentosSection (fix, T-ANIMALS-ATTACHMENTS-AUDIT)', () => {
  it('shows an empty state when no clinical event has any attachment', async () => {
    stubFetch([event({ attachments: [] })]);
    render(providers(<AnimalDocumentosSection animalId="animal-1" />));

    expect(await screen.findByText('Sin documentos todavía')).toBeInTheDocument();
  });

  it('lists every attachment across all events, with its event type and date', async () => {
    stubFetch([
      event({
        type: ClinicalEventType.Vaccine,
        occurredAt: '2026-06-01T00:00:00.000Z',
        attachments: [
          { id: 'att-1', storageRef: 'private/org-1/uuid-carnet.pdf', order: 0, url: 'x' },
        ],
      }),
      event({
        id: 'ev-2',
        eventId: 'logical-2',
        type: ClinicalEventType.Surgery,
        occurredAt: '2026-07-01T00:00:00.000Z',
        attachments: [
          { id: 'att-2', storageRef: 'private/org-1/uuid-examen.pdf', order: 0, url: 'x' },
        ],
      }),
    ]);
    render(providers(<AnimalDocumentosSection animalId="animal-1" />));

    expect(await screen.findByText('Vacuna')).toBeInTheDocument();
    expect(screen.getByText('Cirugía')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Ver' })).toHaveLength(2);
  });

  it('shows the attachment in place (no download), typed by its bytes', async () => {
    const fetchMock = stubFetch([
      event({
        attachments: [
          { id: 'att-1', storageRef: 'private/org-1/uuid-carnet.pdf', order: 0, url: 'x' },
        ],
      }),
    ]);
    const created: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      created.push(blob);
      return 'blob:carnet';
    });
    URL.revokeObjectURL = vi.fn();
    render(providers(<AnimalDocumentosSection animalId="animal-1" />));

    fireEvent.click(await screen.findByRole('button', { name: 'Ver' }));

    const frame = await screen.findByTitle('Vacuna');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame).toHaveAttribute('src', 'blob:carnet');
    // Aunque el servidor dijera text/html, el blob se rehace como PDF por sus bytes.
    expect(created[0].type).toBe('application/pdf');
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes(
          `/storage/private?key=${encodeURIComponent('private/org-1/uuid-carnet.pdf')}`,
        ),
      ),
    ).toBe(true);
  });

  it('refuses to open a file that is not a PDF or an image', async () => {
    stubFetch(
      [
        event({
          attachments: [
            { id: 'att-1', storageRef: 'private/org-1/uuid-carnet.pdf', order: 0, url: 'x' },
          ],
        }),
      ],
      '<html><script>alert(1)</script></html>',
    );
    URL.createObjectURL = vi.fn(() => 'blob:x');
    render(providers(<AnimalDocumentosSection animalId="animal-1" />));

    fireEvent.click(await screen.findByRole('button', { name: 'Ver' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('no lo abrimos por seguridad');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
