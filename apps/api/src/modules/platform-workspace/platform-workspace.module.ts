import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { SensitiveActionsService } from './sensitive-actions.service';
import { WorkspaceTeamService } from './workspace-team.service';
import { WorkspaceTicketsService } from './workspace-tickets.service';
import { WorkspaceController } from './workspace.controller';

/** F19 · platform team workspace: tasks, four-eyes approvals, staff, activity. */
@Module({
  imports: [AuthModule],
  controllers: [WorkspaceController],
  providers: [WorkspaceTicketsService, SensitiveActionsService, WorkspaceTeamService],
})
export class PlatformWorkspaceModule {}
