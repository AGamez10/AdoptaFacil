import {
  DATE_RULES,
  dateInputBounds,
  dateRuleError,
  type DateRuleName,
} from '@adoptafacil/contracts';

/**
 * Atajos de la web sobre el criterio compartido de fechas (`@adoptafacil/contracts`).
 * La API aplica exactamente la misma regla, así que lo que pasa aquí no rebota
 * allá con otro mensaje.
 */

/** `min`/`max` del calendario para una fecha según su regla. */
export function dateBounds(name: DateRuleName): { min: string; max: string } {
  return dateInputBounds(DATE_RULES[name]);
}

/** Mensaje en español si la fecha no cumple su regla; `null` si está bien o vacía. */
export function dateError(name: DateRuleName, value: string): string | null {
  return value ? dateRuleError(value, DATE_RULES[name]) : null;
}
