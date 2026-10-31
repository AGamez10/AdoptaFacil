/**
 * Criterio ÚNICO de fechas válidas (pantalla + API). Todo formulario o anexo
 * que pide una fecha la valida con estas funciones, para que la web y el
 * servidor rechacen lo mismo y con el mismo mensaje:
 *
 * - fechas inexistentes (30 de febrero, mes 13, 29 de febrero en año no
 *   bisiesto) — nunca se "corrigen" en silencio al día siguiente;
 * - formatos ambiguos (`03/04/2026`, `2026-3-4`, texto libre): solo se acepta
 *   AAAA-MM-DD o ISO-8601 con zona horaria;
 * - fechas imposibles según el caso (nacimiento futuro, vencimiento ya pasado,
 *   años absurdos).
 *
 * "Hoy" es siempre el día calendario de Colombia (UTC-5 todo el año, sin
 * horario de verano), no el del servidor ni el del navegador.
 */

/** Colombia es UTC-5 todo el año. */
export const COLOMBIA_UTC_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Ninguna fecha que registre el producto es anterior a 1900. */
export const EARLIEST_ALLOWED_DATE = '1900-01-01';

/** Por defecto, una fecha futura (vencimiento, plazo, cita) no va más allá de 10 años. */
export const DEFAULT_MAX_YEARS_AHEAD = 10;

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2}))?$/;

/** Hoy en Colombia como `AAAA-MM-DD`. */
export function todayInColombia(now: Date = new Date()): string {
  return new Date(now.getTime() - COLOMBIA_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

/** Suma (o resta) días a un día `AAAA-MM-DD`. */
export function addDaysToDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Suma (o resta) años a un día `AAAA-MM-DD` (29-feb pasa a 28-feb). */
export function addYearsToDay(day: string, years: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const lastDay = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
  const target = new Date(Date.UTC(y + years, m - 1, Math.min(d, lastDay)));
  return target.toISOString().slice(0, 10);
}

function isRealDay(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/** `true` solo para `AAAA-MM-DD` que existe en el calendario. */
export function isCalendarDate(value: string): boolean {
  const match = DAY_RE.exec(value);
  return match !== null && isRealDay(Number(match[1]), Number(match[2]), Number(match[3]));
}

export type DateParseFailure = 'format' | 'nonexistent';

/**
 * Día calendario (`AAAA-MM-DD`) que representa un valor de fecha, o el motivo
 * por el que no es una fecha válida.
 *
 * Acepta `AAAA-MM-DD` o ISO-8601 con zona horaria. Los formularios envían un
 * día como medianoche UTC (`2026-10-30T00:00:00.000Z`): ese valor ES el día
 * 30, no las 19:00 del 29 en Colombia. Cualquier otra hora es un instante real
 * y se lee en hora de Colombia.
 */
export function parseCalendarDay(
  value: string,
): { ok: true; day: string } | { ok: false; reason: DateParseFailure } {
  const match = typeof value === 'string' ? ISO_RE.exec(value.trim()) : null;
  if (!match) return { ok: false, reason: 'format' };
  const [, ys, ms, ds, hh, mi, ss, zone] = match;
  const day = `${ys}-${ms}-${ds}`;
  if (!isRealDay(Number(ys), Number(ms), Number(ds))) return { ok: false, reason: 'nonexistent' };
  if (hh === undefined) return { ok: true, day };
  if (Number(hh) > 23 || Number(mi) > 59 || Number(ss ?? 0) > 59) {
    return { ok: false, reason: 'nonexistent' };
  }
  const instant = new Date(value.trim());
  if (Number.isNaN(instant.getTime())) return { ok: false, reason: 'format' };
  const isMidnightUtc =
    instant.getTime() % 86_400_000 === 0 && (zone === 'Z' || /^\+00:?00$/.test(zone ?? ''));
  return { ok: true, day: isMidnightUtc ? day : todayInColombia(instant) };
}

/** Reglas de una fecha según su significado. */
export interface DateRule {
  /** Sujeto de la frase, p. ej. "La fecha de nacimiento". */
  label: string;
  /** No puede ser posterior a hoy (nacimiento, expedición, gasto, evento). */
  notFuture?: boolean;
  /** No puede ser anterior a hoy (vencimiento, plazo, cita programada). */
  notPast?: boolean;
  /** Día mínimo aceptado (`AAAA-MM-DD`). Por defecto 1900-01-01. */
  min?: string;
  /** Máximo de años hacia el futuro. Por defecto 10; ignorado con `notFuture`. */
  maxYearsAhead?: number;
}

/** "30 de octubre de 2026" — para mensajes. */
export function formatDayEs(day: string): string {
  const months = [
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
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return `${d} de ${months[m - 1]} de ${y}`;
}

/**
 * Valida una fecha contra su regla. Devuelve el mensaje en español para el
 * usuario, o `null` si la fecha es válida.
 */
export function dateRuleError(
  value: string,
  rule: DateRule,
  now: Date = new Date(),
): string | null {
  const parsed = parseCalendarDay(value);
  if (!parsed.ok) {
    return parsed.reason === 'nonexistent'
      ? `${rule.label} no existe en el calendario. Revisa el día y el mes.`
      : `${rule.label} no es una fecha válida. Usa el formato AAAA-MM-DD.`;
  }
  const { day } = parsed;
  const today = todayInColombia(now);
  const min = rule.min ?? EARLIEST_ALLOWED_DATE;
  if (day < min) {
    return `${rule.label} no puede ser anterior al ${formatDayEs(min)}.`;
  }
  if (rule.notFuture && day > today) {
    return `${rule.label} no puede ser posterior a hoy.`;
  }
  if (rule.notPast && day < today) {
    return `${rule.label} no puede ser anterior a hoy.`;
  }
  if (!rule.notFuture) {
    const years = rule.maxYearsAhead ?? DEFAULT_MAX_YEARS_AHEAD;
    if (day > addYearsToDay(today, years)) {
      return `${rule.label} no puede estar a más de ${years} años en el futuro.`;
    }
  }
  return null;
}

/**
 * Valida que `end` no sea anterior a `start` (o estrictamente posterior si
 * `strict`). Ambos deben ser fechas válidas; si alguna no lo es devuelve
 * `null` y deja ese error a `dateRuleError`.
 */
export function dateOrderError(
  start: string,
  end: string,
  labels: { start: string; end: string },
  options: { strict?: boolean } = {},
): string | null {
  const a = parseCalendarDay(start);
  const b = parseCalendarDay(end);
  if (!a.ok || !b.ok) return null;
  if (options.strict ? b.day <= a.day : b.day < a.day) {
    return options.strict
      ? `${labels.end} debe ser posterior a ${lowerFirst(labels.start)}.`
      : `${labels.end} no puede ser anterior a ${lowerFirst(labels.start)}.`;
  }
  return null;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * Reglas de cada fecha del producto. Una sola tabla, usada por la API (Zod) y
 * por los formularios web (`min`/`max` del calendario y validación previa).
 */
export const DATE_RULES = {
  animalBirth: { label: 'La fecha de nacimiento', notFuture: true, min: '1980-01-01' },
  petBirth: { label: 'La fecha de nacimiento', notFuture: true, min: '1980-01-01' },
  documentIssued: { label: 'La fecha de expedición', notFuture: true },
  documentExpires: { label: 'La fecha de vencimiento', notPast: true, maxYearsAhead: 50 },
  clinicalOccurred: { label: 'La fecha del evento clínico', notFuture: true, min: '1980-01-01' },
  clinicalNextDue: { label: 'La próxima fecha', maxYearsAhead: 5 },
  campaignDeadline: { label: 'La fecha límite de la campaña', notPast: true, maxYearsAhead: 3 },
  campaignSpent: { label: 'La fecha del gasto', notFuture: true, min: '2000-01-01' },
  opportunityStart: { label: 'La fecha de inicio', min: '2000-01-01', maxYearsAhead: 3 },
  opportunityEnd: { label: 'La fecha de fin', notPast: true, maxYearsAhead: 5 },
  serviceHoursDate: { label: 'La fecha de la sesión', notFuture: true, min: '2000-01-01' },
  deliveryScheduled: { label: 'La fecha de entrega', notPast: true, maxYearsAhead: 2 },
  followupDue: { label: 'La fecha del hito', notPast: true, maxYearsAhead: 5 },
} as const satisfies Record<string, DateRule>;

export type DateRuleName = keyof typeof DATE_RULES;

/** Límites para el `min`/`max` de un `<input type="date">` según la regla. */
export function dateInputBounds(
  rule: DateRule,
  now: Date = new Date(),
): { min: string; max: string } {
  const today = todayInColombia(now);
  const min = rule.notPast ? today : (rule.min ?? EARLIEST_ALLOWED_DATE);
  const max = rule.notFuture
    ? today
    : addYearsToDay(today, rule.maxYearsAhead ?? DEFAULT_MAX_YEARS_AHEAD);
  return { min, max };
}

/** Máximo de horas que una persona puede registrar en un mismo día. */
export const MAX_SERVICE_HOURS_PER_DAY = 24;
