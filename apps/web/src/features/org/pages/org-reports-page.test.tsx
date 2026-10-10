import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Role, type OrgReportsReadiness } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';
import { presetRange } from './org-reports-page';

function sessionWith(roles: Role[]) {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'owner-1',
        name: 'Dueña',
        email: 'duena@patitas.org',
        roles,
        organizationId: 'org-1',
        accountType: 'organization' as const,
      },
    },
  };
}

const READINESS: OrgReportsReadiness = {
  formalizationState: 'esal_rte',
  donationsLegalEffect: 'certified',
  socialServiceLegalEffect: 'signed',
  signers: [
    {
      role: 'legal_representative',
      registered: true,
      fullName: 'Laura Gómez',
      position: 'Representante legal',
    },
    {
      role: 'fiscal_reviewer',
      registered: true,
      fullName: 'Diana Revisora',
      position: 'Revisora fiscal',
    },
    { role: 'accountant', registered: false },
  ],
  nextSteps: [],
  schools: ['Colegio San José'],
  studentServiceMinHours: 80,
};

const REPORT = {
  id: 'rep-1',
  organizationId: 'org-1',
  kind: 'donations',
  code: 'ADF-REP-2026-ABCDEFGH',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  filters: {},
  legalEffect: 'certified',
  signers: [],
  summary: { rowCount: 2, netTotal: 133340, grossTotal: 150000 },
  contentHash: 'a'.repeat(64),
  generatedByUserId: 'owner-1',
  createdAt: '2026-10-01T15:00:00.000Z',
};

type Call = { url: string; init?: RequestInit };
let calls: Call[] = [];

function stubApi(readiness = READINESS, history: unknown[] = []) {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      let body: unknown = [];
      if (url.includes('/org/reports/readiness')) body = readiness;
      else if (url.includes('/org/reports/') && /\/(pdf|xlsx)$/.test(url)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          blob: async () => new Blob(['%PDF']),
        });
      } else if (url.endsWith('/org/reports') && init?.method === 'POST')
        body = { ...REPORT, reused: false };
      else if (url.includes('/org/reports'))
        body = { items: history, total: history.length, limit: 20, offset: 0 };
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => body,
      });
    }),
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('presetRange (períodos en hora de Colombia)', () => {
  it('mes pasado cubre el mes calendario anterior completo, también en enero', () => {
    expect(presetRange('last_month', '2026-10-09')).toEqual({
      start: '2026-09-01',
      end: '2026-09-30',
    });
    expect(presetRange('last_month', '2026-01-15')).toEqual({
      start: '2025-12-01',
      end: '2025-12-31',
    });
    expect(presetRange('last_month', '2024-03-02')).toEqual({
      start: '2024-02-01',
      end: '2024-02-29',
    });
    expect(presetRange('last_year', '2026-10-09')).toEqual({
      start: '2025-01-01',
      end: '2025-12-31',
    });
    expect(presetRange('this_month', '2026-10-09')).toEqual({
      start: '2026-10-01',
      end: '2026-10-09',
    });
  });
});

describe('OrgReportsPage (M13)', () => {
  it('shows what each report will be worth, the registered signers and the history', async () => {
    stubApi(READINESS, [REPORT]);
    renderShell({ route: '/organizacion/reportes', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText('Informe de donaciones')).toBeInTheDocument();
    expect(screen.getByText('Reporte de servicio social')).toBeInTheDocument();
    expect(screen.getAllByText('Certificado').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Laura Gómez').length).toBeGreaterThan(0);
    expect(screen.getByText('ADF-REP-2026-ABCDEFGH')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Colegio San José' })).toBeInTheDocument();
  });

  it('generates with one click: POSTs the period + default signers, then downloads the PDF', async () => {
    stubApi();
    renderShell({ route: '/organizacion/reportes', ...sessionWith([Role.Owner]) });

    const buttons = await screen.findAllByRole('button', { name: 'Generar PDF' });
    fireEvent.click(buttons[0]);

    await waitFor(() =>
      expect(calls.some((c) => c.url.endsWith('/org/reports/rep-1/pdf'))).toBe(true),
    );
    const post = calls.find((c) => c.init?.method === 'POST')!;
    const body = JSON.parse(String(post.init!.body));
    expect(body.kind).toBe('donations');
    expect(body.signerRoles).toEqual(['legal_representative', 'fiscal_reviewer']);
    expect(body.periodStart <= body.periodEnd).toBe(true);
    // Nunca envía la organización: el servidor la toma del JWT.
    expect(body.organizationId).toBeUndefined();
  });

  it('an informal org sees the informative badge and next steps, and no signer choice', async () => {
    stubApi({
      ...READINESS,
      formalizationState: 'informal',
      donationsLegalEffect: 'informative',
      socialServiceLegalEffect: 'informative',
      nextSteps: [
        'Tus reportes salen como comprobantes informativos, sin efecto legal. Formaliza tu organización.',
      ],
    });
    renderShell({ route: '/organizacion/reportes', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText(/Formaliza tu organización/)).toBeInTheDocument();
    expect(screen.getAllByText('Informativo')).toHaveLength(2);
    expect(screen.queryByText('Firman el documento')).not.toBeInTheDocument();
  });

  it('the read-only auditor can download history but cannot generate', async () => {
    stubApi(READINESS, [REPORT]);
    renderShell({ route: '/organizacion/reportes', ...sessionWith([Role.ReadOnlyAuditor]) });

    expect(await screen.findByText('ADF-REP-2026-ABCDEFGH')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Generar PDF' })).not.toBeInTheDocument();
    expect(screen.getAllByText(/Solo el propietario o un administrador/)).toHaveLength(2);
  });
});
