// Module: accounting (contabilidad de donaciones por detrás) — contrato aditivo.
//
// AdoptaFácil PREPARA la contabilidad de donaciones del refugio: registra cada
// donación que confirma la pasarela (Mercado Pago por OAuth, ADR-PAG-003), la
// concilia mes a mes contra la cuenta del refugio, lleva un libro auxiliar que
// no se puede editar y entrega el exporte para el contador. NO firma, NO
// certifica y NO declara: eso le corresponde al contador público o al revisor
// fiscal del refugio (Ley 43 de 1990; 🧾 confirmar con un contador).
//
// Gratis: libro auxiliar, conciliación mensual y exporte básico.
// Planes de pago (`accountingClose`, `accountingFullExport`,
// `accountantPackage`): cierre de mes con ajustes fechados, exporte completo y
// el paquete "listo para firmar" que el contador / revisor revisa y firma.

import type { AdditionalSignerRole, OrgReportStatus } from './reports';

export const ACCOUNTING_ENTRY_TYPES = ['donation', 'refund', 'chargeback'] as const;
/** Tipo de renglón: la donación suma; el reembolso y el contracargo restan. */
export type AccountingEntryType = (typeof ACCOUNTING_ENTRY_TYPES)[number];

/** Pasarela que confirmó el hecho. */
export type AccountingSource = 'mercadopago' | 'epayco' | 'other';

/** Destinación de la donación (para rendir cuentas de donaciones con destino). */
export const ACCOUNTING_DESTINATIONS = ['general', 'animal', 'campaign'] as const;
export type AccountingDestination = (typeof ACCOUNTING_DESTINATIONS)[number];

export const ACCOUNTING_ENTRY_TYPE_LABEL: Record<AccountingEntryType, string> = {
  donation: 'Donación',
  refund: 'Reembolso',
  chargeback: 'Contracargo',
};

export const ACCOUNTING_DESTINATION_LABEL: Record<AccountingDestination, string> = {
  general: 'Libre (sin destinación)',
  animal: 'Para un animal',
  campaign: 'Para una campaña',
};

/** Mes contable `YYYY-MM` (hora de Colombia). */
export const ACCOUNTING_PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Colombia no tiene horario de verano: UTC−5 todo el año. */
const COLOMBIA_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Mes contable (hora de Colombia) de un instante UTC. */
export function accountingPeriodOf(date: Date): string {
  const local = new Date(date.getTime() - COLOMBIA_OFFSET_MS);
  const month = String(local.getUTCMonth() + 1).padStart(2, '0');
  return `${local.getUTCFullYear()}-${month}`;
}

/** Instantes UTC [desde, hasta) que cubre un mes contable de Colombia. */
export function accountingPeriodRange(period: string): { fromUtc: Date; toUtcExclusive: Date } {
  if (!ACCOUNTING_PERIOD_PATTERN.test(period)) {
    throw new Error(`Mes contable inválido: ${period}`);
  }
  const [year, month] = period.split('-').map(Number) as [number, number];
  const fromUtc = new Date(Date.UTC(year, month - 1, 1) + COLOMBIA_OFFSET_MS);
  const toUtcExclusive = new Date(Date.UTC(year, month, 1) + COLOMBIA_OFFSET_MS);
  return { fromUtc, toUtcExclusive };
}

/** Mes siguiente (`2026-12` → `2027-01`). */
export function nextAccountingPeriod(period: string): string {
  const [year, month] = period.split('-').map(Number) as [number, number];
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
}

/** "noviembre de 2026". */
export function accountingPeriodLabel(period: string): string {
  const names = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ];
  const [year, month] = period.split('-').map(Number) as [number, number];
  return `${names[month - 1] ?? period} de ${year}`;
}

/** Un renglón del libro auxiliar de donaciones (inmutable). */
export interface AccountingEntry {
  id: string;
  /** Folio consecutivo de la organización. */
  seq: number;
  entryType: AccountingEntryType;
  source: AccountingSource;
  donationId: string | null;
  /** Id del pago en la pasarela (Mercado Pago). */
  gatewayPaymentId: string | null;
  /** ISO-8601 UTC. */
  occurredAt: string;
  /** Mes en que ocurrió. */
  eventPeriod: string;
  /** Mes del libro en que quedó asentado (distinto si es ajuste). */
  period: string;
  /** true = ocurrió en un mes ya cerrado y quedó como ajuste en un mes abierto. */
  isAdjustment: boolean;
  /** Pesos con signo: + donación, − reembolso / contracargo. */
  grossCop: number;
  /** Comisión de la pasarela (null = la pasarela no la informó). */
  feeCop: number | null;
  /** Neto que llega a la cuenta del refugio (null = sin dato de la pasarela). */
  netCop: number | null;
  paymentType: string | null;
  paymentMethod: string | null;
  destination: AccountingDestination;
  destinationLabel: string | null;
  createdAt: string;
}

export interface AccountingTotals {
  /** Renglones de donación (no cuenta reembolsos ni contracargos). */
  donationCount: number;
  /** Suma de donaciones brutas (positivo). */
  donationsGrossCop: number;
  /** Suma de reembolsos (negativo o 0). */
  refundsCop: number;
  /** Suma de contracargos (negativo o 0). */
  chargebacksCop: number;
  /** Bruto neto de reversos: donaciones + reembolsos + contracargos. */
  balanceCop: number;
  /** Comisiones de la pasarela informadas (positivo: lo que el refugio paga). */
  feesCop: number;
  /** Neto recibido informado por la pasarela. */
  netCop: number;
  /** Renglones de donación sin comisión informada (otra pasarela o sin dato). */
  entriesWithoutFee: number;
  /** Ajustes de meses ya cerrados asentados en este mes. */
  adjustmentCount: number;
  byDestination: Record<AccountingDestination, number>;
  /** Por forma de pago (`credit_card`, `debit_card`, `bank_transfer` (PSE), `ticket`…). */
  byPaymentType: Record<string, number>;
}

export type AccountingPeriodStatus = 'open' | 'closed';

/** Un mes en el resumen. */
export interface AccountingPeriodSummary {
  period: string;
  status: AccountingPeriodStatus;
  entryCount: number;
  balanceCop: number;
  closedAt?: string;
}

export interface AccountingSignerInfo {
  role: AdditionalSignerRole;
  displayName: string;
  /** Si ya registró su firma (la primera vez lo hace desde el enlace del correo). */
  signatureRegistered: boolean;
}

/** `GET /org/accounting` — tablero de contabilidad. */
export interface AccountingOverview {
  /** Mes en curso (hora de Colombia). */
  currentPeriod: string;
  /** Últimos meses con movimiento o cierre, del más reciente al más antiguo. */
  periods: AccountingPeriodSummary[];
  /** ¿Tiene la organización Mercado Pago conectado (OAuth)? */
  mercadopagoConnected: boolean;
  /** Lo que su plan incluye (para mostrar u ofrecer la mejora). */
  features: {
    close: boolean;
    fullExport: boolean;
    accountantPackage: boolean;
  };
  /** Contador / revisor fiscal vinculados vigentes. */
  signers: AccountingSignerInfo[];
}

/** `GET /org/accounting/periods/:period` — el libro auxiliar de un mes. */
export interface AccountingPeriodView {
  period: string;
  status: AccountingPeriodStatus;
  close?: AccountingPeriodClose;
  totals: AccountingTotals;
  entries: AccountingEntry[];
  /** Informe contable firmable del mes, si ya se generó (plan de pago). */
  report?: { id: string; code: string; status: OrgReportStatus } | null;
  /** Enlaces compartidos con el contador / revisor (plan de pago). */
  shares?: AccountingShareInfo[];
}

export const RECONCILIATION_STATUSES = [
  'matched',
  'missing_in_gateway',
  'missing_in_platform',
  'status_mismatch',
  'amount_mismatch',
] as const;
/**
 * - `matched`: cuadra (AdoptaFácil y Mercado Pago dicen lo mismo).
 * - `missing_in_gateway`: AdoptaFácil tiene la donación aprobada y Mercado Pago no la reporta.
 * - `missing_in_platform`: Mercado Pago tiene un pago aprobado que AdoptaFácil no registró aprobado.
 * - `status_mismatch`: otro estado en cada lado (p. ej. reembolsado en Mercado Pago).
 * - `amount_mismatch`: el monto no coincide.
 */
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

export const RECONCILIATION_STATUS_LABEL: Record<ReconciliationStatus, string> = {
  matched: 'Cuadra',
  missing_in_gateway: 'Falta en Mercado Pago',
  missing_in_platform: 'Falta en AdoptaFácil',
  status_mismatch: 'Estado distinto',
  amount_mismatch: 'Monto distinto',
};

export interface ReconciliationLine {
  status: ReconciliationStatus;
  /** Referencia del cobro (external_reference). */
  reference: string;
  donationId: string | null;
  gatewayPaymentId: string | null;
  platformStatus: string | null;
  gatewayStatus: string | null;
  platformAmountCop: number | null;
  gatewayAmountCop: number | null;
  /** ISO-8601 UTC. */
  occurredAt: string;
  /** Qué hacer, en palabras simples. */
  hint: string;
}

/** `GET /org/accounting/periods/:period/reconciliation`. */
export interface AccountingReconciliation {
  period: string;
  mercadopagoConnected: boolean;
  counts: Record<ReconciliationStatus, number>;
  /** Donaciones aprobadas en AdoptaFácil con Mercado Pago (bruto). */
  platformTotalCop: number;
  /** Pagos aprobados que reporta Mercado Pago (bruto). */
  gatewayTotalCop: number;
  gatewayFeesCop: number;
  gatewayNetCop: number;
  /** platformTotalCop − gatewayTotalCop. */
  differenceCop: number;
  /** true = sin descuadres. */
  balanced: boolean;
  /** Primero los descuadres; como máximo 500 líneas. */
  lines: ReconciliationLine[];
  /** Pagos de Mercado Pago de este mes guardados (última relectura). */
  lastGatewayReadAt: string | null;
}

/** `POST /org/accounting/periods/:period/sync` — releer Mercado Pago. */
export interface AccountingSyncResult {
  /** Pagos leídos de Mercado Pago con referencia de AdoptaFácil. */
  fetched: number;
  /** Donaciones pendientes que Mercado Pago confirmó y quedaron aprobadas. */
  settled: number;
  /** Renglones nuevos en el libro auxiliar. */
  entriesCreated: number;
}

export interface CloseAccountingPeriodInput {
  /** Nota opcional (máx. 500), p. ej. explicación de un descuadre. */
  note?: string;
  /** Obligatorio si la conciliación tiene descuadres: "cierro sabiendo que…". */
  acknowledgeDiscrepancies?: boolean;
}

export interface AccountingPeriodClose {
  id: string;
  period: string;
  entryCount: number;
  lastSeq: number;
  totals: AccountingTotals;
  reconciliation: { balanced: boolean; counts: Record<ReconciliationStatus, number> };
  entriesHash: string;
  note: string | null;
  closedByUserId: string;
  closedAt: string;
}

export interface CloseAccountingPeriodResult {
  close: AccountingPeriodClose;
  /** Informe contable del mes enviado a firma del contador / revisor fiscal. */
  report: { id: string; code: string; status: OrgReportStatus } | null;
  /**
   * Presente si el mes quedó cerrado pero el libro firmable no se pudo generar
   * (p. ej. falta una firma exigida). Se reintenta con
   * `POST /org/accounting/periods/:period/report`.
   */
  reportError?: string;
}

/** `POST /org/accounting/periods/:period/shares`. */
export interface CreateAccountingShareInput {
  signerRole: AdditionalSignerRole;
}

export interface AccountingShareInfo {
  id: string;
  period: string;
  signerRole: AdditionalSignerRole;
  signerName: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

/** Días que dura un enlace compartido con el contador / revisor fiscal. */
export const ACCOUNTING_SHARE_DAYS = 30;

/** Lo que ve el contador / revisor al abrir el enlace (sin cuenta). */
export interface AccountingSharePreview {
  organizationName: string;
  nit: string | null;
  period: string;
  status: AccountingPeriodStatus;
  closedAt: string | null;
  signerRole: AdditionalSignerRole;
  signerName: string;
  expiresAt: string;
  totals: AccountingTotals;
  reconciliation: Pick<
    AccountingReconciliation,
    | 'counts'
    | 'balanced'
    | 'platformTotalCop'
    | 'gatewayTotalCop'
    | 'gatewayFeesCop'
    | 'gatewayNetCop'
  >;
  entries: AccountingEntry[];
  /** Informe contable del mes y su estado de firma, si existe. */
  report: { code: string; status: OrgReportStatus } | null;
}

/** Texto que acompaña todo lo contable (no prometer lo que no hacemos). */
export const ACCOUNTING_DISCLAIMER =
  'AdoptaFácil prepara y concilia la información de donaciones que confirma la pasarela de pagos. ' +
  'No lleva la contabilidad oficial, no firma, no certifica ni declara: eso le corresponde al ' +
  'contador público o al revisor fiscal de la organización.';
