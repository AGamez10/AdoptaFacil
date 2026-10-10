import { z } from 'zod';
import {
  PLATFORM_ROLES,
  Role,
  SENSITIVE_ACTION_TYPES,
  WORKSPACE_NOTE_MAX_LENGTH,
  WORKSPACE_TICKET_STATUSES,
} from '@adoptafacil/contracts';

const uuid = z.string().uuid();
const version = z.number().int().min(1).max(1_000_000);
const platformRole = z
  .nativeEnum(Role)
  .refine((role) => PLATFORM_ROLES.includes(role), { message: 'Only platform roles' });
const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Invalid date');

export const uuidParamSchema = uuid;

export const ticketVersionSchema = z.object({ expectedVersion: version });

export const ticketStatusSchema = z.object({
  expectedVersion: version,
  status: z.enum(WORKSPACE_TICKET_STATUSES),
  note: z.string().trim().max(WORKSPACE_NOTE_MAX_LENGTH).optional(),
});

export const ticketNoteSchema = z.object({
  note: z.string().trim().min(1).max(WORKSPACE_NOTE_MAX_LENGTH),
});

export const staffInvitePayloadSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  role: platformRole,
});
export const staffRolePayloadSchema = z.object({ userId: uuid, role: platformRole });
export const staffMfaResetPayloadSchema = z.object({ userId: uuid });
export const auditExportPayloadSchema = z
  .object({ from: isoDay, to: isoDay })
  .refine((p) => p.from <= p.to, { message: '`from` must not be after `to`' })
  .refine(
    (p) => Date.parse(`${p.to}T00:00:00Z`) - Date.parse(`${p.from}T00:00:00Z`) <= 366 * 86_400_000,
    { message: 'At most one year per export' },
  );

export const PAYLOAD_SCHEMAS = {
  'staff.invite': staffInvitePayloadSchema,
  'staff.role_grant': staffRolePayloadSchema,
  'staff.role_revoke': staffRolePayloadSchema,
  'staff.mfa_reset': staffMfaResetPayloadSchema,
  'audit.export': auditExportPayloadSchema,
} as const;

export const createSensitiveActionSchema = z.object({
  type: z.enum(SENSITIVE_ACTION_TYPES),
  payload: z.record(z.unknown()),
  reason: z.string().trim().min(5).max(1000),
});

export const approveSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'A 6-digit code'),
  note: z.string().trim().max(1000).optional(),
});

export const rejectSchema = z.object({
  note: z.string().trim().min(3).max(1000),
});

export const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().datetime().optional(),
  actorUserId: uuid.optional(),
});
