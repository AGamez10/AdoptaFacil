import {
  LEDGER_CATEGORY_LABELS,
  LEDGER_EXPENSE_CATEGORIES,
  LEDGER_INCOME_CATEGORIES,
  type LedgerCategory,
  LedgerEntryKind,
  LedgerSource,
} from '@adoptafacil/contracts';

/** Presentación del libro público (hora Colombia solo aquí, en la UI). */

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export function formatCop(value: number): string {
  return COP.format(value);
}

/** `2026-10-29` → `29 oct 2026`. La fecha ya es local (Colombia): no se convierte. */
export function formatLedgerDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function categoryLabel(category: string): string {
  return LEDGER_CATEGORY_LABELS[category as LedgerCategory] ?? 'Otro';
}

export function kindLabel(kind: LedgerEntryKind): string {
  return kind === LedgerEntryKind.Income ? 'Ingreso' : 'Gasto';
}

export function sourceLabel(source: LedgerSource): string {
  return source === LedgerSource.OnlineDonation
    ? 'Donación en línea'
    : 'Registro de la organización';
}

export function categoriesFor(
  kind: LedgerEntryKind,
): ReadonlyArray<{ value: string; label: string }> {
  const list =
    kind === LedgerEntryKind.Income ? LEDGER_INCOME_CATEGORIES : LEDGER_EXPENSE_CATEGORIES;
  return list.map((value) => ({ value, label: LEDGER_CATEGORY_LABELS[value] }));
}

/** Hoy en Colombia (YYYY-MM-DD), para el valor por defecto y el máximo del formulario. */
export function todayInColombia(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Monto escrito por una persona ("185.000", "$ 185000") → pesos enteros, o null. */
export function parseCopInput(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return null;
  const value = Number(digits);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
