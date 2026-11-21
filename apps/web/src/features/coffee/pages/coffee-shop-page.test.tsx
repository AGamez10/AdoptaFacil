import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { PublicCoffeeCatalog, PublicCoffeeOffer } from '@adoptafacil/contracts';
import { CoffeeShopPage } from './coffee-shop-page';
import { PublicCoffeePage } from './public-coffee-page';

/**
 * `/cafe`: la tienda del café. Antes solo se compraba escaneando el QR; ahora
 * cualquiera elige una presentación y llega a la misma página de compra.
 */
function stubFetch(byUrl: (url: string) => { status: number; body: unknown }) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const { status, body } = byUrl(url);
      return Promise.resolve({ ok: status < 300, status, json: async () => body });
    }),
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/cafe" element={<CoffeeShopPage />} />
        <Route path="/c/:code" element={<PublicCoffeePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const CATALOG: PublicCoffeeCatalog = {
  onlineCheckout: true,
  items: [
    {
      code: 'abcd2345',
      productName: 'Café San Pedro 250 g',
      presentationGrams: 250,
      description: 'Tostión media',
      salePriceCop: 27999,
      shippingFeeCop: 0,
      availableUnits: 4,
      contributionPerUnitCop: 2200,
    },
    {
      code: 'wxyz6789',
      productName: 'Café San Pedro 500 g',
      presentationGrams: 500,
      description: null,
      salePriceCop: 49999,
      shippingFeeCop: 8000,
      availableUnits: 0,
      contributionPerUnitCop: 4000,
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe('CoffeeShopPage (/cafe)', () => {
  it('lista lo que está a la venta y lleva a la página de compra; lo agotado no se puede comprar', async () => {
    stubFetch(() => ({ status: 200, body: CATALOG }));
    renderAt('/cafe');

    expect(await screen.findByText('Café San Pedro 250 g')).toBeInTheDocument();
    const buy = screen.getByTestId('coffee-buy-abcd2345');
    expect(buy).toHaveTextContent('Comprar en línea');
    expect(buy).toHaveAttribute('href', '/c/abcd2345');
    expect(screen.getByText(/Aporta \$\s?2\.200 a una campaña/)).toBeInTheDocument();
    expect(screen.getByText('Agotado por ahora')).toBeInTheDocument();
    expect(screen.queryByTestId('coffee-buy-wxyz6789')).not.toBeInTheDocument();
    expect(screen.getByText(/capa gratuita|gratis para los refugios/)).toBeInTheDocument();
  });

  it('sin café a la venta ofrece avisar por WhatsApp', async () => {
    stubFetch(() => ({ status: 200, body: { items: [], onlineCheckout: true } }));
    renderAt('/cafe');
    expect(await screen.findByText('Estamos tostando el próximo lote')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Avísame por WhatsApp' })).toHaveAttribute(
      'href',
      expect.stringContaining('wa.me'),
    );
  });

  it('si la API falla, ofrece reintentar', async () => {
    stubFetch(() => ({ status: 500, body: {} }));
    renderAt('/cafe');
    expect(await screen.findByText('No pudimos cargar la tienda')).toBeInTheDocument();
  });

  it('con el pago en línea aún apagado, la compra se pide por WhatsApp (sin formulario que falle)', async () => {
    const offer: PublicCoffeeOffer = {
      code: 'abcd2345',
      productName: 'Café San Pedro 250 g',
      presentationGrams: 250,
      description: null,
      onlineCheckout: false,
      lot: {
        id: 'lot-1',
        lotCode: 'L-1',
        salePriceCop: 27999,
        shippingFeeCop: 0,
        availableUnits: 4,
        contributionPerUnitCop: 2200,
        suggestedCampaign: null,
      },
      impact: { unitsSold: 0, contributionCommittedCop: 0, contributionDeliveredCop: 0 },
    };
    stubFetch(() => ({ status: 200, body: offer }));
    renderAt('/c/abcd2345');
    expect(await screen.findByTestId('coffee-offline')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pedir por WhatsApp' })).toHaveAttribute(
      'href',
      expect.stringContaining('wa.me'),
    );
    expect(screen.queryByRole('button', { name: /pagar/i })).not.toBeInTheDocument();
  });
});
