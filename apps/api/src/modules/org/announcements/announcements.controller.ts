import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  Role,
  type OrgAnnouncementAudience,
  type SendOrgAnnouncementInput,
  type SendOrgAnnouncementResult,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../../core/auth/auth.types';
import { CurrentUser } from '../../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../../core/auth/zod-validation.pipe';
import { Roles } from '../../../core/rbac/roles.decorator';
import { RolesGuard } from '../../../core/rbac/roles.guard';
import { sendOrgAnnouncementSchema } from './announcements.schemas';
import { AnnouncementsService } from './announcements.service';

/** Urgent announcements of the caller's organization to its own contacts.
 *  Owner and Administrator only (deny-by-default). */
@Controller('org/announcements')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Owner, Role.Administrator)
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get('audience')
  audience(@CurrentUser() actor: RequestUser): Promise<OrgAnnouncementAudience> {
    return this.announcements.audience(actor.organizationId);
  }

  @Post()
  send(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(sendOrgAnnouncementSchema)) dto: SendOrgAnnouncementInput,
  ): Promise<SendOrgAnnouncementResult> {
    return this.announcements.send(actor.organizationId, actor.id, dto);
  }
}
