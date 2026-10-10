import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  Role,
  type SensitiveActionRequest,
  type WorkspaceActivityItem,
  type WorkspaceMe,
  type WorkspaceTeamMember,
  type WorkspaceTicket,
  type WorkspaceTicketDetail,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { RbacService } from '../../core/rbac/rbac.service';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { SensitiveActionsService } from './sensitive-actions.service';
import { type ActivityQuery, WorkspaceTeamService } from './workspace-team.service';
import { WorkspaceTicketsService } from './workspace-tickets.service';
import {
  activityQuerySchema,
  approveSchema,
  createSensitiveActionSchema,
  rejectSchema,
  ticketNoteSchema,
  ticketStatusSchema,
  ticketVersionSchema,
} from './workspace.schemas';

/**
 * Platform team workspace (F19). Only platform staff (deny-by-default), and
 * because only platform roles grant it, RolesGuard also demands a fresh second
 * factor on every request. Every route works on the caller's TEAM (the
 * organization where they hold their platform roles) under RLS.
 *
 *   GET  /platform/workspace/me                         → who am I, MFA, session policy
 *   GET  /platform/workspace/team                       → the team's staff
 *   GET  /platform/workspace/activity                   → the team's audit trail
 *   GET  /platform/workspace/tickets                    → tasks (synced with the review queue)
 *   GET  /platform/workspace/tickets/:id                → task + history
 *   POST /platform/workspace/tickets/:id/take|release|status|notes
 *   GET  /platform/workspace/approvals                  → four-eyes requests
 *   POST /platform/workspace/approvals                  → ask for a sensitive action
 *   POST /platform/workspace/approvals/:id/approve      → another lead + fresh TOTP code
 *   POST /platform/workspace/approvals/:id/reject|cancel
 *   GET  /platform/workspace/approvals/:id/export.csv   → approved audit export (requester, 24 h)
 */
@Controller('platform/workspace')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PlatformAdmin, Role.PlatformSuperAdmin)
export class WorkspaceController {
  constructor(
    private readonly team: WorkspaceTeamService,
    private readonly tickets: WorkspaceTicketsService,
    private readonly approvals: SensitiveActionsService,
    private readonly rbac: RbacService,
  ) {}

  @Get('me')
  async me(@CurrentUser() user: RequestUser): Promise<WorkspaceMe> {
    return this.team.me(user, await this.rbac.rolesForUser(user.id));
  }

  @Get('team')
  members(): Promise<WorkspaceTeamMember[]> {
    return this.team.team();
  }

  @Get('activity')
  activity(
    @Query(new ZodValidationPipe(activityQuerySchema)) query: ActivityQuery,
  ): Promise<WorkspaceActivityItem[]> {
    return this.team.activity(query);
  }

  @Get('tickets')
  async listTickets(@CurrentUser() user: RequestUser): Promise<WorkspaceTicket[]> {
    return this.tickets.list(await this.actor(user));
  }

  @Get('tickets/:id')
  ticket(@Param('id', ParseUUIDPipe) id: string): Promise<WorkspaceTicketDetail> {
    return this.tickets.detail(id);
  }

  @Post('tickets/:id/take')
  async take(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ticketVersionSchema)) body: { expectedVersion: number },
  ): Promise<WorkspaceTicket> {
    return this.tickets.take(await this.actor(user), id, body.expectedVersion);
  }

  @Post('tickets/:id/release')
  async release(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ticketVersionSchema)) body: { expectedVersion: number },
  ): Promise<WorkspaceTicket> {
    return this.tickets.release(await this.actor(user), id, body.expectedVersion);
  }

  @Post('tickets/:id/status')
  async status(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ticketStatusSchema))
    body: { expectedVersion: number; status: WorkspaceTicket['status']; note?: string },
  ): Promise<WorkspaceTicket> {
    return this.tickets.changeStatus(await this.actor(user), id, body);
  }

  @Post('tickets/:id/notes')
  async note(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ticketNoteSchema)) body: { note: string },
  ): Promise<WorkspaceTicket> {
    return this.tickets.addNote(await this.actor(user), id, body.note);
  }

  @Get('approvals')
  listApprovals(): Promise<SensitiveActionRequest[]> {
    return this.approvals.list();
  }

  @Post('approvals')
  async requestApproval(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createSensitiveActionSchema))
    body: {
      type: SensitiveActionRequest['type'];
      payload: Record<string, unknown>;
      reason: string;
    },
  ): Promise<SensitiveActionRequest> {
    return this.approvals.request(await this.actor(user), {
      type: body.type,
      payload: body.payload as never,
      reason: body.reason,
    });
  }

  @Post('approvals/:id/approve')
  async approve(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(approveSchema)) body: { code: string; note?: string },
  ): Promise<SensitiveActionRequest> {
    return this.approvals.approve(await this.actor(user), id, body.code, body.note);
  }

  @Post('approvals/:id/reject')
  async reject(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(rejectSchema)) body: { note: string },
  ): Promise<SensitiveActionRequest> {
    return this.approvals.reject(await this.actor(user), id, body.note);
  }

  @Post('approvals/:id/cancel')
  async cancel(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SensitiveActionRequest> {
    return this.approvals.cancel(await this.actor(user), id);
  }

  @Get('approvals/:id/export.csv')
  async exportCsv(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const { filename, csv } = await this.approvals.exportCsv(await this.actor(user), id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    // UTF-8 BOM so spreadsheet apps read accents (á, ñ) correctly.
    return `\uFEFF${csv}`;
  }

  private async actor(user: RequestUser): Promise<{ user: RequestUser; roles: Role[] }> {
    return { user, roles: await this.rbac.rolesForUser(user.id) };
  }
}
