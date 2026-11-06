import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Role,
  type AccountingOverview,
  type AccountingPeriodView,
  type AccountingSharePreview,
  type AccountingTotals,
  type SignatureRequestPreview,
} from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';
import { AccountingSharePage } from './accounting-share-page';
import { SignatureRequestPage } from './signature-request-page';

vi.mock('../../../seo/seo', () => ({ useNoIndex: () => undefined }));

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

const TOTALS: AccountingTotals = {
  donationCount: 2,
  donationsGrossCop: 150000,
  refundsCop: 0,
  chargebacksCop: 0,
  balanceCop: 150000,
  feesCop: 9000,
  netCop: 141000,
  entriesWithoutFee: 0,
  adjustmentCount: 0,
  byDestination: { general: 150000, animal: 0, campaign: 0 },
  byPaymentType: { credit_card: 150000 },
};

function overview(features: AccountingOverview['features']): AccountingOverview {
  return {
    currentPeriod: '2026-11',
    periods: [
      { period: '2026-11', status: 'open', entryCount: 0, balanceCop: 0 },
      { period: '2026-10', status: 'open', entryCount: 2, balanceCop: 150000 },
    ],
    mercadopagoConnected: true,
    features,
    signers: [
      { role: 'fiscal_reviewer', displayName: 'Diana Revisora', signatureRegistered: false },
    ],
  };
}

const OCTOBER: AccountingPeriodView = {
  period: '2026-10',
  status: 'open',
  totals: TOTALS,
  entries: [
    {
      id: 'e1',
      seq: 1,
      entryType: 'donation',
      source: 'mercadopago',
      donationId: 'd1',
      gatewayPaymentId: '111',
      occurredAt: '2026-10-05T15:00:00.000Z',
      eventPeriod: '2026-10',
      period: '2026-10',
      isAdjustment: false,
      grossCop: 100000,
      feeCop: 6000,
      netCop: 94000,
      paymentType: 'credit_card',
      paymentMethod: 'visa',
      destination: 'general',
      destinationLabel: null,
      createdAt: '2026-10-05T15:00:01.000Z',
    },
  ],
  report: null,
  shares: [],
};

type Route = (url: string, init?: RequestInit) => { status?: number; body?: unknown } | undefined;
let calls: Array<{ url: string; init?: RequestInit }> = [];

function stubApi(route: Route) {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      const hit = route(url, init) ?? { body: [] };
      const status = hit.status ?? 200;
      return Promise.resolve({
        ok: status < 400,
        status,
        statusText: 'x',
        headers: { get: () => null },
        json: async () => hit.body,
        blob: async () => new Blob(['x']),
      });
    }),
  );
}

function accountingApi(features: AccountingOverview['features'], extra?: Route): Route {
  return (url, init) =>
    extra?.(url, init) ??
    (url.endsWith('/org/accounting')
      ? { body: overview(features) }
      : url.includes('/org/accounting/periods/2026-11') && !init?.method
        ? { body: { ...OCTOBER, period: '2026-11', entries: [], totals: TOTALS } }
        : url.includes('/org/accounting/periods/2026-10') && !init?.method
          ? { body: OCTOBER }
          : undefined);
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
  window.location.hash = '';
});

describe('OrgAccountingPage (/organizacion/contabilidad)', () => {
  it('shows the month ledger and, on the free plan, offers plans instead of closing', async () => {
    stubApi(accountingApi({ close: false, fullExport: false, accountantPackage: false }));
    renderShell({ route: '/organizacion/contabilidad', ...sessionWith([Role.Owner]) });

    fireEvent.click(await screen.findByRole('button', { name: /octubre de 2026/ }));
    expect(await screen.findByText('Libro auxiliar de octubre de 2026')).toBeInTheDocument();
    expect(screen.getByText('$ 94.000')).toBeInTheDocument();
    expect(
      screen.getByText(/Cerrar el mes y enviarlo a firma está incluido en los planes Crece y Pro/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cerrar octubre/ })).not.toBeInTheDocument();
  });

  it('the full export on the free plan explains the plan and links to it', async () => {
    stubApi(
      accountingApi({ close: false, fullExport: false, accountantPackage: false }, (url) =>
        url.includes('/export?format=xlsx&detail=full')
          ? {
              status: 403,
              body: {
                code: 'PLAN_REQUIRED',
                capability: 'accountingFullExport',
                requiredPlan: 'crece',
                message: 'Esta función está disponible desde el plan Crece.',
              },
            }
          : undefined,
      ),
    );
    renderShell({ route: '/organizacion/contabilidad', ...sessionWith([Role.Owner]) });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Paquete completo para el contador' }),
    );
    expect(await screen.findByText(/disponible desde el plan Crece/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Ver planes' })[0]).toHaveAttribute(
      'href',
      '/organizacion/plan',
    );
  });

  it('paid plan: closes a past month with a note and sends it to signature', async () => {
    stubApi(
      accountingApi({ close: true, fullExport: true, accountantPackage: true }, (url, init) =>
        url.endsWith('/periods/2026-10/close') && init?.method === 'POST'
          ? {
              body: {
                close: { period: '2026-10' },
                report: { id: 'r1', code: 'ADF-REP-2026-XYZ', status: 'pending_signatures' },
              },
            }
          : undefined,
      ),
    );
    renderShell({ route: '/organizacion/contabilidad', ...sessionWith([Role.Owner]) });
    fireEvent.click(await screen.findByRole('button', { name: /octubre de 2026/ }));
    fireEvent.change(await screen.findByLabelText('Nota del cierre (opcional)'), {
      target: { value: 'Revisado con tesorería' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar octubre de 2026' }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/close'))).toBe(true));
    const close = calls.find((c) => c.url.endsWith('/close'));
    expect(JSON.parse(String(close?.init?.body))).toEqual({ note: 'Revisado con tesorería' });
  });

  it('a discrepancy asks to confirm before closing anyway', async () => {
    stubApi(
      accountingApi({ close: true, fullExport: true, accountantPackage: true }, (url, init) =>
        url.endsWith('/close') && init?.method === 'POST'
          ? {
              status: 409,
              body: {
                message:
                  'La conciliación de este mes tiene descuadres. Resuélvelos o confirma que cierras sabiéndolo (y explica en la nota).',
              },
            }
          : undefined,
      ),
    );
    renderShell({ route: '/organizacion/contabilidad', ...sessionWith([Role.Owner]) });
    fireEvent.click(await screen.findByRole('button', { name: /octubre de 2026/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar octubre de 2026' }));
    const confirm = await screen.findByLabelText(/aun así cierro el mes/);
    expect(screen.getByRole('button', { name: 'Cerrar octubre de 2026' })).toBeDisabled();
    fireEvent.click(confirm);
    expect(screen.getByRole('button', { name: 'Cerrar octubre de 2026' })).toBeEnabled();
  });

  it('the read-only auditor sees the ledger but cannot close, reread or share', async () => {
    stubApi(accountingApi({ close: true, fullExport: true, accountantPackage: true }));
    renderShell({ route: '/organizacion/contabilidad', ...sessionWith([Role.ReadOnlyAuditor]) });
    fireEvent.click(await screen.findByRole('button', { name: /octubre de 2026/ }));
    expect(await screen.findByText('Libro auxiliar de octubre de 2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Releer Mercado Pago' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cerrar octubre/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar enlace' })).not.toBeInTheDocument();
  });
});

describe('AccountingSharePage (/contabilidad-compartida)', () => {
  const SHARE: AccountingSharePreview = {
    organizationName: 'Refugio Patitas',
    nit: '900123456-7',
    period: '2026-10',
    status: 'closed',
    closedAt: '2026-11-02T15:00:00.000Z',
    signerRole: 'fiscal_reviewer',
    signerName: 'Diana Revisora',
    expiresAt: '2026-12-02T15:00:00.000Z',
    totals: TOTALS,
    reconciliation: {
      counts: {
        matched: 2,
        missing_in_gateway: 0,
        missing_in_platform: 0,
        status_mismatch: 0,
        amount_mismatch: 0,
      },
      balanced: true,
      platformTotalCop: 150000,
      gatewayTotalCop: 150000,
      gatewayFeesCop: 9000,
      gatewayNetCop: 141000,
    },
    entries: OCTOBER.entries,
    report: { code: 'ADF-REP-2026-XYZ', status: 'pending_signatures' },
  };

  it('the reviewer opens the link without an account and downloads the package; the token never goes in the URL', async () => {
    window.location.hash = '#token=secreto-del-revisor-123456';
    stubApi((url) => (url.endsWith('/shares/preview') ? { body: SHARE } : undefined));
    render(<AccountingSharePage />);
    expect(
      await screen.findByText(
        /Refugio Patitas te compartió octubre de 2026 como su revisor fiscal/,
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Descargar paquete completo (Excel)' }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/shares/export'))).toBe(true));
    for (const call of calls) expect(call.url).not.toContain('secreto');
    const exp = calls.find((c) => c.url.endsWith('/shares/export'));
    expect(JSON.parse(String(exp?.init?.body))).toEqual({
      token: 'secreto-del-revisor-123456',
      format: 'xlsx',
    });
  });

  it('a revoked or expired link explains what to do', async () => {
    window.location.hash = '#token=secreto-del-revisor-123456';
    stubApi(() => ({
      status: 400,
      body: { message: 'Este enlace no es válido, venció o fue revocado.' },
    }));
    render(<AccountingSharePage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/venció o fue revocado/);
  });
});

describe('SignatureRequestPage with the monthly ledger', () => {
  it('lets the reviewer download the month supports before signing', async () => {
    window.location.hash = '#token=firma-token-1234567890';
    const preview: SignatureRequestPreview = {
      organizationName: 'Refugio Patitas',
      role: 'fiscal_reviewer',
      signerName: 'Diana Revisora',
      needsSignature: true,
      expiresAt: '2026-11-20T00:00:00.000Z',
      report: {
        kind: 'accounting',
        code: 'ADF-REP-2026-XYZ',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
        legalEffect: 'signed',
        summary: { rowCount: 2 },
        contentHash: 'a'.repeat(64),
      },
      consentText: 'Autorizo…',
      consentVersion: '2026-10-30',
    };
    stubApi((url) => (url.endsWith('/signature-requests/preview') ? { body: preview } : undefined));
    render(<SignatureRequestPage />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Descargar los soportes del mes (Excel)' }),
    );
    await waitFor(() =>
      expect(calls.some((c) => c.url.endsWith('/public/accounting/signature-package'))).toBe(true),
    );
  });
});
