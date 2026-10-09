import { z } from 'zod';
import { ORG_ROLES, Role } from '@adoptafacil/contracts';

/** An organization role (§13). Platform roles (Admin/SuperAdmin) are
 *  provisioned out of band and can never be granted or revoked by an
 *  organization member through the org-scoped endpoints. */
export const orgRoleSchema = z.nativeEnum(Role).refine((role) => ORG_ROLES.includes(role), {
  message: 'Only organization roles can be managed here',
});

/** Validates a role assignment. Only ORGANIZATION roles may be assigned through
 *  the org-scoped endpoint — platform roles (Admin/SuperAdmin) are provisioned
 *  out of band and can never be granted by an organization admin. */
export const assignRoleSchema = z.object({
  userId: z.string().uuid(),
  role: orgRoleSchema,
});

/** Path params of `DELETE /rbac/roles/:userId/:role` (SEC-022): a malformed id
 *  or an unknown role is a 400, never a database error (500). */
export const revokeRoleParamsSchema = z.object({
  userId: z.string().uuid(),
  role: orgRoleSchema,
});
