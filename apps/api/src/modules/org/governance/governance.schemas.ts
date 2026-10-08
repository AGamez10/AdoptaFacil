import { z } from 'zod';
import { OrganizationStatus } from '@adoptafacil/contracts';
import { newPasswordSchema } from '../../../core/auth/auth.schemas';
import { orgRoleSchema } from '../../../core/rbac/rbac.schemas';

/** `POST /platform/organizations/:organizationId/status` (R2-1). The reason is
 *  checked against the target status in the service. */
export const changeOrganizationStatusSchema = z
  .object({
    status: z.nativeEnum(OrganizationStatus),
    reason: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();

/** `GET /platform/organizations?status=`. */
export const listOrganizationsQuerySchema = z
  .object({ status: z.nativeEnum(OrganizationStatus).optional() })
  .strict();

/** `POST /org/invitations` (R2-3). Only organization roles (never platform). */
export const createInvitationSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    role: orgRoleSchema,
  })
  .strict();

/** The raw invitation token: 32 random bytes in base64url (43 chars). */
const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid invitation token');

export const previewInvitationSchema = z.object({ token: invitationTokenSchema }).strict();

export const acceptInvitationSchema = z
  .object({
    token: invitationTokenSchema,
    displayName: z.string().trim().min(1).max(120),
    password: newPasswordSchema,
  })
  .strict();
