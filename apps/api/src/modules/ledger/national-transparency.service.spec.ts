import { NationalTransparencyService, normalizeNational } from './national-transparency.service';

describe('Transparencia Nacional (servicio)', () => {
  it('normaliza números de Postgres (bigint como texto) y listas ausentes', () => {
    const out = normalizeNational({
      organizations: { approved: '3', reporting: 2 },
      totals: { incomeCop: '1500000', expenseCop: 500000, movementCount: '4' },
      months: [{ month: '2026-11', incomeCop: '1500000', expenseCop: '500000' }],
      departments: [{ department: null, organizations: '1', incomeCop: '0', expenseCop: '0' }],
    });
    expect(out.organizations).toEqual({ approved: 3, reporting: 2 });
    expect(out.totals.incomeCop).toBe(1_500_000);
    expect(out.totals.onlineDonationsCount).toBe(0);
    expect(out.months[0]).toEqual({ month: '2026-11', incomeCop: 1_500_000, expenseCop: 500_000 });
    expect(out.departments[0].department).toBeNull();
    expect(out.categories).toEqual([]);
    expect(out.animals).toEqual({ inAdoption: 0, adopted: 0 });
  });

  it('reutiliza el consolidado un minuto y lo recalcula después', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ data: { totals: { incomeCop: 1 } } }]);
    const service = new NationalTransparencyService({ $queryRaw: queryRaw } as never);
    const t0 = Date.now();
    await service.get(t0);
    await service.get(t0 + 30_000);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    await service.get(t0 + 120_000);
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });
});
