import { Body, Controller, Delete, Get, Put, UseGuards } from '@nestjs/common';
import {
  Role,
  type ConnectEpaycoAccountInput,
  type EpaycoConnectStatusView,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { RequireFeature } from '../../core/features';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { connectEpaycoAccountSchema } from './epayco-connect.schemas';
import { EpaycoConnectService } from './epayco-connect.service';

/** Same audience as the other payment-account settings (Owner/Administrator);
 *  deny-by-default for everyone else. */
export const EPAYCO_MANAGE_ROLES = [Role.Owner, Role.Administrator] as const;

/**
 * ADR-PAG-002 — "Conectar ePayco": the organization hands over its OWN ePayco
 * API keys once (HTTPS); the API encrypts the secrets at rest and never
 * returns them. Tenant-scoped (RLS) through the caller's own organization.
 */
@RequireFeature('payments')
@Controller('org/epayco')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...EPAYCO_MANAGE_ROLES)
export class EpaycoConnectController {
  constructor(private readonly service: EpaycoConnectService) {}

  @Put('connect')
  connect(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(connectEpaycoAccountSchema)) dto: ConnectEpaycoAccountInput,
  ): Promise<EpaycoConnectStatusView> {
    return this.service.connect(actor.id, dto);
  }

  @Get('status')
  getStatus(): Promise<EpaycoConnectStatusView> {
    return this.service.getStatus();
  }

  @Delete('connect')
  async disconnect(@CurrentUser() actor: RequestUser): Promise<{ ok: true }> {
    await this.service.disconnect(actor.id);
    return { ok: true };
  }
}
