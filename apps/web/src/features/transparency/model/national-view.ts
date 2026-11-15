import {
  LEDGER_CATEGORY_LABELS,
  LedgerEntryKind,
  type LedgerCategory,
  type NationalDonationDestination,
  type NationalTransparency,
} from '@adoptafacil/contracts';

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});
const COMPACT = new Intl.NumberFormat('es-CO', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const INT = new Intl.NumberFormat('es-CO');

export const formatCop = (v: number): string => COP.format(v);
/** Para ejes y etiquetas cortas: `$ 1,5 M`. */
export const formatCopShort = (v: number): string => `$ ${COMPACT.format(v)}`;
export const formatInt = (v: number): string => INT.format(v);

const MONTH_SHORT = new Intl.DateTimeFormat('es-CO', { month: 'short', timeZone: 'UTC' });
const MONTH_LONG = new Intl.DateTimeFormat('es-CO', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const toDate = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y || 1970, (m || 1) - 1, 1));
};
/** `2026-11` → `nov` */
export const monthShort = (ym: string): string =>
  MONTH_SHORT.format(toDate(ym)).replace('.', '').slice(0, 3);
/** `2026-11` → `Noviembre de 2026` */
export function monthLong(ym: string): string {
  const s = MONTH_LONG.format(toDate(ym));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const DESTINATION_LABELS: Record<NationalDonationDestination, string> = {
  organization: 'Libre (sin destinación)',
  campaign: 'Para una campaña',
  animal: 'Para un animal',
};

export function categoryLabel(category: string): string {
  return LEDGER_CATEGORY_LABELS[category as LedgerCategory] ?? 'Otro';
}

export interface Share {
  key: string;
  label: string;
  amountCop: number;
  /** 0–100, respecto al total de su grupo. */
  pct: number;
}

/** Ingresos o gastos por categoría, de mayor a menor, con su porcentaje. */
export function sharesByCategory(data: NationalTransparency, kind: LedgerEntryKind): Share[] {
  const rows = data.categories.filter((c) => c.kind === kind && c.amountCop > 0);
  const total = rows.reduce((s, c) => s + c.amountCop, 0);
  return rows
    .sort((a, b) => b.amountCop - a.amountCop)
    .map((c) => ({
      key: c.category,
      label: categoryLabel(c.category),
      amountCop: c.amountCop,
      pct: total > 0 ? (c.amountCop / total) * 100 : 0,
    }));
}

export function destinationShares(data: NationalTransparency): Share[] {
  const rows = data.donationDestinations.filter((d) => d.amountCop > 0);
  const total = rows.reduce((s, d) => s + d.amountCop, 0);
  return rows.map((d) => ({
    key: d.destination,
    label: DESTINATION_LABELS[d.destination] ?? 'Otro destino',
    amountCop: d.amountCop,
    pct: total > 0 ? (d.amountCop / total) * 100 : 0,
  }));
}

/** Porcentaje de lo recibido que ya se usó (null si no se ha recibido nada). */
export function usedPct(incomeCop: number, expenseCop: number): number | null {
  return incomeCop > 0 ? Math.round((expenseCop / incomeCop) * 100) : null;
}

/** Tope "redondo" del eje para que las rayas guía caigan en cifras legibles. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(value));
  const f = value / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

export function isEmpty(data: NationalTransparency): boolean {
  return data.totals.movementCount === 0;
}

export { LedgerEntryKind };
