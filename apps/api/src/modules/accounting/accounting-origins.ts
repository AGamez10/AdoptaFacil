import type {
  AccountingEntry,
  AccountingOriginRow,
  AccountingOrigins,
} from '@adoptafacil/contracts';

/** Movimiento que la propia organización registró a mano en su libro (ventas, eventos, gastos…). */
export interface ManualMovement {
  /** YYYY-MM-DD, hora Colombia. */
  date: string;
  kind: 'income' | 'expense';
  /** Clave cerrada de la categoría (p. ej. `venta`). */
  category: string;
  concept: string;
  counterparty: string | null;
  amountCop: number;
  hasSupport: boolean;
}

/** Cobro mensual de apadrinamiento pagado dentro del mes. */
export interface SponsorshipIncome {
  /** ISO-8601 UTC. */
  paidAt: string;
  sponsor: string;
  plan: string;
  amountCop: number;
}

const CATEGORY_NAME: Record<string, string> = {
  donacion_dinero: 'Donaciones en dinero registradas a mano',
  donacion_especie: 'Donaciones en especie (valor estimado)',
  evento: 'Eventos y rifas',
  venta: 'Ventas (marketplace y otras)',
  apadrinamiento: 'Apadrinamientos registrados a mano',
  otro_ingreso: 'Otros ingresos',
  veterinaria: 'Veterinaria',
  alimento: 'Alimento',
  medicamentos: 'Medicamentos',
  esterilizacion: 'Esterilización',
  arriendo_servicios: 'Arriendo y servicios',
  transporte: 'Transporte',
  personal: 'Personal',
  insumos: 'Insumos',
  otro_gasto: 'Otros gastos',
};

export const categoryName = (key: string): string =>
  CATEGORY_NAME[key] ?? key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');

const INCOME_ORDER = [
  'venta',
  'evento',
  'donacion_especie',
  'donacion_dinero',
  'apadrinamiento',
  'otro_ingreso',
];

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/**
 * Cruza y clasifica TODO lo que entró en el mes, venga de donde venga:
 * donaciones libres, a campañas y a animales (cobradas en línea), cobros de
 * apadrinamiento pagados y lo que la organización registró a mano. Las
 * donaciones ya van netas de reembolsos y contracargos (sus renglones restan).
 */
export function buildOrigins(
  entries: AccountingEntry[],
  manual: ManualMovement[],
  sponsorships: SponsorshipIncome[],
): AccountingOrigins {
  const income: AccountingOriginRow[] = [];

  const byDestination = (destination: AccountingEntry['destination'], origin: string): void => {
    const groups = new Map<string, AccountingEntry[]>();
    for (const e of entries.filter((x) => x.destination === destination)) {
      const key = e.destinationLabel?.trim() || 'Sin detalle';
      groups.set(key, [...(groups.get(key) ?? []), e]);
    }
    if (groups.size === 0) {
      income.push({
        origin,
        detail: 'Sin movimientos en el mes',
        count: 0,
        amountCop: 0,
        channel: 'online',
      });
    }
    for (const [detail, list] of [...groups].sort((a, b) => a[0].localeCompare(b[0], 'es'))) {
      income.push({
        origin,
        detail,
        count: list.filter((x) => x.entryType === 'donation').length,
        amountCop: sum(list.map((x) => x.grossCop)),
        channel: 'online',
      });
    }
  };
  byDestination('general', 'Donaciones libres (sin destino)');
  byDestination('campaign', 'Donaciones a campañas');
  byDestination('animal', 'Donaciones a un animal');

  income.push({
    origin: 'Apadrinamientos',
    detail:
      sponsorships.length === 0
        ? 'Sin cobros pagados en el mes'
        : sponsorships.length === 1
          ? '1 cobro mensual pagado'
          : `${sponsorships.length} cobros mensuales pagados`,
    count: sponsorships.length,
    amountCop: sum(sponsorships.map((x) => x.amountCop)),
    channel: 'sponsorship',
  });

  for (const key of INCOME_ORDER) {
    const list = manual.filter((m) => m.kind === 'income' && m.category === key);
    income.push({
      origin: categoryName(key),
      detail: list.length > 0 ? 'Registrado por la organización' : 'Sin movimientos en el mes',
      count: list.length,
      amountCop: sum(list.map((m) => m.amountCop)),
      channel: 'manual',
    });
  }

  const expenseGroups = new Map<string, ManualMovement[]>();
  for (const m of manual.filter((x) => x.kind === 'expense')) {
    expenseGroups.set(m.category, [...(expenseGroups.get(m.category) ?? []), m]);
  }
  const expenses: AccountingOriginRow[] = [...expenseGroups]
    .sort((a, b) => categoryName(a[0]).localeCompare(categoryName(b[0]), 'es'))
    .map(([key, list]) => ({
      origin: categoryName(key),
      detail: 'Gasto registrado por la organización',
      count: list.length,
      amountCop: sum(list.map((m) => m.amountCop)),
      channel: 'manual' as const,
    }));

  return {
    income,
    expenses,
    incomeTotalCop: sum(income.map((r) => r.amountCop)),
    expenseTotalCop: sum(expenses.map((r) => r.amountCop)),
  };
}
