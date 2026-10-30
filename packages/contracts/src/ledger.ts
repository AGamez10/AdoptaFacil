// Module: ledger (RF14 · libro público de transparencia).
//
// El libro junta dos fuentes:
//   - `manual`: lo que la organización registra a mano (efectivo, transferencias,
//     donaciones en especie, eventos) y TODOS sus gastos.
//   - `online_donation`: cada donación aprobada por la pasarela de pagos entra
//     sola, sin que nadie la digite (la base la lee de la donación y su recibo).
//
// Un movimiento manual es INMUTABLE
// una vez registrado: no se edita ni se borra. Si hubo un error se ANULA con un
// motivo, y la anulación queda visible en el portal (el movimiento sale de los
// totales pero no desaparece). Así nadie puede maquillar el libro después.
//
// Habeas Data (Ley 1581 de 2012): el libro es PÚBLICO, así que nunca guarda
// nombres de personas naturales. Las donaciones salen siempre sin donante; en
// un gasto solo se publica el proveedor (una empresa o comercio). El soporte
// (factura, recibo) es PRIVADO de la organización: el público solo ve que
// existe.

export enum LedgerSource {
  Manual = 'manual',
  OnlineDonation = 'online_donation',
}

export enum LedgerEntryKind {
  Income = 'income',
  Expense = 'expense',
}

/** Categorías cerradas: lo que el visitante puede entender de un vistazo. */
export const LEDGER_INCOME_CATEGORIES = [
  'donacion_dinero',
  'donacion_especie',
  'evento',
  'venta',
  'apadrinamiento',
  'otro_ingreso',
] as const;

export const LEDGER_EXPENSE_CATEGORIES = [
  'veterinaria',
  'alimento',
  'medicamentos',
  'esterilizacion',
  'arriendo_servicios',
  'transporte',
  'personal',
  'insumos',
  'otro_gasto',
] as const;

export type LedgerIncomeCategory = (typeof LEDGER_INCOME_CATEGORIES)[number];
export type LedgerExpenseCategory = (typeof LEDGER_EXPENSE_CATEGORIES)[number];
export type LedgerCategory = LedgerIncomeCategory | LedgerExpenseCategory;

export const LEDGER_CATEGORY_LABELS: Record<LedgerCategory, string> = {
  donacion_dinero: 'Donación en dinero',
  donacion_especie: 'Donación en especie',
  evento: 'Evento o rifa',
  venta: 'Venta',
  apadrinamiento: 'Apadrinamiento',
  otro_ingreso: 'Otro ingreso',
  veterinaria: 'Veterinaria',
  alimento: 'Alimento',
  medicamentos: 'Medicamentos',
  esterilizacion: 'Esterilización',
  arriendo_servicios: 'Arriendo y servicios',
  transporte: 'Transporte',
  personal: 'Personal',
  insumos: 'Insumos',
  otro_gasto: 'Otro gasto',
};

/** Tope de un movimiento (COP, pesos enteros): evita errores de digitación absurdos. */
export const LEDGER_MAX_AMOUNT_COP = 10_000_000_000;
export const LEDGER_CONCEPT_MAX = 140;
export const LEDGER_COUNTERPARTY_MAX = 120;
export const LEDGER_VOID_REASON_MIN = 10;
export const LEDGER_VOID_REASON_MAX = 300;

export interface CreateLedgerEntryInput {
  kind: LedgerEntryKind;
  category: LedgerCategory;
  /** Fecha del movimiento (YYYY-MM-DD, hora Colombia). No puede ser futura. */
  occurredOn: string;
  /** Pesos colombianos enteros (> 0). En especie: valor estimado. */
  amountCop: number;
  concept: string;
  /** Solo para gastos: proveedor (empresa o comercio), nunca una persona natural. */
  counterparty?: string;
  /** Idempotencia: UUID por intento; un reintento devuelve el mismo movimiento. */
  clientRequestId?: string;
}

export interface VoidLedgerEntryInput {
  reason: string;
}

/** Vista interna (equipo de la organización). */
export interface LedgerEntry {
  id: string;
  organizationId: string;
  source: LedgerSource;
  kind: LedgerEntryKind;
  category: LedgerCategory;
  occurredOn: string;
  amountCop: number;
  concept: string;
  counterparty?: string;
  hasSupport: boolean;
  supportFilename?: string;
  createdAt: string;
  voidedAt?: string;
  voidReason?: string;
}

/** Vista pública: sin ids internos de usuarios ni nombre del archivo de soporte. */
export interface PublicLedgerEntry {
  id: string;
  source: LedgerSource;
  kind: LedgerEntryKind;
  category: LedgerCategory;
  occurredOn: string;
  amountCop: number;
  concept: string;
  counterparty?: string;
  hasSupport: boolean;
  createdAt: string;
  voided: boolean;
  voidReason?: string;
}

export interface LedgerTotals {
  /** Solo movimientos vigentes (los anulados no suman). */
  incomeCop: number;
  expenseCop: number;
  balanceCop: number;
  entryCount: number;
  /** Fecha del último movimiento vigente, o null si no hay. */
  lastEntryOn: string | null;
}

export interface PublicLedgerPage {
  items: PublicLedgerEntry[];
  total: number;
  limit: number;
  offset: number;
  totals: LedgerTotals;
}

export interface OrgLedgerPage {
  items: LedgerEntry[];
  totals: LedgerTotals;
}
