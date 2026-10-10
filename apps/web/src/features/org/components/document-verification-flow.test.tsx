import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentType, FormalizationState, Role } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';
import { promotionPath } from '../pages/platform-documents-review-page';

function sessionWith(roles: Role[], id = 'admin-1') {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id,
        name: 'Usuario',
        email: 'u@test.local',
        roles,
        organizationId: 'org-self',
        accountType: 'organization' as const,
      },
    },
  };
}

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => handler(url, init),
      });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const FUTURE = new Date(Date.now() + 20 * 60 * 1000).toISOString();
const RUT_DOC = {
  id: 'doc-rut',
  organizationId: 'org-a',
  organizationName: 'Fundación Patitas',
  type: 'rut',
  version: 1,
  status: 'pending',
  storageRef: 'private/org-a/documents/doc-rut.pdf',
  createdAt: '2026-10-01T12:00:00.000Z',
};
const REPORT = {
  documentId: 'doc-rut',
  organizationId: 'org-a',
  type: 'rut',
  method: 'pdf_text',
  fields: [{ key: 'nit', label: 'NIT', value: '901234567-1' }],
  checks: [
    { id: 'kind', label: 'Es un RUT de la DIAN', result: 'pass', detail: 'Ok.' },
    { id: 'rte', label: 'Está en el RTE (04)', result: 'pass', detail: 'Respalda RTE.' },
  ],
  suggestion: 'approve',
  suggestedState: 'esal_rte',
  currentState: 'esal',
  links: [{ label: 'Consultar estado del RUT en la DIAN', url: 'https://muisca.dian.gov.co/' }],
};

describe('promotionPath', () => {
  const rut = { documentId: 'r', type: DocumentType.Rut, target: FormalizationState.ESAL_RTE };
  const cerl = {
    documentId: 'c',
    type: DocumentType.ExistenceRepresentationCertificate,
    target: FormalizationState.ESAL,
  };

  it('con RUT 04 y certificado de ESAL sube en un clic desde En proceso hasta ESAL con RTE', () => {
    expect(
      promotionPath({
        organizationName: 'X',
        currentState: FormalizationState.EnProceso,
        candidates: [rut, cerl],
      }),
    ).toEqual([
      { target: FormalizationState.Formalizada },
      { target: FormalizationState.ESAL, documentId: 'c' },
      { target: FormalizationState.ESAL_RTE, documentId: 'r' },
    ]);
  });

  it('sin el certificado no ofrece nada; con un RUT 05 se queda en ESAL', () => {
    expect(
      promotionPath({
        organizationName: 'X',
        currentState: FormalizationState.EnProceso,
        candidates: [rut],
      }),
    ).toEqual([]);
    const rutOrdinario = { ...rut, target: FormalizationState.EnProceso };
    expect(
      promotionPath({
        organizationName: 'X',
        currentState: FormalizationState.EnProceso,
        candidates: [rutOrdinario, cerl],
      }).map((s) => s.target),
    ).toEqual([FormalizationState.Formalizada, FormalizationState.ESAL]);
  });
});

describe('Revisión con lectura automática', () => {
  it('aprueba en un clic y luego ofrece subir a ESAL con RTE', async () => {
    let decided = false;
    const calls = stubFetch((url, init) => {
      if (url.includes('/platform/review-claims')) {
        return [
          {
            organizationId: 'org-a',
            reviewerUserId: 'admin-1',
            reviewerEmail: 'u@test.local',
            claimedAt: new Date().toISOString(),
            expiresAt: FUTURE,
          },
        ];
      }
      if (url.includes('/platform/documents/queue')) return decided ? [] : [RUT_DOC];
      if (url.includes('/verification')) return REPORT;
      if (url.includes('/decision')) {
        decided = true;
        return { ...RUT_DOC, status: 'approved' };
      }
      if (url.includes('/formalization/transitions') && init?.method === 'POST') {
        return { status: { state: 'esal_rte', rteVigente: true }, transition: {} };
      }
      return {};
    });
    renderShell({ route: '/plataforma/documentos', ...sessionWith([Role.PlatformAdmin]) });

    const panel = await screen.findByTestId('verification-panel');
    expect(within(panel).getByText(/Todo coincide/)).toBeInTheDocument();
    expect(within(panel).getByText('901234567-1')).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'Aprobar' }));

    const promote = await screen.findByRole('button', { name: 'Subir a ESAL con RTE' });
    expect(calls.some((c) => c.url.includes('/doc-rut/decision'))).toBe(true);
    fireEvent.click(promote);

    await waitFor(() => {
      const post = calls.find((c) => c.url.includes('/org-a/formalization/transitions'));
      expect(post).toBeDefined();
      expect(JSON.parse(String(post!.init!.body))).toMatchObject({
        targetState: 'esal_rte',
        evidenceDocumentId: 'doc-rut',
      });
    });
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Subir a ESAL con RTE' }),
      ).not.toBeInTheDocument(),
    );
  });
});

describe('Panel de funciones de la organización', () => {
  it('muestra lo habilitado y lo que desbloquea el siguiente estado', async () => {
    stubFetch((url) => {
      if (url.includes('/org/formalization/capabilities')) {
        return {
          state: 'informal',
          rteVigente: false,
          capabilities: [
            {
              capability: 'receive_donations',
              enabled: true,
              legalEffect: 'none',
              description: 'Recibir donaciones.',
              basis: '',
              unlocksAt: 'informal',
              pendingReview: [],
            },
            {
              capability: 'donation_tax_certificate',
              enabled: false,
              legalEffect: 'tax',
              description: 'Certificado tributario.',
              basis: '',
              unlocksAt: 'esal_rte',
              pendingReview: [],
            },
          ],
          next: { state: 'en_proceso', unlocks: [], requiredDocuments: [] },
        };
      }
      if (url.includes('/org/formalization/history')) return [];
      if (url.includes('/org/formalization')) return { state: 'informal', rteVigente: false };
      return {};
    });
    renderShell({
      route: '/organizacion/formalizacion',
      ...sessionWith([Role.Owner], 'owner-1'),
    });

    const panel = await screen.findByTestId('capabilities-panel');
    expect(within(panel).getByText('Recibir donaciones en tu cuenta')).toBeInTheDocument();
    expect(
      within(panel).queryByText('Certificado de donación con beneficio tributario'),
    ).not.toBeInTheDocument();
    expect(within(panel).getByText(/Aún no tienes RUT/)).toBeInTheDocument();
  });
});
