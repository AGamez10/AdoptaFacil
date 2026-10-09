import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ORG_ROLES,
  type AnimalSummaryPage,
  type CampaignPublic,
  type OrganizationPublic,
  type Paginated,
} from '@adoptafacil/contracts';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import {
  publicAnimalsQuerySchema,
  type PublicAnimalsQuery,
} from '../animals/public-animals.schemas';
import { portalPreviewPageSchema, type PortalPreviewPage } from './portals.schemas';
import { PortalPreviewService } from './portal-preview.service';

/**
 * Preview of the caller's OWN public portal, available before the platform
 * approves the organization. Same public-only shapes as the
 * `public/organizations/:slug/*` endpoints; tenant comes from the JWT, so a
 * member can only ever preview their own organization.
 */
@Controller('org/portal/preview')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ORG_ROLES)
export class PortalPreviewController {
  constructor(private readonly preview: PortalPreviewService) {}

  @Get()
  organization(): Promise<OrganizationPublic> {
    return this.preview.getOrganization();
  }

  @Get('animals')
  animals(
    @Query(new ZodValidationPipe(publicAnimalsQuerySchema)) query: PublicAnimalsQuery,
  ): Promise<AnimalSummaryPage> {
    return this.preview.listAnimals(query);
  }

  @Get('campaigns')
  campaigns(
    @Query(new ZodValidationPipe(portalPreviewPageSchema)) query: PortalPreviewPage,
  ): Promise<Paginated<CampaignPublic>> {
    return this.preview.listCampaigns(query.limit, query.offset);
  }
}
