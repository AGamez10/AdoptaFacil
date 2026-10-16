import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortalDonateCta } from './portal-donate-cta';

const ORG = { id: 'org-1', name: 'Refugio Patitas', slug: 'patitas' };

function stubAvailability(response: { ok: boolean; body?: unknown } | 'network-error') {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      response === 'network-error'
        ? Promise.reject(new Error('offline'))
        : Promise.resolve({
            ok: response.ok,
            status: response.ok ? 200 : 500,
            json: async () => response.body,
          }),
    ),
  );
}

function renderCta() {
  return render(
    <MemoryRouter>
      <PortalDonateCta organization={ORG} />
    </MemoryRouter>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('PortalDonateCta', () => {
  it('links to the donation flow (with the slug) when the org can receive donations', async () => {
    stubAvailability({ ok: true, body: { canReceiveDonations: true } });
    renderCta();
    const cta = await screen.findByTestId('portal-donate-cta');
    expect(cta.getAttribute('href')).toContain('organizationId=org-1');
    expect(cta.getAttribute('href')).toContain('organizationSlug=patitas');
  });

  it('shows the warm "activando" message with alternatives when the API says it cannot yet', async () => {
    stubAvailability({ ok: true, body: { canReceiveDonations: false } });
    renderCta();
    const notice = await screen.findByTestId('portal-donate-activating');
    expect(notice).toHaveTextContent('Este refugio está activando sus donaciones en línea.');
    expect(
      screen.getByRole('link', { name: 'Conocer a sus animales en adopción' }),
    ).toHaveAttribute('href', '/o/patitas');
    expect(screen.queryByTestId('portal-donate-cta')).not.toBeInTheDocument();
  });

  it('fails open: keeps the "Donar" button when availability cannot be checked', async () => {
    stubAvailability('network-error');
    renderCta();
    expect(await screen.findByTestId('portal-donate-cta')).toBeInTheDocument();
    expect(screen.queryByTestId('portal-donate-activating')).not.toBeInTheDocument();
  });
});
