import { Body, Controller, Get, HttpCode, Inject, Post, Res, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthTokens, MfaEnrollment, MfaStatus } from '@adoptafacil/contracts';
import { AUTH_CONFIG, type AuthConfig } from '../auth.config';
import type { RequestUser } from '../auth.types';
import { CurrentUser } from '../current-user.decorator';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { setRefreshCookie } from '../refresh-cookie.util';
import { ZodValidationPipe } from '../zod-validation.pipe';
import { MfaService } from './mfa.service';

const codeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'A 6-digit code'),
});
const enrollSchema = z.object({ password: z.string().min(1).max(200) });

/**
 * Second factor of platform staff (F19 security).
 *
 *   GET  /auth/mfa/status          → is it required, set up, passed for this session
 *   POST /auth/mfa/enroll          → new secret + QR (password again; staff only)
 *   POST /auth/mfa/enroll/confirm  → first code activates it; returns a verified session
 *   POST /auth/mfa/verify          → code for this session; returns a verified session
 *
 * Tighter per-IP throttle than the rest of the API, plus a per-account lock
 * after 5 wrong codes (MfaService). A verified session is a NEW token pair
 * (the previous one is revoked); the refresh cookie is mirrored like login.
 */
@Controller('auth/mfa')
@UseGuards(ThrottlerGuard, JwtAuthGuard)
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class MfaController {
  constructor(
    private readonly mfa: MfaService,
    @Inject(AUTH_CONFIG) private readonly authConfig: AuthConfig,
  ) {}

  // The staff gate reads this on every page load (twice in dev under React
  // StrictMode): under the 10/min controller budget a platform admin hit 429
  // after ~5 pages and the gate failed open. Read-only on the caller's own
  // session, so it gets the session budget; enroll/verify stay at 5/min.
  @Get('status')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  status(@CurrentUser() user: RequestUser): Promise<MfaStatus> {
    return this.mfa.status(user);
  }

  @Post('enroll')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  enroll(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(enrollSchema)) body: { password: string },
  ): Promise<MfaEnrollment> {
    return this.mfa.startEnrollment(user, body.password);
  }

  @Post('enroll/confirm')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async confirm(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(codeSchema)) body: { code: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokens> {
    return this.mirror(res, await this.mfa.confirmEnrollment(user, body.code));
  }

  @Post('verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async verify(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(codeSchema)) body: { code: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokens> {
    return this.mirror(res, await this.mfa.verify(user, body.code));
  }

  private mirror(res: Response, tokens: AuthTokens): AuthTokens {
    setRefreshCookie(
      res,
      tokens.refreshToken,
      this.authConfig.refreshTtlSeconds,
      process.env.NODE_ENV === 'production',
    );
    return tokens;
  }
}
