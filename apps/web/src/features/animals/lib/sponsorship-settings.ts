import { MAX_SPONSORSHIP_AMOUNT_COP } from '@adoptafacil/contracts';
import { ApiError } from '../../../shell/api';

/** Feature-local (same duplication convention as `formatBogota`/`formatCop`
 *  elsewhere in the repo) — `animals` and `sponsorships` stay decoupled. */
export function formatCop(pesos: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(pesos);
}

/** "50000" → "50.000", the way people write pesos in Colombia. */
export function formatAmountInput(pesos: number): string {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(pesos);
}

export type ParsedAmount = { ok: true; value: number } | { ok: false; message: string };

/**
 * Reads what the organization typed as the monthly amount. Accepts the usual
 * Colombian ways of writing pesos ("50000", "50.000", "$ 50.000"); rejects
 * decimals ("50.000,50") and anything outside 1..MAX instead of guessing.
 */
export function parseAmountInput(raw: string): ParsedAmount {
  const cleaned = raw.replace(/[\s$]/g, '');
  if (cleaned === '') {
    return { ok: false, message: 'Escribe el aporte mensual, por ejemplo 50.000.' };
  }
  if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(cleaned)) {
    return {
      ok: false,
      message: 'Escribe solo pesos enteros, sin centavos. Por ejemplo: 50.000.',
    };
  }
  const value = Number(cleaned.replace(/\./g, ''));
  if (value <= 0) {
    return { ok: false, message: 'El aporte mensual debe ser mayor a cero.' };
  }
  if (value > MAX_SPONSORSHIP_AMOUNT_COP) {
    return {
      ok: false,
      message: `El aporte mensual no puede superar ${formatCop(MAX_SPONSORSHIP_AMOUNT_COP)}. ¿Te sobra un cero?`,
    };
  }
  return { ok: true, value };
}

/**
 * Turns an API failure into a sentence an organization's staff can act on.
 * Never shows the raw server/console message.
 */
export function sponsorshipErrorMessage(error: unknown): string {
  const status = ApiError.is(error) ? error.status : 0;
  switch (status) {
    case 0:
      return 'No pudimos conectarnos. Revisa tu conexión a internet e inténtalo de nuevo.';
    case 400:
      return 'No pudimos guardar el cambio. Verifica que el animal siga activo y que el monto sea un número entero.';
    case 401:
      return 'Tu sesión expiró. Vuelve a iniciar sesión e inténtalo de nuevo.';
    case 403:
      return 'Tu rol no permite cambiar el apadrinamiento. Pídeselo a la persona dueña o administradora de la organización.';
    case 404:
      return 'No encontramos este animal. Puede que lo hayan dado de baja; recarga la página.';
    case 409:
      return 'Este plan ya tiene padrinos. Cambia el monto desde esta misma ventana para que aplique solo a los padrinos nuevos.';
    case 429:
      return 'Hiciste muchos cambios seguidos. Espera un minuto e inténtalo de nuevo.';
    default:
      return 'Algo salió mal de nuestro lado. Inténtalo de nuevo en unos minutos.';
  }
}
