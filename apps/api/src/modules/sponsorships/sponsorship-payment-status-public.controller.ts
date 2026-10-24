import { Controller, Get, Param } from '@nestjs/common';
import type { SponsorshipPaymentPublicStatus } from '@adoptafacil/contracts';
import { SponsorshipPaymentsService } from './sponsorship-payments.service';
import { RequireFeature } from '../../core/features';

/**
 * PUBLIC post-checkout status read (gateway redirect-back "gracias"
 * page) — no auth. Mirrors `donation-status-public.controller.ts` exactly:
 * no `sponsorships/` prefix, one route, a single generic 404 on an unknown
 * reference.
 *
 * `:reference` is our own reference from the gateway's redirect, which the
 * frontend forwards verbatim — it IS our own
 * `sponsorship_payment_attempts.collection_id`.
 */
@RequireFeature('sponsorships')
@Controller()
export class SponsorshipPaymentStatusPublicController {
  constructor(private readonly service: SponsorshipPaymentsService) {}

  @Get('public/sponsorships/status/:reference')
  getPublic(@Param('reference') reference: string): Promise<SponsorshipPaymentPublicStatus> {
    return this.service.getPublicStatusByCollectionId(reference);
  }
}
