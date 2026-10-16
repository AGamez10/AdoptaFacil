import { MIN_PASSWORD_LENGTH } from '@adoptafacil/contracts';

/**
 * Pure, framework-free form validators for the auth screens. Each returns a
 * human-readable (es-CO) error string, or `undefined` when the value is valid.
 * Keeping them pure makes them trivial to unit-test and reuse across forms.
 */

export type FieldError = string | undefined;

export { MIN_PASSWORD_LENGTH };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRequired(value: string, label = 'Este campo'): FieldError {
  return value.trim().length === 0 ? `${label} es obligatorio.` : undefined;
}

export function validateEmail(value: string): FieldError {
  if (value.trim().length === 0) return 'El correo es obligatorio.';
  return EMAIL_RE.test(value.trim()) ? undefined : 'Ingresa un correo válido.';
}

export function validatePassword(value: string): FieldError {
  if (value.length === 0) return 'La contraseña es obligatoria.';
  return value.length < MIN_PASSWORD_LENGTH
    ? `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`
    : undefined;
}

export function validatePasswordConfirmation(password: string, confirmation: string): FieldError {
  if (confirmation.length === 0) return 'Confirma tu contraseña.';
  return password !== confirmation ? 'Las contraseñas no coinciden.' : undefined;
}

/** Drop `undefined` entries and report whether any error remains. */
export function collectErrors<T extends Record<string, FieldError>>(
  errors: T,
): { errors: Partial<Record<keyof T, string>>; isValid: boolean } {
  const filtered: Partial<Record<keyof T, string>> = {};
  for (const key of Object.keys(errors) as (keyof T)[]) {
    const message = errors[key];
    if (message) filtered[key] = message;
  }
  return { errors: filtered, isValid: Object.keys(filtered).length === 0 };
}

/**
 * Login failure copy. Wrong credentials stay generic (never leak whether the
 * email exists or which field failed), but a rate limit or an unreachable API
 * must not read as "wrong password": that sent people to retry, which only
 * extends the block.
 */
export function loginErrorMessage(status: number): string {
  if (status === 429) {
    return 'Hiciste varios intentos seguidos. Espera un minuto y vuelve a intentarlo.';
  }
  if (status === 0) {
    return 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
  }
  if (status >= 500) {
    return 'El servidor tuvo un problema al iniciar sesión. Inténtalo de nuevo en unos minutos.';
  }
  return 'No pudimos iniciar sesión. Revisa tu correo y contraseña.';
}

/**
 * Message for a failed sign-up. A taken email keeps its own message; an API
 * that cannot be reached (status 0, e.g. the local Docker services are down)
 * or a 5xx must say the service is unavailable instead of a generic "try
 * again", which sent people to retry the same form for nothing.
 */
export function registerErrorMessage(status: number, code: string): string {
  // The real API's 409 has no body `code`; the client falls back to 'conflict'.
  if (status === 409 || code === 'conflict') return 'Ya existe una cuenta con este correo.';
  if (status === 429) {
    return 'Hiciste varios intentos seguidos. Espera un minuto y vuelve a intentarlo.';
  }
  if (status === 0) {
    return 'El servicio no está disponible: no pudimos conectar con el servidor. Inténtalo de nuevo en unos minutos.';
  }
  if (status >= 500) {
    return 'El servicio no está disponible en este momento. Inténtalo de nuevo en unos minutos.';
  }
  return 'No pudimos crear la cuenta. Revisa los datos e inténtalo de nuevo.';
}
