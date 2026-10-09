import { Controller, Delete, Get, HttpCode, Param, Put, UseGuards } from '@nestjs/common';
import { Role, type DocumentReviewClaim } from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { RbacService } from '../../core/rbac/rbac.service';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { ReviewClaimsService, type ReviewClaimActor } from './review-claims.service';

/**
 * Reservas del workspace de revisión (Ola 3, R3-6). Mismo control que la cola:
 * solo roles de plataforma (deny-by-default).
 *
 *   GET    /platform/review-claims                   → reservas vigentes
 *   PUT    /platform/review-claims/:organizationId   → tomar o renovar (409 si es de otro)
 *   DELETE /platform/review-claims/:organizationId   → liberar (la propia; SuperAdmin cualquiera)
 */
@Controller('platform/review-claims')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PlatformAdmin, Role.PlatformSuperAdmin)
export class ReviewClaimsController {
  constructor(
    private readonly claims: ReviewClaimsService,
    private readonly rbac: RbacService,
  ) {}

  @Get()
  list(): Promise<DocumentReviewClaim[]> {
    return this.claims.list();
  }

  @Put(':organizationId')
  async claim(
    @CurrentUser() user: RequestUser,
    @Param('organizationId') organizationId: string,
  ): Promise<DocumentReviewClaim> {
    return this.claims.claim(await this.actor(user), organizationId);
  }

  @Delete(':organizationId')
  @HttpCode(204)
  async release(
    @CurrentUser() user: RequestUser,
    @Param('organizationId') organizationId: string,
  ): Promise<void> {
    await this.claims.release(await this.actor(user), organizationId);
  }

  private async actor(user: RequestUser): Promise<ReviewClaimActor> {
    const roles = await this.rbac.rolesForUser(user.id);
    return {
      id: user.id,
      email: user.email,
      canOverride: roles.includes(Role.PlatformSuperAdmin),
    };
  }
}
