import { Body, Controller, Get, NotFoundException, Param, Put, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  type OrganizationQr,
  type PublicQrResolution,
  Role,
  type UpdateOrganizationQrTargetInput,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { OrgQrService } from './org-qr.service';
import { updateOrgQrTargetSchema } from './org-qr.schemas';

/**
 * QR fijo de la organización (panel). Leerlo: Owner, Administrator u Operator.
 * Cambiar su destino: Owner o Administrator, los mismos roles que editan el
 * perfil y el portal. Deny-by-default vía RolesGuard.
 */
@Controller('org/qr')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrgQrController {
  constructor(private readonly qr: OrgQrService) {}

  @Get()
  @Roles(Role.Owner, Role.Administrator, Role.Operator)
  getOwn(): Promise<OrganizationQr> {
    return this.qr.getOwn();
  }

  @Put('target')
  @Roles(Role.Owner, Role.Administrator)
  updateTarget(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(updateOrgQrTargetSchema)) dto: UpdateOrganizationQrTargetInput,
  ): Promise<OrganizationQr> {
    return this.qr.updateTarget(actor.id, dto);
  }
}

/**
 * Escaneo PÚBLICO del QR (sin sesión). Devuelve solo el slug de la org y el
 * destino ya validado (tipo + id): nunca una URL, así que no hay redirección
 * abierta. Con límite propio por IP porque el throttler no es global.
 */
@Controller('public/qr')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class PublicOrgQrController {
  constructor(private readonly qr: OrgQrService) {}

  @Get(':code')
  async resolve(@Param('code') code: string): Promise<PublicQrResolution> {
    const resolved = await this.qr.resolve(code);
    if (!resolved) {
      throw new NotFoundException('QR not found');
    }
    return resolved;
  }
}
