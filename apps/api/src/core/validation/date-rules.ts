import { dateOrderError, dateRuleError, type DateRule } from '@adoptafacil/contracts';
import { z } from 'zod';

/**
 * Campo de fecha validado con el criterio compartido de `@adoptafacil/contracts`
 * (`dates.ts`): rechaza formatos ambiguos, fechas inexistentes y fechas
 * imposibles según la regla, con el mismo mensaje en español que ve la web.
 */
export function ruledDate(rule: DateRule) {
  return z.string({ message: `${rule.label} es obligatoria.` }).superRefine((value, ctx) => {
    const error = dateRuleError(value, rule);
    if (error) ctx.addIssue({ code: 'custom', message: error });
  });
}

/** Igual que `dateOrderError`, pero lanzable desde un servicio con valores ya guardados. */
export { dateOrderError, dateRuleError };
