import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import type {
  GrantThirdPartyConsentInput,
  RevokeThirdPartyConsentInput,
  ThirdPartyConsentStatus,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { ConsentsService } from './consents.service';
import { grantConsentSchema, revokeConsentSchema } from './consents.schemas';

/**
 * "Uso de mis datos en reportes": cualquier persona autenticada gestiona SOLO
 * sus propios consentimientos (el sujeto sale del JWT). Sin `@Roles`: no
 * concede ningún poder sobre ninguna organización.
 */
@Controller('me/consents')
@UseGuards(JwtAuthGuard)
export class ConsentsController {
  constructor(private readonly service: ConsentsService) {}

  @Get()
  mine(@CurrentUser() actor: RequestUser): Promise<ThirdPartyConsentStatus> {
    return this.service.mine(actor);
  }

  @Post()
  grant(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(grantConsentSchema)) dto: GrantThirdPartyConsentInput,
  ): Promise<ThirdPartyConsentStatus> {
    return this.service.grant(actor, dto);
  }

  @Post('revoke')
  @HttpCode(200)
  revoke(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(revokeConsentSchema)) dto: RevokeThirdPartyConsentInput,
  ): Promise<ThirdPartyConsentStatus> {
    return this.service.revoke(actor, dto);
  }
}
