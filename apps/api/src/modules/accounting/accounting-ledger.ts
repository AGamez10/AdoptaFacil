import { createHash } from 'node:crypto';
import {
  ACCOUNTING_DESTINATIONS,
  RECONCILIATION_STATUSES,
  accountingPeriodOf,
  type AccountingDestination,
  type AccountingEntry,
  type AccountingEntryType,
  type AccountingSource,
  type AccountingTotals,
  type ReconciliationLine,
  type ReconciliationStatus,
} from '@adoptafacil/contracts';

/**
 * Reglas puras del libro auxiliar de donaciones (sin base de datos), para
 * poder probarlas con unidades:
 *  - qué renglones nacen de una donación aprobada y de lo que Mercado Pago
 *    reporta de su pago (reembolsos, contracargo);
 *  - a qué mes del libro va cada renglón (ajuste si su mes ya está cerrado);
 *  - totales de un mes;
 *  - la conciliación AdoptaFácil ↔ Mercado Pago;
 *  - la huella SHA-256 con la que se sella un cierre.
 */

/** Prefijo de las referencias que AdoptaFácil envía a Mercado Pago. */
export const AF_REFERENCE_PREFIX = 'af-';

export interface DonationSource {
  id: string;
  collectionId: string;
  amountCharged: number;
  conceptKind: string;
  conceptId: string;
  /** Fecha de aprobación en AdoptaFácil (emisión del recibo) o de actualización. */
  approvedAt: Date;
  destinationLabel: string | null;
}

export interface GatewayPaymentSource {
  mpPaymentId: string;
  externalReference: string;
  donationId: string | null;
  status: string;
  transactionAmount: number;
  netReceivedAmount: number | null;
  transactionAmountRefunded: number | null;
  feeDetails: unknown;
  refunds: unknown;
  paymentTypeId: string | null;
  paymentMethodId: string | null;
  dateApproved: Date | null;
  firstSeenAt: Date;
  updatedAt: Date;
}

/** Un renglón por crear (sin folio ni mes del libro todavía). */
export interface EntryDraft {
  dedupKey: string;
  entryType: AccountingEntryType;
  source: AccountingSource;
  donationId: string;
  gatewayPaymentId: string | null;
  occurredAt: Date;
  grossCop: number;
  feeCop: number | null;
  netCop: number | null;
  paymentType: string | null;
  paymentMethod: string | null;
  destination: AccountingDestination;
  destinationId: string | null;
  destinationLabel: string | null;
}

const toCop = (n: number): number => Math.round(n);

function toNumber(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function toDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Comisión que asume el refugio: las `fee_details` con `fee_payer = collector`. */
export function collectorFee(feeDetails: unknown): number | null {
  if (!Array.isArray(feeDetails) || feeDetails.length === 0) return null;
  let total = 0;
  let any = false;
  for (const f of feeDetails as Array<Record<string, unknown>>) {
    const payer = typeof f?.fee_payer === 'string' ? f.fee_payer : 'collector';
    const amount = toNumber(f?.amount);
    if (amount === null || payer !== 'collector') continue;
    total += amount;
    any = true;
  }
  return any ? toCop(total) : 0;
}

interface RefundItem {
  id: string;
  amount: number;
  at: Date | null;
}

/** Reembolsos efectivos (aprobados o sin estado) con id y monto > 0. */
export function effectiveRefunds(refunds: unknown): RefundItem[] {
  if (!Array.isArray(refunds)) return [];
  const out: RefundItem[] = [];
  for (const r of refunds as Array<Record<string, unknown>>) {
    const id = r?.id === null || r?.id === undefined ? '' : String(r.id);
    const amount = toNumber(r?.amount);
    const status = typeof r?.status === 'string' ? r.status : null;
    if (!id || amount === null || amount <= 0) continue;
    if (status !== null && status !== 'approved') continue;
    out.push({ id, amount: toCop(amount), at: toDate(r?.date_created) });
  }
  return out;
}

function destinationOf(conceptKind: string): AccountingDestination {
  return conceptKind === 'animal' || conceptKind === 'campaign' ? conceptKind : 'general';
}

/** El pago de Mercado Pago que respalda la donación (el aprobado, si hay varios intentos). */
export function paymentForDonation(
  donation: DonationSource,
  payments: readonly GatewayPaymentSource[],
): GatewayPaymentSource | undefined {
  const own = payments.filter(
    (p) => p.donationId === donation.id || p.externalReference === donation.collectionId,
  );
  const rank = (status: string) =>
    status === 'approved' || status === 'refunded' || status === 'charged_back' ? 0 : 1;
  return own.sort((a, b) => rank(a.status) - rank(b.status))[0];
}

/**
 * Renglones que deben existir para una donación APROBADA en AdoptaFácil:
 * la donación (+) y, si Mercado Pago lo reporta, cada reembolso (−) y el
 * contracargo (−). Idempotente por `dedupKey`.
 */
export function draftsForDonation(
  donation: DonationSource,
  payment: GatewayPaymentSource | undefined,
): EntryDraft[] {
  const destination = destinationOf(donation.conceptKind);
  const base = {
    donationId: donation.id,
    destination,
    destinationId: destination === 'general' ? null : donation.conceptId,
    destinationLabel: donation.destinationLabel,
  };
  const isMp = Boolean(payment) || donation.collectionId.startsWith(AF_REFERENCE_PREFIX);
  const source: AccountingSource = isMp ? 'mercadopago' : 'other';
  const gross = payment ? toCop(payment.transactionAmount) : donation.amountCharged;
  const drafts: EntryDraft[] = [];
  if (gross <= 0) return drafts;
  drafts.push({
    ...base,
    dedupKey: `donation:${donation.id}`,
    entryType: 'donation',
    source,
    gatewayPaymentId: payment?.mpPaymentId ?? null,
    occurredAt: payment?.dateApproved ?? donation.approvedAt,
    grossCop: gross,
    feeCop: payment ? collectorFee(payment.feeDetails) : null,
    netCop: payment && payment.netReceivedAmount !== null ? toCop(payment.netReceivedAmount) : null,
    paymentType: payment?.paymentTypeId ?? null,
    paymentMethod: payment?.paymentMethodId ?? null,
  });
  if (!payment) return drafts;

  let refunded = 0;
  for (const r of effectiveRefunds(payment.refunds)) {
    const amount = Math.min(r.amount, gross - refunded);
    if (amount <= 0) break;
    refunded += amount;
    drafts.push({
      ...base,
      dedupKey: `refund:${payment.mpPaymentId}:${r.id}`,
      entryType: 'refund',
      source,
      gatewayPaymentId: payment.mpPaymentId,
      occurredAt: r.at ?? payment.updatedAt,
      grossCop: -amount,
      // TODO(client) 🧾: si Mercado Pago devuelve al refugio parte de la
      // comisión en un reembolso, el contador lo ajusta; la API no lo detalla.
      feeCop: null,
      netCop: -amount,
      paymentType: payment.paymentTypeId,
      paymentMethod: payment.paymentMethodId,
    });
  }
  if (payment.status === 'charged_back' && gross - refunded > 0) {
    drafts.push({
      ...base,
      dedupKey: `chargeback:${payment.mpPaymentId}`,
      entryType: 'chargeback',
      source,
      gatewayPaymentId: payment.mpPaymentId,
      occurredAt: payment.updatedAt,
      grossCop: -(gross - refunded),
      feeCop: null,
      netCop: -(gross - refunded),
      paymentType: payment.paymentTypeId,
      paymentMethod: payment.paymentMethodId,
    });
  }
  return drafts;
}

/** Mes del libro: el del hecho, o el mes en curso si el del hecho ya se cerró. */
export function postingPeriod(
  occurredAt: Date,
  closed: ReadonlySet<string>,
  now: Date,
): { eventPeriod: string; period: string } {
  const eventPeriod = accountingPeriodOf(occurredAt);
  if (!closed.has(eventPeriod)) return { eventPeriod, period: eventPeriod };
  const current = accountingPeriodOf(now);
  return { eventPeriod, period: current > eventPeriod ? current : eventPeriod };
}

function emptyByDestination(): Record<AccountingDestination, number> {
  return Object.fromEntries(ACCOUNTING_DESTINATIONS.map((d) => [d, 0])) as Record<
    AccountingDestination,
    number
  >;
}

/** Totales de los renglones de un mes. */
export function totalsOf(entries: readonly AccountingEntry[]): AccountingTotals {
  const totals: AccountingTotals = {
    donationCount: 0,
    donationsGrossCop: 0,
    refundsCop: 0,
    chargebacksCop: 0,
    balanceCop: 0,
    feesCop: 0,
    netCop: 0,
    entriesWithoutFee: 0,
    adjustmentCount: 0,
    byDestination: emptyByDestination(),
    byPaymentType: {},
  };
  for (const e of entries) {
    if (e.entryType === 'donation') {
      totals.donationCount++;
      totals.donationsGrossCop += e.grossCop;
      if (e.feeCop === null) totals.entriesWithoutFee++;
    } else if (e.entryType === 'refund') {
      totals.refundsCop += e.grossCop;
    } else {
      totals.chargebacksCop += e.grossCop;
    }
    totals.balanceCop += e.grossCop;
    totals.feesCop += e.feeCop ?? 0;
    totals.netCop += e.netCop ?? 0;
    if (e.isAdjustment) totals.adjustmentCount++;
    totals.byDestination[e.destination] += e.grossCop;
    const type = e.paymentType ?? 'sin_dato';
    totals.byPaymentType[type] = (totals.byPaymentType[type] ?? 0) + e.grossCop;
  }
  return totals;
}

/** Huella SHA-256 de los renglones de un mes (orden por folio, campos fijos). */
export function entriesHash(entries: readonly AccountingEntry[]): string {
  const canonical = [...entries]
    .sort((a, b) => a.seq - b.seq)
    .map((e) => [
      e.seq,
      e.entryType,
      e.source,
      e.donationId,
      e.gatewayPaymentId,
      e.occurredAt,
      e.eventPeriod,
      e.period,
      e.grossCop,
      e.feeCop,
      e.netCop,
      e.destination,
    ]);
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

// ---------------------------------------------------------------------------
// Conciliación AdoptaFácil ↔ Mercado Pago
// ---------------------------------------------------------------------------

export interface ReconcileDonation {
  id: string;
  collectionId: string;
  status: string;
  amountCharged: number;
  /** Aprobación (recibo) o, si no está aprobada, creación. */
  at: Date;
  /** Suma (negativa) de reembolsos y contracargos ya asentados en el libro. */
  reversedCop: number;
}

/** Estado comparable: aprobado, reembolsado (total o parcial) o contracargo. */
function gatewayComparable(p: GatewayPaymentSource): string {
  if (p.status === 'charged_back') return 'charged_back';
  const refunded = effectiveRefunds(p.refunds).reduce((s, r) => s + r.amount, 0);
  if (p.status === 'refunded') return 'refunded';
  if (p.status === 'approved') {
    return refunded > 0 ? 'partially_refunded' : 'approved';
  }
  return p.status;
}

function platformComparable(d: ReconcileDonation, gross: number): string {
  if (d.status !== 'approved') return d.status;
  if (d.reversedCop === 0) return 'approved';
  return -d.reversedCop >= gross ? 'refunded_or_charged_back' : 'partially_refunded';
}

function statusesAgree(platform: string, gateway: string): boolean {
  if (platform === gateway) return true;
  if (platform === 'refunded_or_charged_back') {
    return gateway === 'refunded' || gateway === 'charged_back';
  }
  return false;
}

const HINTS: Record<Exclude<ReconciliationStatus, 'matched'>, string> = {
  missing_in_gateway:
    'AdoptaFácil la tiene aprobada pero Mercado Pago no la reporta. Pulsa "Releer Mercado Pago"; si sigue faltando, búscala en tu cuenta de Mercado Pago con esta referencia.',
  missing_in_platform:
    'Mercado Pago tiene este pago aprobado y AdoptaFácil no. Pulsa "Releer Mercado Pago": si el monto coincide, la donación queda aprobada y entra al libro.',
  status_mismatch:
    'El estado no coincide (por ejemplo, un reembolso o contracargo). Pulsa "Releer Mercado Pago" para traer el estado actual.',
  amount_mismatch:
    'El monto que cobró Mercado Pago no coincide con el de la donación. No se aprobó automáticamente: revísalo en tu cuenta de Mercado Pago.',
};

export function emptyReconciliationCounts(): Record<ReconciliationStatus, number> {
  return Object.fromEntries(RECONCILIATION_STATUSES.map((s) => [s, 0])) as Record<
    ReconciliationStatus,
    number
  >;
}

export interface ReconciliationResult {
  counts: Record<ReconciliationStatus, number>;
  platformTotalCop: number;
  gatewayTotalCop: number;
  gatewayFeesCop: number;
  gatewayNetCop: number;
  lines: ReconciliationLine[];
}

const APPROVED_LIKE = new Set(['approved', 'refunded', 'charged_back']);

/**
 * Cruza las donaciones de AdoptaFácil hechas con Mercado Pago (referencia
 * `af-…`) contra los pagos que Mercado Pago reportó para la cuenta del
 * refugio en el mes. Solo considera donaciones aprobadas en AdoptaFácil o
 * pagos aprobados (o luego reversados) en Mercado Pago.
 */
export function reconcile(
  donations: readonly ReconcileDonation[],
  payments: readonly GatewayPaymentSource[],
): ReconciliationResult {
  const counts = emptyReconciliationCounts();
  const lines: ReconciliationLine[] = [];
  const byReference = new Map<string, GatewayPaymentSource>();
  for (const p of payments) {
    const current = byReference.get(p.externalReference);
    if (!current || (APPROVED_LIKE.has(p.status) && !APPROVED_LIKE.has(current.status))) {
      byReference.set(p.externalReference, p);
    }
  }
  const donationsByRef = new Map(donations.map((d) => [d.collectionId, d]));

  let platformTotal = 0;
  let gatewayTotal = 0;
  let gatewayFees = 0;
  let gatewayNet = 0;
  for (const p of byReference.values()) {
    if (!APPROVED_LIKE.has(p.status)) continue;
    gatewayTotal += toCop(p.transactionAmount);
    gatewayFees += collectorFee(p.feeDetails) ?? 0;
    gatewayNet += p.netReceivedAmount === null ? 0 : toCop(p.netReceivedAmount);
  }

  const push = (
    status: ReconciliationStatus,
    line: Omit<ReconciliationLine, 'status' | 'hint'>,
  ) => {
    counts[status]++;
    lines.push({ status, ...line, hint: status === 'matched' ? '' : HINTS[status] });
  };

  for (const d of donations) {
    if (d.status !== 'approved') continue;
    platformTotal += d.amountCharged;
    const p = byReference.get(d.collectionId);
    const base = {
      reference: d.collectionId,
      donationId: d.id,
      gatewayPaymentId: p?.mpPaymentId ?? null,
      platformAmountCop: d.amountCharged,
      gatewayAmountCop: p ? toCop(p.transactionAmount) : null,
      occurredAt: (p?.dateApproved ?? d.at).toISOString(),
    };
    if (!p || !APPROVED_LIKE.has(p.status)) {
      push('missing_in_gateway', {
        ...base,
        platformStatus: 'approved',
        gatewayStatus: p?.status ?? null,
      });
      continue;
    }
    const gross = toCop(p.transactionAmount);
    const platformStatus = platformComparable(d, gross);
    const gatewayStatus = gatewayComparable(p);
    if (gross !== d.amountCharged) {
      push('amount_mismatch', { ...base, platformStatus, gatewayStatus });
    } else if (!statusesAgree(platformStatus, gatewayStatus)) {
      push('status_mismatch', { ...base, platformStatus, gatewayStatus });
    } else {
      push('matched', { ...base, platformStatus, gatewayStatus });
    }
  }

  for (const p of byReference.values()) {
    if (!APPROVED_LIKE.has(p.status)) continue;
    const d = donationsByRef.get(p.externalReference);
    if (d && d.status === 'approved') continue; // ya cruzado arriba
    const status: ReconciliationStatus =
      d && toCop(p.transactionAmount) !== d.amountCharged
        ? 'amount_mismatch'
        : 'missing_in_platform';
    push(status, {
      reference: p.externalReference,
      donationId: d?.id ?? null,
      gatewayPaymentId: p.mpPaymentId,
      platformStatus: d?.status ?? null,
      gatewayStatus: gatewayComparable(p),
      platformAmountCop: d?.amountCharged ?? null,
      gatewayAmountCop: toCop(p.transactionAmount),
      occurredAt: (p.dateApproved ?? p.firstSeenAt).toISOString(),
    });
  }

  lines.sort((a, b) =>
    a.status === b.status
      ? a.occurredAt.localeCompare(b.occurredAt)
      : a.status === 'matched'
        ? 1
        : b.status === 'matched'
          ? -1
          : a.status.localeCompare(b.status),
  );
  return {
    counts,
    platformTotalCop: platformTotal,
    gatewayTotalCop: gatewayTotal,
    gatewayFeesCop: gatewayFees,
    gatewayNetCop: gatewayNet,
    lines: lines.slice(0, 500),
  };
}
