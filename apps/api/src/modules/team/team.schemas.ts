import { z } from 'zod';
import { CARE_LOG_KINDS } from '@adoptafacil/contracts';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD');

/** `POST /team/assignments`. */
export const createTeamAssignmentSchema = z
  .object({
    assigneeUserId: z.string().guid(),
    kind: z.enum(['task', 'animal_care']),
    title: z.string().trim().min(2).max(160).optional(),
    details: z.string().trim().max(2000).optional(),
    dueDate: isoDate.optional(),
    animalId: z.string().guid().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.kind === 'animal_care' && !value.animalId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['animalId'],
        message: 'Elige el animal que queda a cargo de esta persona.',
      });
    }
    if (value.kind === 'task' && !value.title) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['title'],
        message: 'Escribe la tarea.',
      });
    }
  });

/** `GET /team/assignments?assigneeUserId=&status=`. */
export const listTeamAssignmentsQuerySchema = z
  .object({
    assigneeUserId: z.string().guid().optional(),
    status: z.enum(['open', 'done', 'cancelled']).optional(),
  })
  .strict();

/** `POST /team/me/assignments/:id/complete`. */
export const completeTeamAssignmentSchema = z
  .object({ note: z.string().trim().max(1000).optional() })
  .strict();

/** `POST /team/me/animals/:animalId/care-logs`. */
export const createAnimalCareLogSchema = z
  .object({
    kind: z.enum(CARE_LOG_KINDS as [string, ...string[]]),
    note: z.string().trim().max(1000).optional(),
    occurredAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.kind === 'observation' && !value.note) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['note'],
        message: 'Escribe lo que observaste.',
      });
    }
  });
