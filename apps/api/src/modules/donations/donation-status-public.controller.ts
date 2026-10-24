import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import type {
  DonationOrganizationAvailability,
  DonationPublicStatus,
} from '@adoptafacil/contracts';
import { DonationsService } from './donations.service';
import { RequireFeature } from '../../core/features';

/**
 * PUBLIC post-checkout status read (gateway redirect-back "gracias"
 * page) — no auth. Same minimal-controller convention as
 * {@link DonationCertificatePublicController}/{@link DonationAccessPublicController}:
 * no `donations/` prefix, one route, a single generic 404 on an unknown
 * reference (never distinguishable from "not yet settled").
 *
 * `:reference` is our own reference, which the frontend forwards verbatim
 * from the gateway's redirect — it IS `donations.collection_id`.
 */
@RequireFeature('payments')
@Controller()
export class DonationStatusPublicController {
  constructor(private readonly service: DonationsService) {}

  @Get('public/donations/status/:reference')
  getPublic(@Param('reference') reference: string): Promise<DonationPublicStatus> {
    return this.service.getPublicStatusByCollectionId(reference);
  }

  /** Whether the org has a connected ePayco account (boolean only). */
  @Get('public/donations/organizations/:organizationId/availability')
  getOrganizationAvailability(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ): Promise<DonationOrganizationAvailability> {
    return this.service.getOrganizationAvailability(organizationId);
  }
}
