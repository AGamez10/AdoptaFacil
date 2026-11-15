import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  type CancelVolunteerOpportunityInput,
  type CreateVolunteerOpportunityInput,
  type Paginated,
  Role,
  type UpdateVolunteerOpportunityInput,
  type VolunteerOpportunity,
  type VolunteerOpportunityChangeResult,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { VolunteerOpportunitiesService } from './volunteer-opportunities.service';
import {
  cancelVolunteerOpportunitySchema,
  createVolunteerOpportunitySchema,
  updateVolunteerOpportunitySchema,
} from './volunteer-opportunities.schemas';

/** Roles that may publish/edit an opportunity (RF18). `Operator`'s scope is
 *  NOT defined by the base document for this module — TODO(client): confirm
 *  before granting it management access here. */
const MANAGE_ROLES = [Role.Owner, Role.Administrator] as const;
/** Roles that may VIEW internally (manage roles + the read-only auditor). */
const VIEW_ROLES = [...MANAGE_ROLES, Role.ReadOnlyAuditor] as const;

/**
 * M08 volunteer opportunities (RF18) — tenant-scoped (RLS). Publishing/editing
 * is Owner/Administrator; internal viewing adds ReadOnlyAuditor; everyone else
 * denied (deny-by-default). The public listing is a separate, unauthenticated
 * controller (see `public-volunteering.controller.ts`).
 */
@Controller('volunteer-opportunities')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VolunteerOpportunitiesController {
  constructor(private readonly service: VolunteerOpportunitiesService) {}

  @Post()
  @Roles(...MANAGE_ROLES)
  create(
    @Body(new ZodValidationPipe(createVolunteerOpportunitySchema))
    dto: CreateVolunteerOpportunityInput,
  ): Promise<VolunteerOpportunity> {
    return this.service.create(dto);
  }

  @Get()
  @Roles(...VIEW_ROLES)
  list(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<Paginated<VolunteerOpportunity>> {
    return this.service.list(Number(limit), Number(offset));
  }

  @Get(':id')
  @Roles(...VIEW_ROLES)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<VolunteerOpportunity> {
    return this.service.get(id);
  }

  @Patch(':id')
  @Roles(...MANAGE_ROLES)
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateVolunteerOpportunitySchema))
    dto: UpdateVolunteerOpportunityInput,
  ): Promise<VolunteerOpportunity & { notifiedVolunteers: number }> {
    return this.service.update(id, dto, actor);
  }

  /** Cancela la jornada (no se borra) y avisa a cada persona inscrita. */
  @Post(':id/cancel')
  @HttpCode(200)
  @Roles(...MANAGE_ROLES)
  cancel(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cancelVolunteerOpportunitySchema))
    dto: CancelVolunteerOpportunityInput,
  ): Promise<VolunteerOpportunityChangeResult> {
    return this.service.cancel(id, dto, actor);
  }
}
