import { Module } from '@nestjs/common';
import { AuthModule } from '../../../core/auth/auth.module';
import { InvitationsController, PublicInvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import {
  OrganizationStatusController,
  PlatformOrganizationStatusController,
} from './organization-status.controller';
import { OrganizationStatusService } from './organization-status.service';

/**
 * Ola 1 · hilo 2: organization review status and suspension (R2-1, AF-023)
 * and member invitations (R2-3, AF-017). Kept apart from OrgModule so it
 * composes without touching that module's providers.
 */
@Module({
  imports: [AuthModule],
  controllers: [
    OrganizationStatusController,
    PlatformOrganizationStatusController,
    InvitationsController,
    PublicInvitationsController,
  ],
  providers: [OrganizationStatusService, InvitationsService],
})
export class OrgGovernanceModule {}
