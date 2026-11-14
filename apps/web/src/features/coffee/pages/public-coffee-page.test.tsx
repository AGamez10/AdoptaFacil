import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { CoffeeCampaignOption, PublicCoffeeOffer } from '@adoptafacil/contracts';
import { PublicCoffeePage } from './public-coffee-page';
import { CoffeeOrderPage } from './coffee-order-page';

/**
 * Café de AdoptaFácil: el QR fijo (`/c/:code?o=qr`) lleva al lote a la venta,
 * con la campaña sugerida del lote y la opción de elegir otra; el checkout
 * responde 409 con un código de negocio que la página traduce.
 */
const CODE = 'abcd2345';
const SUGGESTED: CoffeeCampaignOption = {
  id: 'camp-1',
  title: 'Cirugía de Lupe',
  organizationName: 'Refugio Patitas',
  deadline: '2026-12-31T00:00:00.000Z',
};
const OTHER: CoffeeCampaignOption = {
  id: 'camp-2',
  title: 'Vacunas de invierno',
  organizationName: 'Huellitas',
  deadline: '2026-12-31T00:00:00.000Z',
};

function offer(lot: Partial<NonNullable<PublicCoffeeOffer['lot']>> | null = {}): PublicCoffeeOffer {
  return {
    code: CODE,
    productName: 'Café de origen 250 g',
    presentationGrams: 250,
    description: null,
    lot:
      lot === null
        ? null
        : {
            id: 'lot-1',
            lotCode: 'L-001',
            salePriceCop: 30000,
            shippingFeeCop: 0,
            availableUnits: 5,
            contributionPerUnitCop: 2200,
            suggestedCampaign: SUGGESTED,
            ...lot,
          },
    impact: { unitsSold: 12, contributionCommittedCop: 26400, contributionDeliveredCop: 0 },
  };
}

type Handler = (url: string, init?: RequestInit) => { status: number; body: unknown };

function stubFetch(handler: Handler) {
  const fn = vi.fn((url: string, init?: RequestInit) => {
    const { status, body } = handler(url, init);
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/c/:code" element={<PublicCoffeePage />} />
        <Route path="/cafe/pedido/:reference" element={<CoffeeOrderPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function fillBuyer() {
  const values: Record<string, string> = {
    'Nombre completo': 'Ana Pérez',
    'Correo (aquí llega tu comprobante)': 'ana@example.com',
    Celular: '3001234567',
    'Dirección de entrega': 'Calle 1 # 2-3',
    'Ciudad o municipio': 'Medellín',
    Departamento: 'Antioquia',
  };
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  fireEvent.click(screen.getByRole('checkbox'));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PublicCoffeePage', () => {
  it('counts the scan as QR and shows the lot suggested campaign', async () => {
    const fetchMock = stubFetch(() => ({ status: 200, body: offer() }));
    renderAt(`/c/${CODE}?o=qr`);

    expect(await screen.findByText('Café de origen 250 g')).toBeInTheDocument();
    expect(screen.getByText('Cirugía de Lupe')).toBeInTheDocument();
    expect(screen.getByText('Sugerida')).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`/public/coffee/${CODE}?o=qr`);
  });

  it('shows sold out (no form) when the lot has no bags left', async () => {
    stubFetch(() => ({ status: 200, body: offer({ availableUnits: 0 }) }));
    renderAt(`/c/${CODE}`);
    expect(await screen.findByText('Este café está agotado por ahora')).toBeInTheDocument();
    expect(screen.queryByText('Pagar con Mercado Pago')).not.toBeInTheDocument();
  });

  it('lets the buyer pick another campaign and sends it to checkout', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    let checkoutBody: Record<string, unknown> | null = null;
    stubFetch((url, init) => {
      if (url.endsWith('/public/coffee/campaigns'))
        return { status: 200, body: { items: [SUGGESTED, OTHER] } };
      if (url.endsWith('/checkout')) {
        checkoutBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return {
          status: 201,
          body: {
            reference: 'cafe-abcdefghjkmnpqrstuvwxyz2',
            checkoutUrl: 'https://mp.test/checkout',
            reservedUntil: '2026-11-08T03:15:00.000Z',
            totalCop: 30000,
          },
        };
      }
      return { status: 200, body: offer() };
    });
    renderAt(`/c/${CODE}`);

    fireEvent.click(await screen.findByText('Elegir otra campaña'));
    fireEvent.click(await screen.findByText('Vacunas de invierno'));
    fillBuyer();
    fireEvent.click(screen.getByText('Pagar con Mercado Pago'));

    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://mp.test/checkout'));
    expect(checkoutBody).toMatchObject({
      lotId: 'lot-1',
      quantity: 1,
      campaignId: 'camp-2',
      acceptPrivacy: true,
    });
  });

  it('asks for another campaign when the chosen one closed (409 CAMPAIGN_CLOSED)', async () => {
    stubFetch((url) => {
      if (url.endsWith('/public/coffee/campaigns'))
        return { status: 200, body: { items: [OTHER] } };
      if (url.endsWith('/checkout'))
        return {
          status: 409,
          body: { code: 'CAMPAIGN_CLOSED', message: 'Esa campaña ya cerró. Elige otra.' },
        };
      return { status: 200, body: offer() };
    });
    renderAt(`/c/${CODE}`);

    await screen.findByText('Cirugía de Lupe');
    fillBuyer();
    fireEvent.click(screen.getByText('Pagar con Mercado Pago'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Esa campaña ya cerró');
    expect(await screen.findByText('Vacunas de invierno')).toBeInTheDocument();
  });

  it('shows not-found for a code that is not a coffee code', async () => {
    const fetchMock = stubFetch(() => ({ status: 404, body: {} }));
    renderAt('/c/NOPE');
    expect(await screen.findByText('Código no encontrado')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('CoffeeOrderPage', () => {
  it('shows the paid order with the chosen campaign and the contribution', async () => {
    stubFetch(() => ({
      status: 200,
      body: {
        reference: 'cafe-abcdefghjkmnpqrstuvwxyz2',
        status: 'paid',
        productName: 'Café de origen 250 g',
        lotCode: 'L-001',
        quantity: 2,
        totalCop: 60000,
        campaignTitle: 'Vacunas de invierno',
        organizationName: 'Huellitas',
        contributionTotalCop: 4400,
      },
    }));
    renderAt('/cafe/pedido/cafe-abcdefghjkmnpqrstuvwxyz2');

    expect(await screen.findByText('¡Pago confirmado!')).toBeInTheDocument();
    expect(screen.getByText('Vacunas de invierno')).toBeInTheDocument();
    expect(screen.getByText('Aporte de AdoptaFácil')).toBeInTheDocument();
  });
});
