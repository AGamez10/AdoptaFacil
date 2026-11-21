import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  CoffeeCampaignOption,
  CoffeeLotView,
  CoffeePhysicalSaleView,
} from '@adoptafacil/contracts';
import type { CoffeeAdminApi } from '../api/coffee-api';
import { colombiaToday } from '../model/coffee-format';
import { acceptsPhysicalSales, PhysicalSaleForm, PhysicalSalesTab } from './physical-sales';

vi.mock('@adoptafacil/ui', async (orig) => ({
  ...(await orig<typeof import('@adoptafacil/ui')>()),
  useToast: () => ({ toast: vi.fn() }),
}));

/**
 * Ventas físicas del café: el equipo registra bolsas vendidas en persona por
 * lote (sin pasar de las disponibles, con la campaña que eligió el comprador
 * o la sugerida del lote) y las corrige solo con un reverso con motivo.
 */
const LOT: CoffeeLotView = {
  id: 'lot-1',
  productId: 'prod-1',
  lotCode: 'L2-2026',
  status: 'on_sale',
  salePriceCop: 27_999,
  unitCostCop: 17_000,
  shippingFeeCop: 0,
  stockUnits: 10,
  contributionBps: 2000,
  contributionPerUnitCop: 2_200,
  defaultCampaignId: 'camp-1',
  defaultCampaignTitle: 'Cirugía de Luna',
  unitsSold: 4,
  unitsSoldInPerson: 2,
  unitsReserved: 1,
  availableUnits: 5,
  revenueCop: 0,
  contributionCommittedCop: 0,
  pendingApproval: null,
  publishedAt: '2026-11-08T00:00:00.000Z',
  createdAt: '2026-11-08T00:00:00.000Z',
};

const CAMPAIGNS: CoffeeCampaignOption[] = [
  { id: 'camp-1', title: 'Cirugía de Luna', organizationName: 'Fundación', deadline: '2027-01-01' },
  { id: 'camp-2', title: 'Vacunas', organizationName: 'Huellitas', deadline: '2027-01-01' },
];

function sale(overrides: Partial<CoffeePhysicalSaleView> = {}): CoffeePhysicalSaleView {
  return {
    id: 'sale-1',
    lotId: 'lot-1',
    productName: 'Café San Pedro 250 g',
    lotCode: 'L2-2026',
    kind: 'sale',
    reversesSaleId: null,
    reversedById: null,
    quantity: 3,
    unitPriceCop: 25_000,
    totalCop: 75_000,
    contributionPerUnitCop: 1_600,
    contributionTotalCop: 4_800,
    campaignId: 'camp-1',
    campaignTitle: 'Cirugía de Luna',
    organizationName: 'Fundación',
    campaignSource: 'lot_default',
    soldOn: '2026-11-15',
    note: 'Feria de Ibagué',
    createdAt: '2026-11-15T20:00:00.000Z',
    ...overrides,
  };
}

function fakeApi(overrides: Partial<CoffeeAdminApi> = {}): CoffeeAdminApi {
  return {
    recordPhysicalSale: vi.fn().mockResolvedValue(undefined),
    reversePhysicalSale: vi.fn().mockResolvedValue(undefined),
    physicalSales: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as CoffeeAdminApi;
}

afterEach(() => vi.clearAllMocks());

describe('ventas físicas del café', () => {
  it('solo los lotes publicados admiten ventas físicas', () => {
    expect(acceptsPhysicalSales({ status: 'on_sale' })).toBe(true);
    expect(acceptsPhysicalSales({ status: 'paused' })).toBe(true);
    expect(acceptsPhysicalSales({ status: 'draft' })).toBe(false);
    expect(acceptsPhysicalSales({ status: 'closed' })).toBe(false);
  });

  it('registra la venta con la campaña sugerida por defecto y muestra el aporte', async () => {
    const api = fakeApi();
    const reload = vi.fn().mockResolvedValue(undefined);
    render(<PhysicalSaleForm lot={LOT} campaigns={CAMPAIGNS} api={api} reload={reload} />);

    expect(
      screen.getByRole('option', { name: /La sugerida del lote: Cirugía de Luna/ }),
    ).toBeTruthy();
    // La sugerida no se repite en la lista de otras campañas.
    expect(screen.queryByRole('option', { name: /Cirugía de Luna · Fundación/ })).toBeNull();

    fireEvent.change(screen.getByLabelText('Bolsas vendidas'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Precio por bolsa'), { target: { value: '25000' } });
    // 20 % de (25.000 − 17.000) × 2.
    expect(screen.getByText(/Total/).textContent).toMatch(/50\.000.*3\.200/);

    fireEvent.click(screen.getByRole('button', { name: 'Registrar venta' }));
    await waitFor(() =>
      expect(api.recordPhysicalSale).toHaveBeenCalledWith('lot-1', {
        quantity: 2,
        unitPriceCop: 25_000,
        campaignId: undefined,
        soldOn: colombiaToday(),
        note: undefined,
      }),
    );
    expect(reload).toHaveBeenCalled();
  });

  it('manda la campaña que eligió el comprador y la nota', async () => {
    const api = fakeApi();
    render(
      <PhysicalSaleForm lot={LOT} campaigns={CAMPAIGNS} api={api} reload={vi.fn(async () => {})} />,
    );
    fireEvent.change(screen.getByLabelText('Campaña del aporte'), { target: { value: 'camp-2' } });
    fireEvent.change(screen.getByLabelText(/Nota/), { target: { value: ' Punto de venta ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar venta' }));
    await waitFor(() =>
      expect(api.recordPhysicalSale).toHaveBeenCalledWith(
        'lot-1',
        expect.objectContaining({ quantity: 1, campaignId: 'camp-2', note: 'Punto de venta' }),
      ),
    );
  });

  it('no deja registrar más bolsas de las disponibles', () => {
    render(<PhysicalSaleForm lot={LOT} campaigns={CAMPAIGNS} api={fakeApi()} reload={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Bolsas vendidas'), { target: { value: '6' } });
    expect(screen.getByRole('alert').textContent).toContain('Solo quedan 5 bolsas');
    expect(
      (screen.getByRole('button', { name: 'Registrar venta' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('si la sugerida ya no está activa, exige elegir la campaña', () => {
    render(
      <PhysicalSaleForm
        lot={{ ...LOT, defaultCampaignTitle: null }}
        campaigns={CAMPAIGNS}
        api={fakeApi()}
        reload={vi.fn()}
      />,
    );
    const submit = screen.getByRole('button', { name: 'Registrar venta' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Campaña del aporte'), { target: { value: 'camp-2' } });
    expect(submit.disabled).toBe(false);
  });

  it('una venta se anula solo con un reverso con motivo; lo anulado no se vuelve a anular', async () => {
    const api = fakeApi({
      physicalSales: vi.fn().mockResolvedValue([
        sale({ id: 'sale-2' }),
        sale({
          id: 'rev-1',
          kind: 'reversal',
          reversesSaleId: 'sale-1',
          quantity: -3,
          totalCop: -75_000,
          contributionTotalCop: -4_800,
          note: 'Se registró dos veces',
        }),
        sale({ id: 'sale-1', reversedById: 'rev-1' }),
      ]),
    });
    const reload = vi.fn().mockResolvedValue(undefined);
    render(<PhysicalSalesTab api={api} reload={reload} />);

    const reversed = await screen.findByTestId('physical-sale-sale-1');
    expect(reversed.textContent).toContain('Anulada');
    expect(reversed.querySelector('button')).toBeNull();
    const reversal = screen.getByTestId('physical-sale-rev-1');
    expect(reversal.textContent).toContain('Reverso');
    expect(reversal.textContent).toContain('Motivo: Se registró dos veces');
    expect(reversal.querySelector('button')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Anular con reverso' }));
    const confirm = screen.getByRole('button', { name: 'Confirmar reverso' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Por qué se anula/), {
      target: { value: 'Precio equivocado' },
    });
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(api.reversePhysicalSale).toHaveBeenCalledWith('sale-2', {
        reason: 'Precio equivocado',
      }),
    );
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });
});
