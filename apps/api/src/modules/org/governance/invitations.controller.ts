import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  type AcceptInvitationInput,
  type AuthSession,
  type CreateInvitationInput,
  type InvitationPreview,
  type OrganizationInvitation,
  Role,
} from '@adoptafacil/contracts';
import { AUTH_CONFIG, type AuthConfig } from '../../../core/auth/auth.config';
import type { RequestUser } from '../../../core/auth/auth.types';
import { setRefreshCookie } from '../../../core/auth/refresh-cookie.util';
import { legalContextFrom } from '../../../core/legal';
import { CurrentUser } from '../../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../../core/auth/zod-validation.pipe';
import { Roles } from '../../../core/rbac/roles.decorator';
import { RolesGuard } from '../../../core/rbac/roles.guard';
import {
  acceptInvitationSchema,
  createInvitationSchema,
  previewInvitationSchema,
} from './governance.schemas';
import { InvitationsService } from './invitations.service';

/** Invitations of the caller's organization (R2-3). Owner and Administrator;
 *  inviting or revoking an Owner is reserved to an Owner (service). */
@Controller('org/invitations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Owner, Role.Administrator)
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get()
  list(): Promise<OrganizationInvitation[]> {
    return this.invitations.list();
  }

  @Post()
  create(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(createInvitationSchema)) dto: CreateInvitationInput,
  ): Promise<OrganizationInvitation> {
    return this.invitations.create(actor.id, dto);
  }

  @Delete(':invitationId')
  @HttpCode(204)
  revoke(
    @CurrentUser() actor: RequestUser,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ): Promise<void> {
    return this.invitations.revoke(actor.id, invitationId);
  }
}

/** Public side of an invitation: the invitee has no account yet. The token
 *  travels in the body (never in a URL) and the routes are throttled per IP. */
@Controller('auth/invitations')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class PublicInvitationsController {
  constructor(
    private readonly invitations: InvitationsService,
    @Inject(AUTH_CONFIG) private readonly authConfig: AuthConfig,
  ) {}

  @Post('preview')
  @HttpCode(200)
  preview(
    @Body(new ZodValidationPipe(previewInvitationSchema)) dto: { token: string },
  ): Promise<InvitationPreview> {
    return this.invitations.preview(dto.token);
  }

  @Post('accept')
  async accept(
    @Body(new ZodValidationPipe(acceptInvitationSchema)) dto: AcceptInvitationInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSession> {
    const session = await this.invitations.accept(dto, legalContextFrom(req));
    // Igual que el registro y el login: sin la cookie de refresco, recargar la
    // página justo después de crear la cuenta obligaba a iniciar sesión otra vez.
    setRefreshCookie(
      res,
      session.tokens.refreshToken,
      this.authConfig.refreshTtlSeconds,
      process.env.NODE_ENV === 'production',
    );
    return session;
  }
}
