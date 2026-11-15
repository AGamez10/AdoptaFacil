import { Controller, Delete, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
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
import { MERCADOPAGO_CONNECT_STATE_TTL_SECONDS } from './mercadopago-connect.constants';
import { MercadoPagoConnectionsService } from './mercadopago-connections.service';
import { MERCADOPAGO_OAUTH_BINDING_COOKIE } from './mercadopago-oauth-state';

/** Same cross-site rules as the refresh cookie: in production web and API are
 *  different sites, so SameSite=None (which browsers only honor with Secure). */
function bindingCookieOptions(maxAgeMs: number): CookieOptions {
  const production = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: production,
    sameSite: production ? 'none' : 'lax',
    path: '/',
    maxAge: maxAgeMs,
  };
}

/** Reads one cookie without app-wide cookie parsing. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

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
  async getConnectUrl(
    @CurrentUser() actor: RequestUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MercadoPagoConnectUrlView> {
    const { view, bindingSecret } = await this.service.getConnectUrl(actor.id);
    res.cookie(
      MERCADOPAGO_OAUTH_BINDING_COOKIE,
      bindingSecret,
      bindingCookieOptions(MERCADOPAGO_CONNECT_STATE_TTL_SECONDS * 1000),
    );
    return view;
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
    @Query('error_description') errorDescription: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.service.handleCallback({
      code: typeof code === 'string' ? code : undefined,
      state: typeof state === 'string' ? state : undefined,
      error: typeof error === 'string' ? error : undefined,
      errorDescription: typeof errorDescription === 'string' ? errorDescription : undefined,
      binding: readCookie(req.headers.cookie, MERCADOPAGO_OAUTH_BINDING_COOKIE),
    });
    res.clearCookie(MERCADOPAGO_OAUTH_BINDING_COOKIE, bindingCookieOptions(0));
    res.redirect(302, this.service.resultRedirectUrl(result));
  }
}
