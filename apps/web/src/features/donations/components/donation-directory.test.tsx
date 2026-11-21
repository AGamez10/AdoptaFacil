import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FormalizationState, type PublicDonationOrganization } from '@adoptafacil/contracts';
import { DonationDirectory } from './donation-directory';

function org(overrides: Partial<PublicDonationOrganization>): PublicDonationOrganization {
  return {
    id: overrides.name ?? 'id',
    name: 'Org',
    slug: 'org',
    formalizationState: FormalizationState.ESAL,
    rteVigente: false,
    donorBenefit: 'accounting_certificate',
    verified: true,
    canReceiveDonations: true,
    signals: {
      documentsUpToDate: true,
      publishesExpenses: false,
      reviewCount: 0,
      activeCampaigns: 0,
    },
    ...overrides,
  };
}

function stub(response: () => Promise<unknown>) {
  vi.stubGlobal('fetch', vi.fn(response));
}

afterEach(() => vi.unstubAllGlobals());

const ITEMS = [
  org({
    name: 'Huella Verde',
    slug: 'huella-verde',
    formalizationState: FormalizationState.ESAL_RTE,
    rteVigente: true,
    donorBenefit: 'tax_certificate',
    city: 'Cali',
  }),
  org({ name: 'Patitas', slug: 'patitas' }),
  org({
    name: 'Rescatistas',
    slug: 'rescatistas',
    formalizationState: FormalizationState.Informal,
    donorBenefit: 'receipt',
    verified: false,
    canReceiveDonations: false,
  }),
];

function renderDirectory(hasSession = false) {
  return render(
    <MemoryRouter initialEntries={['/donaciones']}>
      <DonationDirectory hasSession={hasSession} userName="Ana Pérez" />
    </MemoryRouter>,
  );
}

describe('DonationDirectory ("Quiero donar")', () => {
  it('shows the most formalized first with its benefit seal, and no donate button for those that cannot collect', async () => {
    stub(() => Promise.resolve({ ok: true, json: async () => ({ items: ITEMS }) }));
    renderDirectory();

    const cards = await screen.findAllByTestId('donation-directory-card');
    expect(cards.map((c) => within(c).getByRole('heading').textContent)).toEqual([
      'Huella Verde',
      'Patitas',
      'Rescatistas',
    ]);
    expect(within(cards[0]!).getByTestId('benefit-seal-tax_certificate')).toHaveTextContent(
      'Certificado con beneficio tributario',
    );
    expect(within(cards[0]!).getByRole('link', { name: 'Donar a Huella Verde' })).toHaveAttribute(
      'href',
      expect.stringContaining('organizationSlug=huella-verde'),
    );
    expect(within(cards[2]!).queryByTestId('donation-directory-donate')).not.toBeInTheDocument();
    expect(within(cards[2]!).getByTestId('donation-directory-portal')).toHaveAttribute(
      'href',
      '/o/rescatistas',
    );
    expect(screen.getByTestId('donation-group-unavailable')).toBeInTheDocument();
  });

  it('invites a visitor to sign up without requiring it', async () => {
    stub(() => Promise.resolve({ ok: true, json: async () => ({ items: ITEMS }) }));
    renderDirectory();
    await screen.findAllByTestId('donation-directory-card');
    const panels = screen.getAllByTestId('donor-account-benefits');
    expect(panels.length).toBeGreaterThan(0);
    expect(within(panels[0]!).getByText(/Puedes donar sin cuenta/)).toBeInTheDocument();
    expect(within(panels[0]!).getByTestId('donor-benefits-register')).toHaveAttribute(
      'href',
      '/register?returnTo=%2Fdonaciones',
    );
  });

  it('greets a signed-in donor with a link to their history instead', async () => {
    stub(() => Promise.resolve({ ok: true, json: async () => ({ items: ITEMS }) }));
    renderDirectory(true);
    await screen.findAllByTestId('donation-directory-card');
    expect(screen.getByText('Hola, Ana')).toBeInTheDocument();
    expect(screen.queryByTestId('donor-account-benefits')).not.toBeInTheDocument();
  });

  it('filters by search and by tax benefit, with a way back to all', async () => {
    stub(() => Promise.resolve({ ok: true, json: async () => ({ items: ITEMS }) }));
    renderDirectory();
    await screen.findAllByTestId('donation-directory-card');

    fireEvent.click(screen.getByTestId('donation-directory-tax-only'));
    expect(screen.getAllByTestId('donation-directory-card')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('donation-directory-tax-only'));

    fireEvent.change(screen.getByTestId('donation-directory-search'), {
      target: { value: 'zzz' },
    });
    expect(screen.getByTestId('donation-directory-no-results')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver todas' }));
    expect(screen.getAllByTestId('donation-directory-card')).toHaveLength(3);
  });

  it('shows an honest error with retry when the directory cannot load', async () => {
    stub(() => Promise.resolve({ ok: false, json: async () => ({}) }));
    renderDirectory();
    expect(await screen.findByTestId('donation-directory-error')).toBeInTheDocument();
    const before = vi.mocked(fetch).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }));
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThanOrEqual(before);
  });
});
