import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  type CreatePublicReviewInput,
  type OrganizationReputationSummary,
  type Paginated,
  type PublicReview,
  type Review,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { OptionalJwtAuthGuard } from '../../core/auth/optional-jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { PublicReputationService } from './public-reputation.service';
import { createPublicReviewSchema } from './reviews.schemas';
import { RequireFeature } from '../../core/features';

/**
 * Public reputation indicators (RF23 · M12) — NO auth, mirrors
 * `PublicOrgCampaignsController`/M08's `public-volunteering.controller.ts`
 * (empty controller prefix, explicit `public/...` path per route).
 */
@RequireFeature('reputation')
@Controller()
export class PublicReputationController {
  constructor(private readonly service: PublicReputationService) {}

  @Get('public/organizations/:slug/reputation-summary')
  async summary(@Param('slug') slug: string): Promise<OrganizationReputationSummary> {
    const summary = await this.service.getSummaryByOrgSlug(slug);
    if (!summary) {
      throw new NotFoundException('Organization not found');
    }
    return summary;
  }

  @Get('public/organizations/:slug/reviews')
  async reviews(
    @Param('slug') slug: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<Paginated<PublicReview>> {
    const page = await this.service.listApprovedByOrgSlug(slug, Number(limit), Number(offset));
    if (!page) {
      throw new NotFoundException('Organization not found');
    }
    return page;
  }

  /**
   * Botón "Registrar reseña" del portal público (S7-b) — queda visible de
   * inmediato. Deliberadamente distinto de `POST /reviews` (RF23 original:
   * exige sesión + interacción real, pasa por PlatformAdmin).
   *
   * Sesión opcional (2026-11-05, `OptionalJwtAuthGuard`, mismo patrón que
   * `POST /donations`): con token válido la reseña se liga a la cuenta y
   * lleva el sello "Miembro de la comunidad"; sin token (o con uno vencido)
   * es de visitante. Al ser público y sin cuenta, se limita por IP.
   */
  @Post('public/organizations/:slug/reviews')
  @HttpCode(201)
  @UseGuards(OptionalJwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 10 * 60_000 } })
  createReview(
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(createPublicReviewSchema)) dto: CreatePublicReviewInput,
    @CurrentUser() actor: RequestUser | undefined,
  ): Promise<Review> {
    return this.service.createPublicReview(slug, dto, actor);
  }
}
