import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { z } from 'zod';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { type PrivacyDataExport, PrivacyService, type SuppressionResult } from './privacy.service';

const suppressionSchema = z.object({ confirmation: z.string().max(100) }).strict();

/**
 * Derechos del titular sobre SUS datos (Ley 1581): cualquier cuenta
 * autenticada, sin `@Roles` porque no concede poder sobre ninguna
 * organización; el titular sale del token.
 */
@Controller('me/privacy')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get('data')
  @Throttle({ default: { limit: 10, ttl: 60 * 60_000 } })
  data(@CurrentUser() actor: RequestUser): Promise<PrivacyDataExport> {
    return this.privacy.exportMine(actor);
  }

  @Post('suppression')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60 * 60_000 } })
  suppress(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(suppressionSchema)) dto: { confirmation: string },
  ): Promise<SuppressionResult> {
    return this.privacy.suppressMine(actor, dto.confirmation);
  }
}
