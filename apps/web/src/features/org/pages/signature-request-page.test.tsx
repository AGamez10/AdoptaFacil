import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SignatureRequestPreview } from '@adoptafacil/contracts';
import { SignatureRequestPage } from './signature-request-page';

vi.mock('../../../seo/seo', () => ({ useNoIndex: () => undefined }));

const PREVIEW: SignatureRequestPreview = {
  organizationName: 'Refugio Patitas',
  role: 'fiscal_reviewer',
  signerName: 'Diana Revisora',
  needsSignature: true,
  expiresAt: '2026-11-07T00:00:00.000Z',
  report: {
    kind: 'donations',
    code: 'ADF-REP-2026-ABCDEFGH',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    legalEffect: 'signed',
    summary: { rowCount: 2 },
    contentHash: 'a'.repeat(64),
  },
  consentText: 'Autorizo que mi firma quede guardada cifrada…',
  consentVersion: '2026-10-30',
};

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('SignatureRequestPage (/firmar)', () => {
  it('shows the document and lets a first-time signer choose drawing or a photo; a non-image photo is refused in the browser', async () => {
    window.location.hash = '#token=abc';
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => PREVIEW } as Response),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<SignatureRequestPage />);

    expect(
      await screen.findByText('Refugio Patitas te pide firmar como revisor fiscal'),
    ).toBeInTheDocument();
    // El token viaja en el cuerpo, nunca en la URL.
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain('abc');
    expect(JSON.parse(String(init.body))).toEqual({ token: 'abc' });

    fireEvent.click(screen.getByRole('button', { name: 'Subir foto' }));
    const input = screen.getByLabelText(/Foto de tu firma sobre papel blanco/);
    fireEvent.change(input, {
      target: { files: [new File(['%PDF-1.4'], 'firma.pdf', { type: 'application/pdf' })] },
    });
    expect(await screen.findByText('Sube una foto en PNG o JPG.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Aprobar y firmar' })).toBeDisabled(),
    );
  });
});
