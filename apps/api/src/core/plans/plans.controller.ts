import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import {
  Role,
  type AssignOrganizationPlanInput,
  type OrganizationPlanView,
  type OrganizationSubscription,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../auth/zod-validation.pipe';
import { Roles } from '../rbac/roles.decorator';
import { RolesGuard } from '../rbac/roles.guard';
import { assignPlanSchema } from './plans.schemas';
import { PlansService } from './plans.service';

/** `GET /org/plan`: the caller's org plan, limits, usage and the catalog.
 *  Billing is an Owner/Administrator matter (deny-by-default for other roles). */
@Controller('org/plan')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Owner, Role.Administrator)
export class OrgPlanController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  get(@CurrentUser() user: RequestUser): Promise<OrganizationPlanView> {
    return this.plans.view(user.organizationId);
  }
}

/**
 * Platform plan management (cross-tenant, PlatformAdmin/PlatformSuperAdmin):
 * activate, extend or cancel an org's plan once its manual payment arrived.
 * Every change is audited in the TARGET org's log.
 */
@Controller('platform/organizations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PlatformAdmin, Role.PlatformSuperAdmin)
export class PlatformPlansController {
  constructor(private readonly plans: PlansService) {}

  @Get(':id/plan')
  get(@Param('id') id: string): Promise<OrganizationPlanView> {
    return this.plans.platformGet(id);
  }

  @Put(':id/plan')
  assign(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(assignPlanSchema)) dto: AssignOrganizationPlanInput,
  ): Promise<OrganizationSubscription> {
    return this.plans.assign(actor.id, id, dto);
  }
}
