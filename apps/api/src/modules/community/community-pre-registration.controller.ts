import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type {
  CommunityPreRegistrationInput,
  CommunityPreRegistrationReceipt,
} from '@adoptafacil/contracts';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { RequireFeature } from '../../core/features';
import { communityPreRegistrationSchema } from './community-pre-registration.schemas';
import { CommunityPreRegistrationService } from './community-pre-registration.service';

/**
 * `POST public/community/pre-registrations`: un comercio o profesional deja su
 * interés en aparecer en la Comunidad, sin cuenta. Público, con tope por IP
 * (5 envíos por hora) contra el spam.
 */
@RequireFeature('community')
@Controller('public/community/pre-registrations')
export class CommunityPreRegistrationController {
  constructor(private readonly service: CommunityPreRegistrationService) {}

  @Post()
  @HttpCode(201)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60 * 60_000 } })
  create(
    @Body(new ZodValidationPipe(communityPreRegistrationSchema))
    dto: CommunityPreRegistrationInput,
  ): Promise<CommunityPreRegistrationReceipt> {
    return this.service.create(dto);
  }
}
