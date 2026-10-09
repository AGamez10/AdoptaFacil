import { SetMetadata } from '@nestjs/common';
import type { PlanCapability } from '@adoptafacil/contracts';

export const REQUIRED_PLAN_CAPABILITY_KEY = 'plans:required-capability';

/**
 * Gate a handler (or controller) behind a plan capability. Combined with
 * {@link PlanGuard}, placed AFTER JwtAuthGuard and RolesGuard: the org comes from
 * the authenticated principal (the JWT), never from a header. A missing
 * capability answers 403 with `code: PLAN_REQUIRED` and the cheapest plan that
 * includes it, so the web can offer the upgrade instead of a dead end.
 *
 * Only brand/reach/convenience features may carry this decorator — never a
 * safety, compliance or transparency feature (contract, follow-ups, audit,
 * documents, donation receipts).
 */
export const RequirePlan = (capability: PlanCapability): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_PLAN_CAPABILITY_KEY, capability);
