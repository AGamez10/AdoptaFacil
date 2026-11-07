import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { Redis } from 'ioredis';
import {
  Role,
  type MercadoPagoCollectorCredentials,
  type MercadoPagoConnectionStatus,
  type MercadoPagoConnectResult,
  type MercadoPagoConnectStatusView,
  type MercadoPagoConnectUrlView,
} from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import { AuditService } from '../../core/audit/audit.service';
import {
  createPkcePair,
  MercadoPagoOAuthClient,
  MercadoPagoOAuthError,
  type MercadoPagoTokenGrant,
} from '../../core/payments/mercadopago-oauth.client';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.service';
import {
  MERCADOPAGO_CONNECT_STATE_TTL_SECONDS,
  MERCADOPAGO_CONNECTION_ENTITY,
} from './mercadopago-connect.constants';
import {
  createOAuthBinding,
  oauthBindingMatches,
  openOAuthState,
  sealOAuthState,
} from './mercadopago-oauth-state';
import {
  decryptMercadoPagoSecret,
  encryptMercadoPagoSecret,
  MERCADOPAGO_TOKENS_ENCRYPTION_KEY,
} from './mercadopago-token-crypto';

/** A token this close to expiry is renewed before charging with it. */
const INLINE_REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** Roles that may (still) connect the org's account when the callback lands. */
const CONNECT_ROLES: string[] = [Role.Owner, Role.Administrator];

/** Redis key that burns an OAuth `state` nonce on first use. */
const stateNonceKey = (nonce: string) => `mercadopago:oauth:state:${nonce}`;

type ConnectionRow = Prisma.OrganizationMercadoPagoConnectionGetPayload<Record<string, never>>;

/** Is a token due for renewal (expires within `windowDays` of `now`)? Pure. */
export function isDueForRefresh(expiresAt: Date, now: Date, windowDays: number): boolean {
  return expiresAt.getTime() - now.getTime() <= windowDays * 24 * 60 * 60 * 1000;
}

/**
 * ADR-PAG-003 — the organization's OWN Mercado Pago account, connected by
 * OAuth. Owns `organization_mercadopago_connections` (RLS):
 *   - connect URL (sealed `state` with org + actor + PKCE verifier),
 *   - public callback (code → tokens, encrypted at rest, audited without
 *     tokens; one Mercado Pago account never backs two organizations),
 *   - status/disconnect for Owner/Administrator,
 *   - the collector the donation charge and the webhook read-back use
 *     (renewed inline when about to expire),
 *   - the daily renewal scan; a grant Mercado Pago no longer honors marks the
 *     connection `needs_reconnect`, which blocks donations until reconnected.
 *
 * Tokens are never returned, logged or audited.
 */
@Injectable()
export class MercadoPagoConnectionsService {
  private readonly logger = new Logger('MercadoPagoConnections');
  private readonly webBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    private readonly oauth: MercadoPagoOAuthClient,
    private readonly config: ConfigService<Env, true>,
    @Inject(MERCADOPAGO_TOKENS_ENCRYPTION_KEY) private readonly key: Buffer,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.webBaseUrl = (config.get('WEB_BASE_URL', { infer: true }) as string).replace(/\/+$/, '');
  }

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  /**
   * `GET /org/mercadopago/connect` (Owner/Administrator). Also returns the
   * browser-binding secret the controller sets as an HttpOnly cookie: the
   * authorize URL only works in the browser that asked for it.
   */
  async getConnectUrl(
    actorUserId: string,
  ): Promise<{ view: MercadoPagoConnectUrlView; bindingSecret: string }> {
    const organizationId = this.requireOrgId();
    // A suspended or rejected organization cannot connect a collecting account
    // (it could not receive donations anyway). One still under review can
    // prepare it: donations stay blocked until the platform approves it.
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { status: true },
    });
    if (!org || org.status === 'suspended' || org.status === 'rejected') {
      throw new ForbiddenException(
        'Tu organización no puede conectar una cuenta de cobro en este momento.',
      );
    }
    if (!this.oauth.isConfigured()) {
      throw new ServiceUnavailableException(
        'La conexión con Mercado Pago todavía no está disponible.',
      );
    }
    const pkce = this.oauth.usesPkce() ? createPkcePair() : undefined;
    const binding = createOAuthBinding();
    const state = sealOAuthState(
      {
        organizationId,
        actorUserId,
        bindingHash: binding.hash,
        ...(pkce ? { codeVerifier: pkce.verifier } : {}),
      },
      this.key,
      MERCADOPAGO_CONNECT_STATE_TTL_SECONDS,
    );
    return {
      view: { authorizeUrl: this.oauth.buildAuthorizeUrl(state, pkce?.challenge) },
      bindingSecret: binding.secret,
    };
  }

  /** Where the callback sends the browser back (the "Medios de pago" tab). */
  resultRedirectUrl(result: MercadoPagoConnectResult): string {
    return `${this.webBaseUrl}/organizacion?tab=pagos&mercadopago=${result}`;
  }

  /**
   * `GET /org/mercadopago/callback` (PUBLIC). Never throws: answers a coarse
   * result for the redirect; the real reason goes to server logs only.
   */
  async handleCallback(params: {
    code?: string;
    state?: string;
    error?: string;
    /** The HttpOnly binding cookie sent by the browser. */
    binding?: string;
  }): Promise<MercadoPagoConnectResult> {
    const claims = params.state ? openOAuthState(params.state, this.key) : null;
    if (!claims) {
      this.logger.warn('Mercado Pago callback with an invalid or expired state');
      return 'expired';
    }
    // A leaked authorize URL (shared screen, history, forwarded link) is
    // useless in another browser: the binding cookie must match.
    if (!oauthBindingMatches(claims, params.binding)) {
      this.logger.warn(
        `Mercado Pago callback for org ${claims.organizationId} from another browser`,
      );
      return 'expired';
    }
    // One use per state: a replayed callback never connects twice.
    const fresh = await this.redis.set(
      stateNonceKey(claims.nonce),
      '1',
      'EX',
      MERCADOPAGO_CONNECT_STATE_TTL_SECONDS,
      'NX',
    );
    if (fresh !== 'OK') {
      this.logger.warn(`Mercado Pago callback replayed for org ${claims.organizationId}`);
      return 'expired';
    }
    if (params.error || !params.code) {
      // The org cancelled on Mercado Pago's consent screen.
      return 'denied';
    }
    if (!/^[A-Za-z0-9_-]{1,512}$/.test(params.code)) {
      return 'error';
    }
    // The actor must STILL be Owner/Administrator of that org when the
    // grant lands (a role removed during the 10-minute window counts).
    if (!(await this.actorMayConnect(claims.organizationId, claims.actorUserId))) {
      this.logger.warn(
        `Mercado Pago callback for org ${claims.organizationId}: actor no longer Owner/Administrator`,
      );
      return 'error';
    }

    let grant: MercadoPagoTokenGrant;
    try {
      grant = await this.oauth.exchangeCode(params.code, claims.codeVerifier);
    } catch (error) {
      this.logger.warn(
        `Mercado Pago OAuth exchange failed for org ${claims.organizationId}: ${(error as Error).message}`,
      );
      return 'error';
    }

    const { organizationId, actorUserId } = claims;
    if (grant.liveMode !== this.oauth.expectedLiveMode()) {
      // A sandbox test user in production (or a real account in sandbox)
      // would turn test payments into "real" donations and certificates.
      this.logger.warn(
        `Mercado Pago grant for org ${organizationId} refused: live_mode=${grant.liveMode} does not match MERCADOPAGO_TEST`,
      );
      return 'error';
    }
    const data = {
      mpUserId: grant.userId,
      accessTokenEnc: encryptMercadoPagoSecret(grant.accessToken, this.key),
      refreshTokenEnc: grant.refreshToken
        ? encryptMercadoPagoSecret(grant.refreshToken, this.key)
        : null,
      publicKey: grant.publicKey,
      liveMode: grant.liveMode,
      scope: grant.scope,
      status: 'active' satisfies MercadoPagoConnectionStatus,
      expiresAt: new Date(Date.now() + grant.expiresIn * 1000),
      lastRefreshedAt: null,
      lastError: null,
      connectedByUserId: actorUserId,
    };
    try {
      await this.prisma.withOrgContext(organizationId, async (tx) => {
        await tx.organizationMercadoPagoConnection.upsert({
          where: { organizationId },
          create: { organizationId, ...data },
          update: { ...data, connectedAt: new Date() },
        });
        await this.audit.recordWithTx(tx, {
          organizationId,
          actorUserId,
          action: 'payment_gateway.mercadopago_connected',
          entityType: MERCADOPAGO_CONNECTION_ENTITY,
          entityId: organizationId,
          // NEVER a token: only the collector id and the mode.
          metadata: { mpUserId: grant.userId, liveMode: grant.liveMode },
        });
      });
    } catch (error) {
      if (this.isUniqueConflict(error, 'mp_user_id')) {
        // Generic on purpose: never confirm which organization holds it.
        this.logger.warn(
          `Mercado Pago account already linked to another org (org ${organizationId})`,
        );
        return 'already_linked';
      }
      this.logger.error(
        `Could not store the Mercado Pago connection for org ${organizationId}: ${(error as Error).message}`,
      );
      return 'error';
    }
    return 'connected';
  }

  private async actorMayConnect(organizationId: string, userId: string): Promise<boolean> {
    const role = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.userRole.findFirst({
        where: { organizationId, userId, role: { in: CONNECT_ROLES } },
        select: { id: true },
      }),
    );
    return role !== null;
  }

  /** `GET /org/mercadopago/status` — never a token. */
  async getStatus(): Promise<MercadoPagoConnectStatusView> {
    const organizationId = this.requireOrgId();
    const row = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.organizationMercadoPagoConnection.findUnique({
        where: { organizationId },
        select: {
          mpUserId: true,
          status: true,
          liveMode: true,
          connectedAt: true,
          expiresAt: true,
        },
      }),
    );
    if (!row) return { connected: false };
    return {
      connected: row.status === 'active',
      status: row.status as MercadoPagoConnectionStatus,
      mpUserId: row.mpUserId,
      liveMode: row.liveMode,
      connectedAt: row.connectedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  /**
   * `DELETE /org/mercadopago/connect` — deletes the stored tokens (the grant
   * stops being usable by AdoptaFácil at once). Mercado Pago publishes no
   * revocation endpoint: the org can also remove the app from its own
   * account ("Seguridad" → "Aplicaciones conectadas"). Idempotent.
   */
  async disconnect(actorUserId: string): Promise<void> {
    const organizationId = this.requireOrgId();
    await this.prisma.withOrgContext(organizationId, async (tx) => {
      const existing = await tx.organizationMercadoPagoConnection.findUnique({
        where: { organizationId },
        select: { mpUserId: true },
      });
      if (!existing) return;
      await tx.organizationMercadoPagoConnection.deleteMany({ where: { organizationId } });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'payment_gateway.mercadopago_disconnected',
        entityType: MERCADOPAGO_CONNECTION_ENTITY,
        entityId: organizationId,
        metadata: { mpUserId: existing.mpUserId },
      });
    });
  }

  /** PUBLIC-safe boolean: can this org receive donations right now? */
  async hasActiveConnection(organizationId: string): Promise<boolean> {
    const row = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.organizationMercadoPagoConnection.findUnique({
        where: { organizationId },
        select: { status: true },
      }),
    );
    return row?.status === 'active';
  }

  /**
   * The org's grant, decrypted under ITS RLS context, renewed first when it
   * is about to expire. Server-only: passed to the PaymentPort, never
   * returned, logged or audited. `undefined` = cannot collect right now.
   */
  async resolveCollector(
    organizationId: string,
  ): Promise<MercadoPagoCollectorCredentials | undefined> {
    let row = await this.findRow(organizationId);
    if (!row || row.status !== 'active') return undefined;
    // A row stored under the other mode (e.g. before MERCADOPAGO_TEST was
    // flipped) never collects: the org must reconnect in this mode.
    if (row.liveMode !== this.oauth.expectedLiveMode()) return undefined;
    if (row.expiresAt.getTime() - Date.now() <= INLINE_REFRESH_MARGIN_MS) {
      if (!row.refreshTokenEnc) return undefined;
      await this.refreshOne(organizationId).catch(() => undefined);
      row = await this.findRow(organizationId);
      if (!row || row.status !== 'active' || row.expiresAt.getTime() <= Date.now()) {
        return undefined;
      }
    }
    try {
      return {
        organizationId,
        userId: row.mpUserId,
        accessToken: decryptMercadoPagoSecret(row.accessTokenEnc, this.key),
      };
    } catch {
      this.logger.error(`Mercado Pago token of org ${organizationId} could not be decrypted`);
      return undefined;
    }
  }

  private findRow(organizationId: string): Promise<ConnectionRow | null> {
    return this.prisma.withOrgContext(organizationId, (tx) =>
      tx.organizationMercadoPagoConnection.findUnique({ where: { organizationId } }),
    );
  }

  /**
   * Daily renewal scan (scheduler-driven, no tenant context). Discovery via
   * the `mercadopago_connections_due_for_refresh` SECURITY DEFINER function
   * (org ids only), then one renewal per org under its own RLS context. One
   * org's failure never stops the others.
   */
  async refreshDueConnections(): Promise<{ refreshed: number; failed: number }> {
    const windowDays = this.config.get('MERCADOPAGO_TOKEN_REFRESH_WINDOW_DAYS', { infer: true });
    const rows = await this.prisma.$queryRaw<{ organization_id: string }[]>(
      Prisma.sql`SELECT * FROM mercadopago_connections_due_for_refresh(${windowDays}::int)`,
    );
    let refreshed = 0;
    let failed = 0;
    for (const { organization_id } of rows) {
      try {
        if (await this.refreshOne(organization_id)) refreshed += 1;
      } catch (error) {
        failed += 1;
        this.logger.warn(
          `Mercado Pago token refresh failed for org ${organization_id}: ${(error as Error).message}`,
        );
      }
    }
    this.logger.log(`mercadopago-token-refresh scan: ${refreshed} refreshed, ${failed} failed`);
    return { refreshed, failed };
  }

  /**
   * Renews one org's grant. Optimistic concurrency: the new pair is written
   * only if the stored refresh token is still the one we used, so a parallel
   * renewal (inline + scan) never overwrites a newer pair nor marks a healthy
   * connection as broken. Returns true when this call wrote a new pair.
   */
  async refreshOne(organizationId: string): Promise<boolean> {
    const row = await this.findRow(organizationId);
    if (!row || row.status !== 'active' || !row.refreshTokenEnc) return false;
    const usedEnc = row.refreshTokenEnc;
    const refreshToken = decryptMercadoPagoSecret(usedEnc, this.key);

    let grant: MercadoPagoTokenGrant;
    try {
      grant = await this.oauth.refreshToken(refreshToken);
    } catch (error) {
      if (error instanceof MercadoPagoOAuthError && error.invalidGrant) {
        await this.markNeedsReconnect(organizationId, usedEnc, 'invalid_grant');
      } else {
        await this.prisma.withOrgContext(organizationId, (tx) =>
          tx.organizationMercadoPagoConnection.updateMany({
            where: { organizationId, refreshTokenEnc: usedEnc },
            data: { lastError: `refresh failed (${(error as Error).message.slice(0, 120)})` },
          }),
        );
      }
      throw error;
    }
    if (grant.userId !== row.mpUserId || grant.liveMode !== row.liveMode) {
      // The grant now names another account: never switch collectors silently.
      await this.markNeedsReconnect(organizationId, usedEnc, 'account_changed');
      throw new Error('Mercado Pago refresh returned another account');
    }

    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const updated = await tx.organizationMercadoPagoConnection.updateMany({
        where: { organizationId, refreshTokenEnc: usedEnc },
        data: {
          accessTokenEnc: encryptMercadoPagoSecret(grant.accessToken, this.key),
          // Keep the current refresh token when Mercado Pago does not rotate it.
          refreshTokenEnc: grant.refreshToken
            ? encryptMercadoPagoSecret(grant.refreshToken, this.key)
            : usedEnc,
          expiresAt: new Date(Date.now() + grant.expiresIn * 1000),
          lastRefreshedAt: new Date(),
          lastError: null,
        },
      });
      if (updated.count === 0) return false;
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId: null,
        action: 'payment_gateway.mercadopago_refreshed',
        entityType: MERCADOPAGO_CONNECTION_ENTITY,
        entityId: organizationId,
        metadata: { mpUserId: row.mpUserId },
      });
      return true;
    });
  }

  private async markNeedsReconnect(
    organizationId: string,
    usedRefreshEnc: string,
    reason: string,
  ): Promise<void> {
    await this.prisma.withOrgContext(organizationId, async (tx) => {
      const updated = await tx.organizationMercadoPagoConnection.updateMany({
        where: { organizationId, refreshTokenEnc: usedRefreshEnc, status: 'active' },
        data: { status: 'needs_reconnect', lastError: reason },
      });
      if (updated.count === 0) return; // a parallel renewal already succeeded
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId: null,
        action: 'payment_gateway.mercadopago_needs_reconnect',
        entityType: MERCADOPAGO_CONNECTION_ENTITY,
        entityId: organizationId,
        metadata: { reason },
      });
    });
  }

  /**
   * The upsert is keyed by `organization_id` (the org's own row, visible
   * under its RLS), so a unique violation can only come from `mp_user_id`
   * held by ANOTHER org. Postgres may not name the constraint here (the
   * conflicting row is invisible under RLS), so any P2002 counts.
   */
  private isUniqueConflict(error: unknown, _column: 'mp_user_id'): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
