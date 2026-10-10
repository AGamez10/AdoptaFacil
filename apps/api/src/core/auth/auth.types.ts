import type { Request } from 'express';
import type { AccountType } from '@adoptafacil/contracts';

/** The principal attached to the request after the JWT guard validates a token. */
export interface RequestUser {
  id: string;
  organizationId: string;
  accountType: AccountType;
  email: string;
  /** Epoch seconds when this session passed the second factor (`mfa_at`
   *  claim), if it did. Platform roles require it (see RolesGuard). */
  mfaAt?: number;
}

/** Set by RolesGuard when a request was authorized ONLY through a platform
 *  role, so the platform access log records it in the staff member's team. */
export interface PlatformAccessMark {
  teamOrganizationId: string;
  roles: string[];
}

/** Express request augmented with the authenticated principal. */
export interface AuthenticatedRequest extends Request {
  user?: RequestUser;
  platformAccess?: PlatformAccessMark;
}
