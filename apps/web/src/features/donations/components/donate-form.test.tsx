import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { currentLegalAcceptanceItems, requiredGuestLegalDocuments } from '@adoptafacil/contracts';
import { DonateForm } from './donate-form';

/**
 * §M05, P1 — the donate form shows the transparent breakdown BEFORE paying and the
 * "cubro la comisión" checkbox drives commissionPayer. Presentational only (no
 * api/session), so it renders standalone.
 *
 * There is no card step: "Donar" calls `onDonate` directly, with NO card
 * fields.
 */
const digits = (el: HTMLElement) => Number.parseInt(el.textContent!.replace(/[^\d]/g, ''), 10);

/** Fills a valid amount and clicks "Donar a …" (single step). */
function clickDonate(organizationName = 'Refugio Patitas') {
  fireEvent.change(screen.getByPlaceholderText('50000'), { target: { value: '50000' } });
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`Donar a ${organizationName}`) }));
}

describe('DonateForm (with an active session — pre-existing behavior, non-regression)', () => {
  it('keeps the breakdown hidden and "Donar" disabled until a valid amount is entered', () => {
    render(<DonateForm organizationName="Refugio Patitas" hasSession onDonate={vi.fn()} />);
    expect(screen.queryByTestId('donation-breakdown')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Donar a Refugio Patitas/ })).toBeDisabled();
  });

  it('shows the breakdown for a valid amount; org mode charges exactly the intended amount', () => {
    render(<DonateForm organizationName="Refugio Patitas" hasSession onDonate={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('50000'), { target: { value: '50000' } });

    expect(screen.getByTestId('donation-breakdown')).toBeInTheDocument();
    // Org mode: total charged = 50000; the net the org receives is strictly less.
    expect(digits(screen.getByTestId('breakdown-amountCharged'))).toBe(50000);
    expect(digits(screen.getByTestId('breakdown-net'))).toBeLessThan(50000);
    expect(screen.getByRole('button', { name: /Donar a Refugio Patitas/ })).toBeEnabled();
  });

  it('checking "cubro la comisión" raises the total charged and nets ≈ the intended amount', () => {
    render(<DonateForm organizationName="Refugio Patitas" hasSession onDonate={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('50000'), { target: { value: '50000' } });

    const chargedOrg = digits(screen.getByTestId('breakdown-amountCharged'));
    fireEvent.click(screen.getByTestId('cover-fee'));

    const chargedDonor = digits(screen.getByTestId('breakdown-amountCharged'));
    expect(chargedDonor).toBeGreaterThan(chargedOrg);
    // Now the org receives essentially the full intended amount.
    expect(Math.abs(digits(screen.getByTestId('breakdown-net')) - 50000)).toBeLessThanOrEqual(2);
  });

  it('ADR-PAG-001: shows no AdoptaFácil fee line, since there is no per-donation fee', () => {
    render(<DonateForm organizationName="Refugio Patitas" hasSession onDonate={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('50000'), { target: { value: '50000' } });

    expect(screen.queryByText(/sostenimiento a AdoptaFácil/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Comisión AdoptaFácil/i)).not.toBeInTheDocument();
    expect(screen.getByText('Comisión pasarela (estimada)')).toBeInTheDocument();
  });

  it('the cover-fee checkbox only mentions the gateway commission and says AdoptaFácil takes none', () => {
    render(<DonateForm organizationName="Refugio Patitas" hasSession onDonate={vi.fn()} />);

    expect(
      screen.getByText(
        'Cubro la comisión de la pasarela de pago para que la organización reciba el monto completo. AdoptaFácil no cobra comisión por tu donación.',
      ),
    ).toBeInTheDocument();
  });

  it('does NOT show the guest name/email fields when there is a session', () => {
    render(<DonateForm organizationName="Refugio Patitas" hasSession onDonate={vi.fn()} />);
    expect(screen.queryByTestId('donation-guest-name')).not.toBeInTheDocument();
    expect(screen.queryByTestId('donation-guest-email')).not.toBeInTheDocument();
  });

  it('never renders a card form: "Donar" calls onDonate directly', () => {
    const onDonate = vi.fn().mockResolvedValue(undefined);
    render(<DonateForm organizationName="Refugio Patitas" hasSession onDonate={onDonate} />);
    expect(screen.getByText(/pasarela de pagos segura/)).toBeInTheDocument();
    expect(screen.queryByText(/Mercado ?Pago/i)).not.toBeInTheDocument();
    clickDonate();

    expect(onDonate).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('card-payment-brick')).not.toBeInTheDocument();
  });

  it('submits the intended amount, commission payer and anonymous — never card fields', () => {
    const onDonate = vi.fn().mockResolvedValue(undefined);
    render(<DonateForm organizationName="Refugio Patitas" hasSession onDonate={onDonate} />);
    fireEvent.change(screen.getByPlaceholderText('50000'), { target: { value: '50000' } });
    fireEvent.click(screen.getByTestId('cover-fee'));
    fireEvent.click(screen.getByRole('button', { name: /Donar a Refugio Patitas/ }));

    expect(onDonate).toHaveBeenCalledTimes(1);
    expect(onDonate).toHaveBeenCalledWith({
      intendedAmount: 50000,
      commissionPayer: 'donor',
      anonymous: false,
      guestPayer: undefined,
      legalAcceptances: undefined,
    });
  });

  it('submits anonymous: true when the "donar anónimamente" checkbox is checked', () => {
    const onDonate = vi.fn().mockResolvedValue(undefined);
    render(<DonateForm organizationName="Refugio Patitas" hasSession onDonate={onDonate} />);
    fireEvent.change(screen.getByPlaceholderText('50000'), { target: { value: '50000' } });
    fireEvent.click(screen.getByTestId('donate-anonymous'));
    clickDonate();

    expect(onDonate).toHaveBeenCalledWith(expect.objectContaining({ anonymous: true }));
  });
});

/**
 * Checkout de invitado (requisito FINAL del cliente): donar nunca exige cuenta
 * ni login. Sin sesión, el formulario pide nombre + correo y los exige antes
 * de habilitar "Donar" (un solo paso).
 */
/** El invitado acepta términos y autorización de datos (casillas obligatorias). */
function acceptGuestLegal(): void {
  fireEvent.click(screen.getByTestId('donation-legal-terms'));
  fireEvent.click(screen.getByTestId('donation-legal-data'));
}

describe('DonateForm (guest checkout — no session)', () => {
  it('no deja continuar al invitado sin aceptar términos y datos, y no le ofrece la autorización comercial', () => {
    render(<DonateForm organizationName="Refugio Patitas" hasSession={false} onDonate={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('50000'), { target: { value: '50000' } });
    fireEvent.click(screen.getByTestId('donate-anonymous'));
    expect(screen.queryByTestId('donation-legal-commercial')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Donar a Refugio Patitas/ })).toBeDisabled();
    acceptGuestLegal();
    expect(screen.getByRole('button', { name: /Donar a Refugio Patitas/ })).toBeEnabled();
  });

  it('shows the guest name/email fields and keeps "Donar" disabled until both are filled', () => {
    render(<DonateForm organizationName="Refugio Patitas" hasSession={false} onDonate={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('50000'), { target: { value: '50000' } });
    acceptGuestLegal();

    // A valid amount alone is not enough for a guest — identity is required too.
    expect(screen.getByRole('button', { name: /Donar a Refugio Patitas/ })).toBeDisabled();

    fireEvent.change(screen.getByTestId('donation-guest-name'), {
      target: { value: 'Invitado Test' },
    });
    expect(screen.getByRole('button', { name: /Donar a Refugio Patitas/ })).toBeDisabled();

    fireEvent.change(screen.getByTestId('donation-guest-email'), {
      target: { value: 'invitado@test.dev' },
    });
    expect(screen.getByRole('button', { name: /Donar a Refugio Patitas/ })).toBeEnabled();
  });

  it('keeps "Donar" disabled with an obviously invalid email', () => {
    render(<DonateForm organizationName="Refugio Patitas" hasSession={false} onDonate={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('50000'), { target: { value: '50000' } });
    fireEvent.change(screen.getByTestId('donation-guest-name'), {
      target: { value: 'Invitado Test' },
    });
    fireEvent.change(screen.getByTestId('donation-guest-email'), {
      target: { value: 'no-es-un-correo' },
    });

    expect(screen.getByRole('button', { name: /Donar a Refugio Patitas/ })).toBeDisabled();
  });

  it('asks first how to donate and hides name/email when the guest picks "anónima"', () => {
    render(<DonateForm organizationName="Refugio Patitas" hasSession={false} onDonate={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('50000'), { target: { value: '50000' } });

    // Default: identified — fields visible, button disabled until filled.
    expect(screen.getByTestId('donate-identified')).toBeChecked();
    expect(screen.getByTestId('donation-guest-name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Donar a Refugio Patitas/ })).toBeDisabled();

    acceptGuestLegal();
    fireEvent.click(screen.getByTestId('donate-anonymous'));
    expect(screen.queryByTestId('donation-guest-name')).not.toBeInTheDocument();
    expect(screen.queryByTestId('donation-guest-email')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Donar a Refugio Patitas/ })).toBeEnabled();

    // Back to identified: the fields return.
    fireEvent.click(screen.getByTestId('donate-identified'));
    expect(screen.getByTestId('donation-guest-name')).toBeInTheDocument();
  });

  it('submits an anonymous guest donation WITHOUT guestPayer', () => {
    const onDonate = vi.fn().mockResolvedValue(undefined);
    render(
      <DonateForm organizationName="Refugio Patitas" hasSession={false} onDonate={onDonate} />,
    );
    fireEvent.click(screen.getByTestId('donate-anonymous'));
    fireEvent.change(screen.getByPlaceholderText('50000'), { target: { value: '50000' } });
    acceptGuestLegal();
    clickDonate();

    expect(onDonate).toHaveBeenCalledWith(
      expect.objectContaining({ anonymous: true, guestPayer: undefined }),
    );
  });

  it('submits the guest name/email as guestPayer (no card fields) on "Donar"', () => {
    const onDonate = vi.fn().mockResolvedValue(undefined);
    render(
      <DonateForm organizationName="Refugio Patitas" hasSession={false} onDonate={onDonate} />,
    );
    fireEvent.change(screen.getByPlaceholderText('50000'), { target: { value: '50000' } });
    fireEvent.change(screen.getByTestId('donation-guest-name'), {
      target: { value: 'Invitado Test' },
    });
    fireEvent.change(screen.getByTestId('donation-guest-email'), {
      target: { value: 'invitado@test.dev' },
    });
    acceptGuestLegal();
    clickDonate();

    expect(onDonate).toHaveBeenCalledWith({
      intendedAmount: 50000,
      commissionPayer: 'organization',
      anonymous: false,
      guestPayer: { fullName: 'Invitado Test', email: 'invitado@test.dev' },
      legalAcceptances: expect.arrayContaining(
        currentLegalAcceptanceItems(requiredGuestLegalDocuments()),
      ),
    });
  });
});
