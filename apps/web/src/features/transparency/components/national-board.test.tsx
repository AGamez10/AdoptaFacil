import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { NationalTransparency } from '@adoptafacil/contracts';
import { NationalBoard } from './national-board';
import { niceMax, sharesByCategory, LedgerEntryKind } from '../model/national-view';
import { normalize } from '../api/national-transparency';

const months = Array.from({ length: 12 }, (_, i) => ({
  month: `2026-${String(i + 1).padStart(2, '0')}`,
  incomeCop: i === 10 ? 900_000 : 0,
  expenseCop: i === 10 ? 300_000 : 0,
}));

const DATA: NationalTransparency = normalize({
  generatedAt: '2026-11-15T12:00:00.000Z',
  organizations: { approved: 3, reporting: 2 },
  totals: {
    incomeCop: 900_000,
    expenseCop: 300_000,
    movementCount: 4,
    onlineDonationsCop: 200_000,
    onlineDonationsCount: 2,
  },
  thisMonth: {
    month: '2026-11',
    incomeCop: 900_000,
    expenseCop: 300_000,
    movementCount: 4,
    onlineDonationsCount: 2,
  },
  months,
  categories: [
    { kind: LedgerEntryKind.Income, category: 'donacion_dinero', amountCop: 600_000 },
    { kind: LedgerEntryKind.Income, category: 'evento', amountCop: 300_000 },
    { kind: LedgerEntryKind.Expense, category: 'veterinaria', amountCop: 300_000 },
  ],
  donationDestinations: [{ destination: 'campaign', amountCop: 200_000, count: 2 }],
  departments: [
    { department: 'Antioquia', organizations: 2, incomeCop: 900_000, expenseCop: 300_000 },
  ],
  animals: { inAdoption: 7, adopted: 5 },
});

function mockFetch(body: unknown, ok = true) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response);
}

afterEach(() => vi.restoreAllMocks());

describe('Transparencia Nacional', () => {
  it('muestra las cifras del país tal como llegan de la API', async () => {
    const spy = mockFetch(DATA);
    render(<NationalBoard variant="full" />);
    expect(await screen.findByText('Recibido en el país')).toBeInTheDocument();
    expect(spy.mock.calls[0][0]).toMatch(/\/public\/transparency\/national$/);
    const kpis = screen.getByText('Recibido en el país').closest('dl')!;
    expect(within(kpis).getByText(/900\.000/)).toBeInTheDocument();
    expect(within(kpis).getByText('33 % de lo recibido')).toBeInTheDocument();
    expect(within(kpis).getByText('de 3 aprobadas en AdoptaFácil')).toBeInTheDocument();
    expect(screen.getByText('Para una campaña')).toBeInTheDocument();
    expect(screen.getByText('Antioquia')).toBeInTheDocument();
    // Doce meses, cada uno con su lectura accesible.
    expect(screen.getByTestId('national-months').querySelectorAll('li')).toHaveLength(12);
  });

  it('la versión compacta (landing) no trae el desglose', async () => {
    mockFetch(DATA);
    render(<NationalBoard variant="compact" />);
    expect(await screen.findByTestId('national-months')).toBeInTheDocument();
    expect(screen.queryByText('¿En qué se usa?')).toBeNull();
  });

  it('sin movimientos no inventa cifras ni gráfico', async () => {
    mockFetch(normalize({ months }));
    render(<NationalBoard />);
    expect(
      await screen.findByText('Aún no hay movimientos publicados en el país'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('national-months')).toBeNull();
  });

  it('si la API falla lo dice sin romper la página', async () => {
    mockFetch({ message: 'x' }, false);
    render(<NationalBoard />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos cargar las cifras del país',
    );
  });

  it('no consulta mientras no se le pide (landing bajo el pliegue)', () => {
    const spy = mockFetch(DATA);
    render(<NationalBoard enabled={false} />);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('vista del consolidado', () => {
  it('reparte por categoría de mayor a menor con su porcentaje', () => {
    const s = sharesByCategory(DATA, LedgerEntryKind.Income);
    expect(s.map((x) => [x.label, Math.round(x.pct)])).toEqual([
      ['Donación en dinero', 67],
      ['Evento o rifa', 33],
    ]);
  });

  it('elige un tope de eje redondo', () => {
    expect(niceMax(6_900_000)).toBe(10_000_000);
    expect(niceMax(2_300_000)).toBe(2_500_000);
    expect(niceMax(0)).toBe(1);
  });
});
