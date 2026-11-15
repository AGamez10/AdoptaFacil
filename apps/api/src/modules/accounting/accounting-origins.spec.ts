import type { AccountingEntry } from '@adoptafacil/contracts';
import { buildOrigins } from './accounting-origins';

const entry = (over: Partial<AccountingEntry>): AccountingEntry => ({
  id: 'e',
  seq: 1,
  entryType: 'donation',
  source: 'mercadopago',
  donationId: 'd',
  gatewayPaymentId: '1',
  occurredAt: '2026-11-10T15:00:00.000Z',
  eventPeriod: '2026-11',
  period: '2026-11',
  isAdjustment: false,
  grossCop: 2000,
  feeCop: null,
  netCop: null,
  paymentType: 'credit_card',
  paymentMethod: 'visa',
  destination: 'general',
  destinationLabel: null,
  createdAt: '2026-11-10T15:00:00.000Z',
  ...over,
});

describe('buildOrigins', () => {
  it('clasifica libres, campañas, apadrinamientos y ventas a mano, netos de reembolsos', () => {
    const o = buildOrigins(
      [
        entry({}),
        entry({ id: 'f', seq: 2, destination: 'campaign', destinationLabel: 'Esterilización' }),
        entry({ id: 'g', seq: 3, entryType: 'refund', grossCop: -2000 }),
      ],
      [
        {
          date: '2026-11-12',
          kind: 'income',
          category: 'venta',
          concept: 'Camiseta',
          counterparty: null,
          amountCop: 50_000,
          hasSupport: true,
        },
        {
          date: '2026-11-13',
          kind: 'expense',
          category: 'alimento',
          concept: 'Concentrado',
          counterparty: 'Agro',
          amountCop: 30_000,
          hasSupport: true,
        },
      ],
      [{ paidAt: '2026-11-11T12:00:00.000Z', sponsor: 'Ana', plan: 'Mensual', amountCop: 1000 }],
    );
    const find = (origin: string) => o.income.filter((r) => r.origin === origin);
    expect(find('Donaciones libres (sin destino)')[0]).toMatchObject({ count: 1, amountCop: 0 });
    expect(find('Donaciones a campañas')[0]).toMatchObject({
      detail: 'Esterilización',
      amountCop: 2000,
    });
    expect(find('Apadrinamientos')[0]).toMatchObject({ count: 1, amountCop: 1000 });
    expect(find('Ventas (marketplace y otras)')[0]).toMatchObject({ amountCop: 50_000 });
    expect(o.incomeTotalCop).toBe(53_000);
    expect(o.expenseTotalCop).toBe(30_000);
  });
});
