import { Controller, Delete, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import {
  Role,
  type MercadoPagoConnectStatusView,
  type MercadoPagoConnectUrlView,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { RequireFeature } from '../../core/features';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { MercadoPagoConnectionsService } from './mercadopago-connections.service';

/** Same audience as the other payment-account settings (Owner/Administrator);
 *  deny-by-default for everyone else. */
export const MERCADOPAGO_MANAGE_ROLES = [Role.Owner, Role.Administrator] as const;

/**
 * ADR-PAG-003 — "Conectar Mercado Pago" (OAuth). `connect`, `status` and
 * `DELETE connect` are authenticated (Owner/Administrator, tenant from the
 * JWT). `callback` is PUBLIC on purpose: it is Mercado Pago's own browser
 * redirect, which carries no Authorization header; it trusts only the sealed
 * `state` minted by `connect` (see `mercadopago-oauth-state.ts`).
 */
@RequireFeature('payments')
@Controller('org/mercadopago')
export class MercadoPagoConnectController {
  constructor(private readonly service: MercadoPagoConnectionsService) {}

  @Get('connect')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...MERCADOPAGO_MANAGE_ROLES)
  getConnectUrl(@CurrentUser() actor: RequestUser): MercadoPagoConnectUrlView {
    return this.service.getConnectUrl(actor.id);
  }

  @Get('status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...MERCADOPAGO_MANAGE_ROLES)
  getStatus(): Promise<MercadoPagoConnectStatusView> {
    return this.service.getStatus();
  }

  @Delete('connect')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...MERCADOPAGO_MANAGE_ROLES)
  async disconnect(@CurrentUser() actor: RequestUser): Promise<{ ok: true }> {
    await this.service.disconnect(actor.id);
    return { ok: true };
  }

  /** PUBLIC — Mercado Pago's redirect. Only a coarse result in the URL. */
  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.service.handleCallback({
      code: typeof code === 'string' ? code : undefined,
      state: typeof state === 'string' ? state : undefined,
      error: typeof error === 'string' ? error : undefined,
    });
    res.redirect(302, this.service.resultRedirectUrl(result));
  }
}
