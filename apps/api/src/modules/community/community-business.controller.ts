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
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  BusinessBenefitStatus,
  Role,
  type ActivateBusinessAccountInput,
  type AdopterBenefitStatus,
  type AdopterBenefitsPage,
  type BenefitPass,
  type BenefitRedemption,
  type BenefitRedemptionRecord,
  type BusinessAccount,
  type BusinessBenefit,
  type BusinessBenefitPublic,
  type BusinessBenefitQueueItem,
  type BusinessBenefitsQueuePage,
  type BusinessImpact,
  type BusinessOverview,
  type CreateBusinessBenefitInput,
  type ModerateBusinessBenefitInput,
  type RedeemBenefitPassInput,
  type UpdateBusinessBenefitInput,
  type UpdateBusinessConsentInput,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { RequireFeature } from '../../core/features';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { CommunityBusinessService } from './community-business.service';
import {
  activateBusinessSchema,
  businessConsentSchema,
  createBenefitSchema,
  moderateBenefitSchema,
  redeemSchema,
  updateBenefitSchema,
} from './community-business.schemas';

function parseCity(value?: string): string | undefined {
  const city = value?.trim();
  return city ? city.slice(0, 80) : undefined;
}

function parseBenefitStatus(value?: string): BusinessBenefitStatus | undefined {
  return value && (Object.values(BusinessBenefitStatus) as string[]).includes(value)
    ? (value as BusinessBenefitStatus)
    : undefined;
}

/**
 * Panel del negocio aliado (cualquier cuenta autenticada). Sin `@Roles`
 * porque una Persona no tiene roles de organización: el servicio exige
 * Owner/Administrator cuando la cuenta es de organización (deny-by-default).
 */
@RequireFeature('community')
@Controller('community/business')
@UseGuards(JwtAuthGuard)
export class CommunityBusinessController {
  constructor(private readonly service: CommunityBusinessService) {}

  @Get('me')
  overview(@CurrentUser() actor: RequestUser): Promise<BusinessOverview> {
    return this.service.overview(actor);
  }

  @Post('activate')
  activate(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(activateBusinessSchema)) dto: ActivateBusinessAccountInput,
  ): Promise<BusinessAccount> {
    return this.service.activate(actor, dto);
  }

  @Patch('consent')
  consent(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(businessConsentSchema)) dto: UpdateBusinessConsentInput,
  ): Promise<BusinessAccount> {
    return this.service.setConsent(actor, dto);
  }

  @Get('benefits')
  benefits(@CurrentUser() actor: RequestUser): Promise<BusinessBenefit[]> {
    return this.service.listBenefits(actor);
  }

  @Post('benefits')
  createBenefit(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(createBenefitSchema)) dto: CreateBusinessBenefitInput,
  ): Promise<BusinessBenefit> {
    return this.service.createBenefit(actor, dto);
  }

  @Patch('benefits/:id')
  updateBenefit(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateBenefitSchema)) dto: UpdateBusinessBenefitInput,
  ): Promise<BusinessBenefit> {
    return this.service.updateBenefit(actor, id, dto);
  }

  /** Validar el código de quien adoptó. Con tope (contra adivinar códigos). */
  @Post('redeem')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60 * 60_000 } })
  redeem(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(redeemSchema)) dto: RedeemBenefitPassInput,
  ): Promise<BenefitRedemption> {
    return this.service.redeem(actor, dto.code);
  }

  @Get('redemptions')
  redemptions(@CurrentUser() actor: RequestUser): Promise<BenefitRedemptionRecord[]> {
    return this.service.redemptions(actor);
  }
}

/** Quien adoptó: sus beneficios y pases. */
@RequireFeature('community')
@Controller('community/benefits')
@UseGuards(JwtAuthGuard)
export class CommunityAdopterBenefitsController {
  constructor(private readonly service: CommunityBusinessService) {}

  @Get('mine')
  mine(@CurrentUser() actor: RequestUser): Promise<AdopterBenefitStatus> {
    return this.service.adopterStatus(actor);
  }

  @Post(':id/pass')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60 * 60_000 } })
  pass(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BenefitPass> {
    return this.service.issuePass(actor, id);
  }
}

/** Vitrina pública de beneficios e impacto (sin sesión). */
@RequireFeature('community')
@Controller('public/community')
export class PublicCommunityBusinessController {
  constructor(private readonly service: CommunityBusinessService) {}

  @Get('benefits')
  benefits(
    @Query('city') city?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<AdopterBenefitsPage> {
    return this.service.publicBenefits(Number(limit), Number(offset), parseCity(city));
  }

  @Get('services/:id/benefits')
  listingBenefits(@Param('id', ParseUUIDPipe) id: string): Promise<BusinessBenefitPublic[]> {
    return this.service.listingBenefits(id);
  }

  @Get('services/:id/impact')
  listingImpact(@Param('id', ParseUUIDPipe) id: string): Promise<BusinessImpact> {
    return this.service.listingImpact(id, 'public');
  }
}

/** Plataforma: moderación de beneficios e impacto para decidir el sello. */
@RequireFeature('community')
@Controller('platform/community')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PlatformAdmin, Role.PlatformSuperAdmin)
export class CommunityBusinessModerationController {
  constructor(private readonly service: CommunityBusinessService) {}

  @Get('benefits')
  queue(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<BusinessBenefitsQueuePage> {
    return this.service.benefitsQueue(Number(limit), Number(offset), parseBenefitStatus(status));
  }

  @Patch('benefits/:id/moderate')
  moderate(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(moderateBenefitSchema)) dto: ModerateBusinessBenefitInput,
  ): Promise<BusinessBenefitQueueItem> {
    return this.service.moderateBenefit(actor.id, id, dto);
  }

  @Get('services/:id/impact')
  impact(@Param('id', ParseUUIDPipe) id: string): Promise<BusinessImpact> {
    return this.service.listingImpact(id, 'platform');
  }
}
