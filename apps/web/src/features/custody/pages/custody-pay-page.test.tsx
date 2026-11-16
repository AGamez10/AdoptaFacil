import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CustodyPublicPayment } from '@adoptafacil/contracts';
import { CustodyPayPage } from './custody-pay-page';
import { CustodyPayResultPage } from './custody-pay-result-page';

const payment = (over: Partial<CustodyPublicPayment> = {}): CustodyPublicPayment => ({
  organizationName: 'Fundación Demo',
  animalName: 'Canela',
  conceptLabel: 'Mensualidad de guardería',
  description: 'Mensualidad de noviembre',
  amountCop: 350000,
  paidCop: 100000,
  balanceCop: 250000,
  dueDate: '2026-11-20',
  state: 'open',
  minimumCop: 5000,
  notice: 'La constancia no es una factura electrónica.',
  ...over,
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/pagar/guarderia/resultado" element={<CustodyPayResultPage />} />
        <Route path="/pagar/guarderia/:token" element={<CustodyPayPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CustodyPayPage (enlace público de pago de guardería)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('muestra el cobro y su saldo, y valida el valor antes de ir a Mercado Pago', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return json({ reference: 'af-123' });
      return json(payment());
    });
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/pagar/guarderia/tok');

    expect(await screen.findByText('Pago a Fundación Demo')).toBeInTheDocument();
    expect(screen.getByText('Mensualidad de guardería de Canela')).toBeInTheDocument();
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('250000');
    expect(screen.getByText(/no es una factura electrónica/)).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '300000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pagar con Mercado Pago' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/supera el saldo/);
    fireEvent.change(input, { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pagar con Mercado Pago' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/pago mínimo/);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Un pago parcial válido se envía con ese valor.
    fireEvent.change(input, { target: { value: '50.000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pagar con Mercado Pago' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ amountCop: 50000 });
  });

  it('un cobro ya pagado o una organización que no recibe pagos no ofrecen pagar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(payment({ state: 'paid', balanceCop: 0 }))),
    );
    renderAt('/pagar/guarderia/tok');
    expect(await screen.findByText(/ya está pagado/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pagar/ })).not.toBeInTheDocument();
  });

  it('un enlace que no existe dice lo mismo siempre', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ message: 'x' }, 404)),
    );
    renderAt('/pagar/guarderia/tok');
    expect(await screen.findByText('Este enlace de pago no es válido')).toBeInTheDocument();
  });
});

describe('CustodyPayResultPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('nunca da por aprobado un pago por lo que diga la dirección', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({
          status: 'pending',
          amountCop: 50000,
          organizationName: 'Fundación Demo',
          animalName: 'Canela',
        }),
      ),
    );
    renderAt('/pagar/guarderia/resultado?reference=af-1&status=approved');
    expect(await screen.findByText('Estamos confirmando tu pago')).toBeInTheDocument();
    expect(screen.queryByText('Pago recibido')).not.toBeInTheDocument();
  });

  it('muestra el pago recibido cuando el servidor lo confirma', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({
          status: 'approved',
          amountCop: 50000,
          organizationName: 'Fundación Demo',
          animalName: 'Canela',
          receiptNumber: 'RP-2026-000007',
        }),
      ),
    );
    renderAt('/pagar/guarderia/resultado?reference=af-1');
    expect(await screen.findByText('Pago recibido')).toBeInTheDocument();
    expect(screen.getByText(/RP-2026-000007/)).toBeInTheDocument();
  });
});
