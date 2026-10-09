import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { PLATFORM_ROLES, type PlatformFormalizationTransitionInput } from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { FormalizationService, type TransitionResult } from './formalization.service';
import { platformTransitionSchema } from './formalization.schemas';

/**
 * CROSS-TENANT platform governance of organizations. Deny-by-default: only
 * PlatformAdmin / PlatformSuperAdmin (resolved in the caller's OWN tenant by
 * the RolesGuard). Each operation names its target organization explicitly in
 * the path and is audited in that organization's trail.
 */
@Controller('platform/organizations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...PLATFORM_ROLES)
export class PlatformOrganizationsController {
  constructor(private readonly formalization: FormalizationService) {}

  /** Move an organization one formalization step (R2-2). Entering ESAL or
   *  ESAL_RTE requires an approved evidence document of that organization. */
  @Post(':organizationId/formalization/transitions')
  transition(
    @CurrentUser() actor: RequestUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body(new ZodValidationPipe(platformTransitionSchema))
    dto: PlatformFormalizationTransitionInput,
  ): Promise<TransitionResult> {
    return this.formalization.platformTransition(actor.id, organizationId, dto);
  }
}
