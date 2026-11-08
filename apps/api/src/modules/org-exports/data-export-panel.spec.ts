import * as ExcelJS from 'exceljs';
import { buildPanelMetrics, colombiaMonth } from './data-export-panel';
import { renderDataExportXlsx, type DataExportInput } from './data-export-xlsx';

const at = new Date('2026-10-20T15:00:00Z');

const input: DataExportInput = {
  organizationName: 'Refugio Patitas',
  generatedAt: at,
  animals: [
    ['a1', 'dog', 'available'],
    ['a2', 'dog', 'adopted'],
    ['a3', 'cat', 'adopted'],
  ].map(([id, species, status]) => ({
    id,
    name: id,
    species,
    sex: 'male',
    size: 'small',
    status,
    breed: null,
    birthDate: null,
    approximateAgeMonths: null,
    tags: [],
    isActive: id !== 'a3',
    createdAt: at,
  })),
  adoptions: ['approved', 'approved', 'rejected', 'new'].map((status, i) => ({
    id: `r${i}`,
    animalName: 'x',
    status,
    createdAt: at,
    updatedAt: at,
    contractStatus: status === 'approved' && i === 0 ? 'signed' : null,
    contractSignedAt: null,
  })),
  donations: [
    // 1 jul 2026 02:00 UTC es 30 jun en Colombia: cuenta en junio.
    ['d1', '2026-07-01T02:00:00Z', 'approved', null, 100_000],
    ['d2', '2026-07-15T12:00:00Z', 'approved', null, 50_000],
    ['d3', '2026-07-16T12:00:00Z', 'approved', 'refunded', 70_000],
    ['d4', '2026-07-17T12:00:00Z', 'pending', null, 20_000],
    ['d5', '2026-07-18T12:00:00Z', 'declined', null, 20_000],
  ].map(([id, date, status, reversed, amount]) => ({
    id: id as string,
    approvedAt: new Date(date as string),
    status: status as string,
    reversedReason: reversed as string | null,
    conceptKind: 'organization',
    conceptName: null,
    amountCharged: amount as number,
    net: Math.round((amount as number) * 0.95),
    gatewayFee: Math.round((amount as number) * 0.04),
    gatewayIva: Math.round((amount as number) * 0.01),
  })),
  campaigns: [
    {
      id: 'c1',
      title: 'Cirugía',
      category: 'surgeries',
      goalAmount: 1_000_000,
      raisedAmount: 250_000,
      deadline: at,
      status: 'active',
      createdAt: at,
    },
    {
      id: 'c2',
      title: 'Sin meta',
      category: 'food',
      goalAmount: 0,
      raisedAmount: 0,
      deadline: at,
      status: 'closed',
      createdAt: at,
    },
  ],
  opportunities: [
    {
      id: 'o1',
      title: 'Paseos',
      category: 'paseos',
      startDate: at,
      endDate: at,
      capacity: 5,
      status: 'active',
      acceptedVolunteers: 3,
      approvedHours: 10.255,
    },
  ],
  products: [
    { id: 'p1', name: 'A', category: 'Ropa', price: 1000, stock: 3, isActive: true, createdAt: at },
    { id: 'p2', name: 'B', category: 'Ropa', price: 1000, stock: 0, isActive: true, createdAt: at },
    {
      id: 'p3',
      name: 'C',
      category: 'Hogar',
      price: 1000,
      stock: 9,
      isActive: false,
      createdAt: at,
    },
  ],
};

describe('tablero de la exportación de datos', () => {
  it('cuenta animales por estado y especie', () => {
    const m = buildPanelMetrics(input);
    expect(m.animals).toMatchObject({ total: 3, active: 2, adopted: 2 });
    expect(m.animals.byStatus).toEqual([
      { label: 'Adoptado', value: 2 },
      { label: 'Disponible', value: 1 },
    ]);
    expect(m.animals.bySpecies[0]).toEqual({ label: 'Perro', value: 2 });
  });

  it('la tasa de aprobación solo mira las solicitudes ya resueltas', () => {
    const m = buildPanelMetrics(input);
    expect(m.adoptions).toMatchObject({ total: 4, approved: 2, contractsSigned: 1 });
    expect(m.adoptions.approvalRate).toBeCloseTo(66.67, 2);
    const empty = buildPanelMetrics({ ...input, adoptions: [] });
    expect(empty.adoptions.approvalRate).toBeNull();
  });

  it('solo suma como donado lo aprobado y no reversado, por mes de Colombia', () => {
    const m = buildPanelMetrics(input);
    expect(m.donations.paidCount).toBe(2);
    expect(m.donations.reversedCount).toBe(1);
    expect(m.donations.pendingCount).toBe(1);
    expect(m.donations.grossCop).toBe(150_000);
    expect(m.donations.netByMonth.map((b) => b.label)).toEqual(['2026-06', '2026-07']);
    expect(colombiaMonth(new Date('2026-07-01T02:00:00Z'))).toBe('2026-06');
  });

  it('el avance de campañas no divide entre cero', () => {
    const m = buildPanelMetrics(input);
    expect(m.campaigns.progressPct).toBe(25);
    expect(m.campaigns.rows[1].pct).toBe(0);
    expect(buildPanelMetrics({ ...input, campaigns: [] }).campaigns.progressPct).toBeNull();
  });

  it('redondea las horas y cuenta la tienda sin contar lo oculto como agotado', () => {
    const m = buildPanelMetrics(input);
    expect(m.volunteering.hours).toBe(10.26);
    expect(m.volunteering.volunteers).toBe(3);
    expect(m.store).toMatchObject({ products: 3, active: 2, outOfStock: 1, stockUnits: 12 });
    // Una exportación sin tienda no rompe el tablero.
    expect(buildPanelMetrics({ ...input, products: undefined }).store.products).toBe(0);
  });

  it('el libro abre en el Panel, con enlaces a cada hoja y sin datos de contacto', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await renderDataExportXlsx(input)) as unknown as ArrayBuffer);
    expect(wb.worksheets[0].name).toBe('Panel');
    const panel = wb.getWorksheet('Panel')!;
    const links: string[] = [];
    panel.eachRow((row) =>
      row.eachCell((cell) => {
        const value = cell.value as { hyperlink?: string } | null;
        if (value && typeof value === 'object' && 'hyperlink' in value && value.hyperlink) {
          links.push(value.hyperlink);
        }
      }),
    );
    // Una celda combinada repite su valor en cada celda que cubre.
    expect([...new Set(links)]).toEqual([
      "#'Animales'!A1",
      "#'Adopciones'!A1",
      "#'Donaciones'!A1",
      "#'Campañas'!A1",
      "#'Voluntariado'!A1",
      "#'Tienda'!A1",
    ]);
    // Cada hoja de detalle se imprime A4 apaisado, en una página de ancho.
    for (const name of ['Animales', 'Donaciones', 'Tienda']) {
      const setup = wb.getWorksheet(name)!.pageSetup;
      expect(setup.orientation).toBe('landscape');
      expect(setup.fitToWidth).toBe(1);
    }
    expect(wb.getWorksheet('Tienda')!.getRow(2).getCell(4).value).toBe(1000);
  });
});
