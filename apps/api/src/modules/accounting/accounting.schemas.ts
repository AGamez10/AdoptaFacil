import { z } from 'zod';

/** `POST /org/accounting/periods/:period/close`. Estricto. */
export const closeAccountingPeriodSchema = z
  .object({
    note: z.string().trim().max(500).optional(),
    acknowledgeDiscrepancies: z.boolean().optional(),
  })
  .strict();

/** `POST /org/accounting/periods/:period/shares`. Estricto. */
export const createAccountingShareSchema = z
  .object({ signerRole: z.enum(['accountant', 'fiscal_reviewer']) })
  .strict();

const token = z.string().min(20).max(200);
const format = z.enum(['csv', 'xlsx']).default('xlsx');

/** Enlaces sin sesión: el token viaja en el cuerpo, nunca en la URL. */
export const accountingShareTokenSchema = z.object({ token }).strict();
export const accountingShareExportSchema = z.object({ token, format }).strict();
