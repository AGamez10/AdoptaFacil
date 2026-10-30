import { z } from 'zod';
import {
  LEDGER_CONCEPT_MAX,
  LEDGER_COUNTERPARTY_MAX,
  LEDGER_EXPENSE_CATEGORIES,
  LEDGER_INCOME_CATEGORIES,
  LEDGER_MAX_AMOUNT_COP,
  LEDGER_VOID_REASON_MAX,
  LEDGER_VOID_REASON_MIN,
} from '@adoptafacil/contracts';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EARLIEST = '2000-01-01';

/** Hoy en Colombia (YYYY-MM-DD): la fecha del movimiento es fecha local. */
export function todayInColombia(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * Registrar un movimiento. Llega como JSON o como multipart (con el soporte en
 * el campo `support`): en multipart todo es texto, por eso el monto se coacciona
 * y un campo vacío cuenta como ausente. Los mensajes van en español porque
 * llegan tal cual al formulario.
 */
export const createLedgerEntrySchema = z
  .object({
    kind: z.enum(['income', 'expense'], { message: 'Elige si es un ingreso o un gasto.' }),
    category: z.string({ message: 'Elige una categoría.' }),
    occurredOn: z
      .string({ message: 'Indica la fecha del movimiento.' })
      .refine(isRealDate, 'La fecha no es válida.')
      .refine((v) => v >= EARLIEST, 'La fecha es demasiado antigua.')
      .refine((v) => v <= todayInColombia(), 'La fecha no puede ser futura.'),
    amountCop: z.coerce
      .number({ message: 'Escribe el valor en pesos.' })
      .int('Escribe el valor en pesos, sin centavos.')
      .positive('El valor debe ser mayor que cero.')
      .max(LEDGER_MAX_AMOUNT_COP, 'El valor es demasiado alto. Revisa los ceros.'),
    concept: z
      .string({ message: 'Describe el movimiento.' })
      .trim()
      .min(3, 'Describe el movimiento en al menos 3 caracteres.')
      .max(LEDGER_CONCEPT_MAX, `La descripción admite hasta ${LEDGER_CONCEPT_MAX} caracteres.`),
    counterparty: z
      .string()
      .trim()
      .max(
        LEDGER_COUNTERPARTY_MAX,
        `El proveedor admite hasta ${LEDGER_COUNTERPARTY_MAX} caracteres.`,
      )
      .optional()
      .transform((v) => (v ? v : undefined)),
    clientRequestId: z
      .string()
      .uuid()
      .optional()
      .or(z.literal('').transform(() => undefined)),
  })
  .strict()
  .superRefine((value, ctx) => {
    const allowed: readonly string[] =
      value.kind === 'income' ? LEDGER_INCOME_CATEGORIES : LEDGER_EXPENSE_CATEGORIES;
    if (!allowed.includes(value.category)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['category'],
        message: 'La categoría no corresponde al tipo de movimiento.',
      });
    }
    // Habeas Data: en un ingreso nunca se publica de quién vino.
    if (value.kind === 'income' && value.counterparty) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['counterparty'],
        message: 'En un ingreso no se publica el nombre de quien donó.',
      });
    }
  });

export type CreateLedgerEntryDto = z.infer<typeof createLedgerEntrySchema>;

export const voidLedgerEntrySchema = z
  .object({
    reason: z
      .string({ message: 'Explica por qué anulas el movimiento.' })
      .trim()
      .min(
        LEDGER_VOID_REASON_MIN,
        `Explica el motivo en al menos ${LEDGER_VOID_REASON_MIN} caracteres.`,
      )
      .max(LEDGER_VOID_REASON_MAX, `El motivo admite hasta ${LEDGER_VOID_REASON_MAX} caracteres.`),
  })
  .strict();
