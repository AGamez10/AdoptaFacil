import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { THIRD_PARTY_CONSENT_TEXTS, type ThirdPartyConsentStatus } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

const TEXTS = Object.values(THIRD_PARTY_CONSENT_TEXTS);

function status(authorized: boolean): ThirdPartyConsentStatus {
  return {
    items: [
      {
        organizationId: 'org-1',
        organizationName: 'Refugio Huellas',
        purpose: 'org_report_identification',
        authorized,
        ...(authorized
          ? { textVersion: TEXTS[0].version, grantedAt: '2026-10-10T15:00:00.000Z' }
          : {}),
      },
    ],
    texts: TEXTS,
  };
}

describe('ThirdPartyConsentsPage — uso de mis datos en reportes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('nada viene marcado; autorizar es un acto explícito y se puede retirar', async () => {
    const calls: Array<{ url: string; body?: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        let body: unknown = [];
        if (u.endsWith('/me/consents')) {
          body = init?.method === 'POST' ? status(true) : status(false);
          if (init?.method === 'POST') calls.push({ url: u, body: JSON.parse(String(init.body)) });
        } else if (u.endsWith('/me/consents/revoke')) {
          body = status(false);
          calls.push({ url: u, body: JSON.parse(String(init?.body)) });
        }
        return { ok: true, status: 200, headers: new Headers(), json: async () => body };
      }),
    );
    renderShell({
      route: '/uso-de-mis-datos',
      session: {
        initialStatus: 'authenticated' as const,
        initialUser: {
          id: 'u1',
          name: 'Persona',
          email: 'p@example.test',
          roles: [],
          organizationId: 'org-p',
          accountType: 'person' as const,
        },
      },
    });

    expect(await screen.findByText('Sin autorización')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Autorizo a Refugio Huellas/ }));
    await waitFor(() => expect(screen.getByText('Autorizado')).toBeInTheDocument());
    expect(calls[0].body).toEqual({
      organizationId: 'org-1',
      purpose: 'org_report_identification',
      version: TEXTS[0].version,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Retirar mi autorización' }));
    await waitFor(() => expect(screen.getByText('Sin autorización')).toBeInTheDocument());
    expect(calls[1].body).toEqual({
      organizationId: 'org-1',
      purpose: 'org_report_identification',
    });
  });
});
