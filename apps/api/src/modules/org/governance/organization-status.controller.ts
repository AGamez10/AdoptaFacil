import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  type ChangeOrganizationStatusInput,
  ORG_ROLES,
  type OrganizationStatus,
  type OrganizationStatusView,
  PLATFORM_ROLES,
  type PlatformOrganizationListItem,
  Role,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../../core/auth/auth.types';
import { CurrentUser } from '../../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../../core/auth/zod-validation.pipe';
import { Roles } from '../../../core/rbac/roles.decorator';
import { RolesGuard } from '../../../core/rbac/roles.guard';
import { changeOrganizationStatusSchema, listOrganizationsQuerySchema } from './governance.schemas';
import { OrganizationStatusService } from './organization-status.service';

/** The caller's own organization status (R2-1). */
@Controller('org/status')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganizationStatusController {
  constructor(private readonly status: OrganizationStatusService) {}

  /** Any member of the organization. Reachable while suspended, so the
   *  backoffice can explain the 403s. */
  @Get()
  @Roles(...ORG_ROLES)
  get(): Promise<OrganizationStatusView> {
    return this.status.getOwn();
  }

  /** The Owner sends a draft or observed organization to platform review. */
  @Post('submit')
  @HttpCode(200)
  @Roles(Role.Owner)
  submit(@CurrentUser() actor: RequestUser): Promise<OrganizationStatusView> {
    return this.status.submit(actor.id);
  }
}

/** Platform review of organizations (R2-1, AF-023). Deny-by-default: only
 *  PlatformAdmin / PlatformSuperAdmin; changes are audited in the target
 *  organization's trail. */
@Controller('platform/organizations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...PLATFORM_ROLES)
export class PlatformOrganizationStatusController {
  constructor(private readonly status: OrganizationStatusService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(listOrganizationsQuerySchema))
    query: {
      status?: OrganizationStatus;
    },
  ): Promise<PlatformOrganizationListItem[]> {
    return this.status.list(query.status);
  }

  @Post(':organizationId/status')
  @HttpCode(200)
  change(
    @CurrentUser() actor: RequestUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body(new ZodValidationPipe(changeOrganizationStatusSchema)) dto: ChangeOrganizationStatusInput,
  ): Promise<OrganizationStatusView> {
    return this.status.change(actor.id, organizationId, dto);
  }
}
