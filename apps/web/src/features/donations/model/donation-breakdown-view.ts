import {
  computeBreakdown,
  MIN_DONATION_AMOUNT,
  type PaymentBreakdown,
} from '@adoptafacil/contracts';

/**
 * View-model del DESGLOSE de una donación (§M05, P1). La cuenta es SIEMPRE la de
 * `computeBreakdown` (M15): el donante paga exactamente lo que elige, AdoptaFácil
 * no cobra comisión (0 %) y no se inventa ninguna tarifa de pasarela (Mercado
 * Pago cobra la suya a la cuenta de la organización). Este módulo solo etiqueta
 * las cifras para presentación (es-CO), sobre pesos enteros COP.
 */
export interface BreakdownLine {
  key: keyof PaymentBreakdown;
  label: string;
  amount: number;
  /** La línea que resalta (lo que se cobra / lo que recibe la org). */
  emphasis?: 'charged' | 'net';
}

/** Formatea pesos enteros COP (sin decimales). */
export function formatCop(pesos: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(pesos);
}

/** Presenta un ISO-8601 UTC en hora Colombia (UTC en almacenamiento, CO en UI). */
export function formatBogota(isoUtc: string): string {
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) return isoUtc;
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'medium',
  }).format(date);
}

/**
 * Etiqueta cada cifra de un `PaymentBreakdown` YA CALCULADO (compartido por el
 * checkout y por el detalle de una donación ya persistida, para que ambas
 * pantallas usen EXACTAMENTE el mismo texto). AdoptaFácil no cobra comisión
 * (0 %), así que nunca hay línea de AdoptaFácil; una comisión de pasarela o un
 * neto distinto solo aparecen si la donación guardada los tiene (hoy no se
 * estima la tarifa de Mercado Pago).
 */
export function breakdownLines(breakdown: PaymentBreakdown): BreakdownLine[] {
  const lines: BreakdownLine[] = [
    {
      key: 'amountCharged',
      label: 'Total que pagas',
      amount: breakdown.amountCharged,
      emphasis: 'charged',
    },
  ];
  const fees: BreakdownLine[] = [
    { key: 'gatewayFee', label: 'Comisión de la pasarela', amount: breakdown.gatewayFee },
    {
      key: 'gatewayIva',
      label: 'IVA sobre la comisión de la pasarela',
      amount: breakdown.gatewayIva,
    },
  ];
  lines.push(...fees.filter((line) => line.amount > 0));
  if (breakdown.net !== breakdown.amountCharged) {
    lines.push({
      key: 'net',
      label: 'Neto que recibe la organización',
      amount: breakdown.net,
      emphasis: 'net',
    });
  }
  return lines;
}

/**
 * Construye el desglose presentable a partir del monto donado. `breakdown` es
 * EXACTAMENTE `computeBreakdown(intendedAmount)`: misma fuente que el backend y
 * el recibo.
 */
export function buildDonationBreakdown(intendedAmount: number): {
  breakdown: PaymentBreakdown;
  lines: BreakdownLine[];
} {
  const breakdown = computeBreakdown(intendedAmount);
  return { breakdown, lines: breakdownLines(breakdown) };
}

/**
 * Variante segura para la UI en vivo: devuelve `null` si el monto aún no es válido
 * (vacío, no entero, o por debajo del mínimo), en vez de lanzar como
 * `computeBreakdown`. Así el formulario puede pedir el desglose en cada tecla.
 */
export function safeBuildDonationBreakdown(
  intendedAmount: number,
): { breakdown: PaymentBreakdown; lines: BreakdownLine[] } | null {
  if (!Number.isInteger(intendedAmount) || intendedAmount < MIN_DONATION_AMOUNT) {
    return null;
  }
  return buildDonationBreakdown(intendedAmount);
}
