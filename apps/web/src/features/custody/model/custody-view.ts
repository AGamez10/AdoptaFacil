import type {
  CustodyAccountStatus,
  CustodyChargeSituation,
  CustodyContractStatus,
  CustodyStatus,
} from '@adoptafacil/contracts';

/** Presentación de custodia (hora Colombia solo aquí, en la UI). */

type Tone = 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive' | 'info';

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export function formatCop(value: number): string {
  return COP.format(value);
}

/** "185.000" o "185000" → 185000; `null` si no es un entero positivo. */
export function parseCopInput(text: string): number | null {
  const digits = text.replace(/[.\s$]/g, '');
  if (!/^\d{1,10}$/.test(digits)) return null;
  const value = Number(digits);
  return value > 0 ? value : null;
}

export function todayInColombia(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** `2026-10-29` → `29 oct 2026`. Fecha de calendario: no se convierte. */
export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Instante UTC → fecha y hora de Colombia. */
export function formatInstant(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

/** Valor para un `<input type="datetime-local">` con la hora de ahora. */
export function nowLocalInput(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function localInputToIso(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const CUSTODY_STATUS_TONE: Record<CustodyStatus, Tone> = {
  not_registered: 'secondary',
  in_custody: 'info',
  released: 'outline',
};

export const CONTRACT_STATUS_TONE: Record<CustodyContractStatus | 'none', Tone> = {
  none: 'secondary',
  draft: 'warning',
  issued: 'info',
  active: 'success',
  ended: 'outline',
  cancelled: 'outline',
};

export const ACCOUNT_STATUS_TONE: Record<CustodyAccountStatus, Tone> = {
  no_charges: 'secondary',
  up_to_date: 'success',
  pending: 'info',
  overdue: 'warning',
};

export const SITUATION_TONE: Record<CustodyChargeSituation, Tone> = {
  upcoming: 'secondary',
  due_today: 'info',
  overdue: 'warning',
  extended: 'info',
  extension_breached: 'warning',
  paid: 'success',
  cancelled: 'outline',
};

export const ANIMAL_STATUS_LABELS: Record<string, string> = {
  available: 'En adopción',
  in_process: 'En proceso',
  adopted: 'Adoptado',
  unavailable: 'No disponible',
  deceased: 'Fallecido',
};

export const SPECIES_LABELS: Record<string, string> = {
  dog: 'Perro',
  cat: 'Gato',
  other: 'Otra especie',
};

export const SEX_LABELS: Record<string, string> = {
  male: 'Macho',
  female: 'Hembra',
  unknown: 'Sin determinar',
};

export const FILE_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';

/** Lo que falta para generar un documento, cuando la API responde 422. */
export function missingDataOf(error: unknown): string[] {
  const details = (error as { details?: { missing?: unknown } } | null)?.details;
  const list = Array.isArray(details?.missing) ? details.missing : [];
  return list
    .map((item) => (item as { message?: unknown }).message)
    .filter((message): message is string => typeof message === 'string' && message.length > 0);
}
