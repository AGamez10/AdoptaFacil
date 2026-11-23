import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { CustodyCharge } from '@adoptafacil/contracts';
import type { CustodyApi } from '../api/custody-api';
import { ChargeList } from './account-panel';

const charge = (over: Partial<CustodyCharge> = {}): CustodyCharge => ({
  id: 'c1',
  animalId: 'a1',
  animalName: 'Canela',
  responsibleId: 'r1',
  responsibleName: 'Ana Pérez',
  concept: 'boarding_fee',
  description: 'Mensualidad de noviembre',
  amountCop: 350000,
  paidCop: 0,
  balanceCop: 350000,
  dueDate: '2026-11-30',
  effectiveDueDate: '2026-11-30',
  status: 'pending',
  situation: 'upcoming',
  daysOverdue: 0,
  hasSupport: false,
  extensions: [],
  payments: [],
  createdAt: '2026-11-01T12:00:00.000Z',
  ...over,
});

const URL_PAGO = 'https://adoptafacil.test/pagar/guarderia/tok123';

function renderList(charges: CustodyCharge[], onlinePayments: boolean, canWrite = true) {
  const api = {
    paymentLink: vi.fn(async (chargeId: string) => ({
      chargeId,
      url: URL_PAGO,
      createdAt: '2026-11-22T12:00:00.000Z',
    })),
    revokePaymentLink: vi.fn(async () => undefined),
  } as unknown as CustodyApi;
  const onChanged = vi.fn();
  render(
    <MemoryRouter>
      <ChargeList
        api={api}
        charges={charges}
        canWrite={canWrite}
        canManage={false}
        onlinePayments={onlinePayments}
        onChanged={onChanged}
      />
    </MemoryRouter>,
  );
  return { api, onChanged };
}

describe('ChargeList · enlace de pago en línea', () => {
  it('sin cobros, explica dónde aparece el botón del enlace', () => {
    renderList([], true);
    expect(screen.getByText(/botón "Enlace de pago"/)).toBeInTheDocument();
  });

  it('crea el enlace del cobro y lo deja listo para copiar o enviar por WhatsApp', async () => {
    const { api, onChanged } = renderList([charge()], true);
    fireEvent.click(screen.getByRole('button', { name: 'Enlace de pago' }));

    const field = (await screen.findByLabelText('Enlace de pago')) as HTMLInputElement;
    expect(field.value).toBe(URL_PAGO);
    expect(api.paymentLink).toHaveBeenCalledWith('c1');
    // La primera vez se crea: la lista se refresca para marcarlo activo.
    expect(onChanged).toHaveBeenCalled();
    expect(screen.getByText(/Envíaselo a Ana Pérez/)).toBeInTheDocument();

    const whatsapp = screen.getByRole('link', { name: 'Enviar por WhatsApp' });
    const text = decodeURIComponent(
      (whatsapp.getAttribute('href') ?? '').replace('https://wa.me/?text=', ''),
    );
    expect(text).toContain(URL_PAGO);
    expect(text).toContain('Mensualidad de noviembre');
    expect(screen.getByRole('link', { name: 'Ver como quien paga' })).toHaveAttribute(
      'href',
      URL_PAGO,
    );
  });

  it('un cobro con enlace vigente lo dice y ofrece verlo de nuevo', async () => {
    const { onChanged } = renderList([charge({ paymentLinkActive: true })], true);
    expect(screen.getByText('Enlace de pago activo')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver enlace de pago' }));
    await screen.findByLabelText('Enlace de pago');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('dejar sin efecto el enlace lo cierra y refresca la lista', async () => {
    const { api, onChanged } = renderList([charge({ paymentLinkActive: true })], true);
    fireEvent.click(screen.getByRole('button', { name: 'Ver enlace de pago' }));
    await screen.findByLabelText('Enlace de pago');
    fireEvent.click(screen.getByRole('button', { name: 'Dejar sin efecto' }));
    await waitFor(() => expect(api.revokePaymentLink).toHaveBeenCalledWith('c1'));
    await waitFor(() => expect(screen.queryByLabelText('Enlace de pago')).toBeNull());
    expect(onChanged).toHaveBeenCalled();
  });

  it('sin pago en línea, o sin permiso para cobrar, no hay botón de enlace', () => {
    renderList([charge()], false);
    expect(screen.queryByRole('button', { name: 'Enlace de pago' })).toBeNull();
  });

  it('marca el cobro con un pago en línea por revisar', () => {
    renderList([charge({ status: 'paid', onlinePaymentsInReview: 1 })], true, false);
    expect(screen.getByText('Pago en línea por revisar')).toBeInTheDocument();
  });
});
