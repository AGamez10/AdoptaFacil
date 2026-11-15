import type { NationalTransparency } from '@adoptafacil/contracts';
import { friendlyHttpError } from '../../../shell/api/friendly-error';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/**
 * Transparencia Nacional (`GET /public/transparency/national`), sin sesión:
 * el consolidado de los libros públicos de todas las organizaciones aprobadas.
 */
export async function fetchNationalTransparency(
  signal?: AbortSignal,
): Promise<NationalTransparency> {
  const response = await fetch(
    `${API_BASE}/public/transparency/national`,
    signal ? { signal } : undefined,
  );
  if (!response.ok) throw await friendlyHttpError(response);
  return normalize((await response.json()) as Partial<NationalTransparency> | null);
}

/** Una respuesta incompleta nunca rompe el tablero. */
export function normalize(body: Partial<NationalTransparency> | null): NationalTransparency {
  const b = body ?? {};
  return {
    generatedAt: b.generatedAt ?? new Date().toISOString(),
    organizations: { approved: 0, reporting: 0, ...b.organizations },
    totals: {
      incomeCop: 0,
      expenseCop: 0,
      movementCount: 0,
      onlineDonationsCop: 0,
      onlineDonationsCount: 0,
      ...b.totals,
    },
    thisMonth: {
      month: '',
      incomeCop: 0,
      expenseCop: 0,
      movementCount: 0,
      onlineDonationsCount: 0,
      ...b.thisMonth,
    },
    months: Array.isArray(b.months) ? b.months : [],
    categories: Array.isArray(b.categories) ? b.categories : [],
    donationDestinations: Array.isArray(b.donationDestinations) ? b.donationDestinations : [],
    departments: Array.isArray(b.departments) ? b.departments : [],
    animals: { inAdoption: 0, adopted: 0, ...b.animals },
  };
}
