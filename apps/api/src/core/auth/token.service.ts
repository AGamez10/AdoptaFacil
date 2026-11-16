import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AccessTokenClaims, AccountType, AuthTokens } from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import {
  loadPlatformSecurityConfig,
  type PlatformSecurityConfig,
} from './mfa/platform-security.config';

/** Everything needed to mint a token pair for a user. */
export interface TokenPrincipal {
  userId: string;
  organizationId: string;
  accountType: AccountType;
  email: string;
}

/** Error code of the 401 a removed organization member gets on sign-in or
 *  refresh (security remediation `tenant-membership-not-revalidated`). */
export const MEMBERSHIP_REVOKED = 'MEMBERSHIP_REVOKED';

/** Options of {@link TokenService.issueTokens}. */
export interface IssueTokensOptions {
  /** The session just passed the second factor (platform staff, TOTP). */
  mfaVerifiedAt?: Date;
}

/**
 * Issues and rotates tokens:
 *  - access token: a short-lived signed JWT carrying the tenant (`org`) claim,
 *    so the tenant middleware can resolve the organization from the principal.
 *  - refresh token: an opaque random string; only its SHA-256 hash is persisted
 *    (never the token itself), and every use rotates it — the old row is revoked
 *    and linked to its replacement so reuse can be detected.
 *
 * The refresh/credential tables are NOT tenant-scoped, so these queries run on
 * the base client (no org context needed).
 *
 * Platform staff sessions that passed the second factor carry `mfa_at` in the
 * access token and `mfa_verified_at` on the refresh row. Such a session gets a
 * SHORTER access token, keeps its second factor across rotations only within
 * the work-day window, and loses it when the refresh comes after the idle
 * timeout — then the staff member types a code again (platform-security.config).
 */
@Injectable()
export class TokenService {
  private readonly platform: PlatformSecurityConfig = loadPlatformSecurityConfig();

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Access-token lifetime: the platform staff one when the session carries a
   *  second factor (never longer than the general one). */
  private accessTtl(mfaVerifiedAt: Date | null | undefined): number {
    return mfaVerifiedAt
      ? Math.min(this.platform.accessTtlSeconds, this.config.accessTtlSeconds)
      : this.config.accessTtlSeconds;
  }

  private signAccessToken(principal: TokenPrincipal, mfaVerifiedAt?: Date | null): string {
    const claims: AccessTokenClaims = {
      sub: principal.userId,
      org: principal.organizationId,
      typ: principal.accountType,
      email: principal.email,
    };
    if (mfaVerifiedAt) {
      claims.mfa_at = Math.floor(mfaVerifiedAt.getTime() / 1000);
    }
    return this.jwt.sign(claims, { expiresIn: this.accessTtl(mfaVerifiedAt) });
  }

  private async persistRefreshToken(userId: string, mfaVerifiedAt?: Date): Promise<string> {
    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + this.config.refreshTtlSeconds * 1000);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt,
        mfaVerifiedAt: mfaVerifiedAt ?? null,
      },
    });
    return refreshToken;
  }

  /** The second factor a rotating session keeps: only inside the work-day
   *  window and only if the previous refresh is not older than the idle
   *  timeout. Otherwise the new pair carries none. */
  private carriedMfa(existing: { mfaVerifiedAt: Date | null; createdAt: Date }): Date | null {
    if (!existing.mfaVerifiedAt) return null;
    const now = Date.now();
    const age = now - existing.mfaVerifiedAt.getTime();
    const idle = now - existing.createdAt.getTime();
    if (age >= this.platform.mfaSessionMaxSeconds * 1000) return null;
    if (idle >= this.platform.idleTimeoutSeconds * 1000) return null;
    return existing.mfaVerifiedAt;
  }

  /**
   * Single active session: revoke every OTHER still-active refresh token this
   * user holds before minting a new one, so signing in from a second place
   * ends the first. The first session's short-lived access token (15 min
   * default) keeps working until it expires or that device tries to refresh —
   * at that point `rotate()` rejects the now-revoked token and the web app's
   * existing "refresh failed → session expired → logout" path takes over.
   * There is no separate live/instant kill switch (would require checking a
   * session store on every authenticated request); this is a deliberate,
   * cheap trade-off.
   */
  private async revokeOtherSessions(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Live membership is a condition of every session (security remediation
   * `tenant-membership-not-revalidated:jwt-org-from-auth-credential`). The
   * token's `org` claim comes from `auth_credentials.organization_id`, which
   * outlives a removal from the team (`DELETE /org/members/:id` deletes only
   * the roles and the refresh tokens). An ORGANIZATION account holding no role
   * in its organization is a former member: no new session for it, neither by
   * password, Google, MFA step-up nor refresh. A person account never holds a
   * role in its personal organization (nor do platform staff, who are person
   * accounts), so only organization accounts are checked. Restoring a role
   * (`PUT /org/members/:id/role`) lets the person sign in again.
   */
  private async assertActiveMembership(principal: TokenPrincipal): Promise<void> {
    if (principal.accountType !== 'organization') return;
    const roles = await this.prisma.withOrgContext(principal.organizationId, (tx) =>
      tx.userRole.count({
        where: { userId: principal.userId, organizationId: principal.organizationId },
      }),
    );
    if (roles === 0) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: MEMBERSHIP_REVOKED,
        message: 'Esta cuenta ya no hace parte de la organización.',
      });
    }
  }

  /** Mint a fresh access + refresh pair for a principal (login / register /
   *  Google sign-in) — revokes any other session this user already had. */
  async issueTokens(
    principal: TokenPrincipal,
    options: IssueTokensOptions = {},
  ): Promise<AuthTokens> {
    await this.assertActiveMembership(principal);
    await this.revokeOtherSessions(principal.userId);
    const refreshToken = await this.persistRefreshToken(principal.userId, options.mfaVerifiedAt);
    return {
      accessToken: this.signAccessToken(principal, options.mfaVerifiedAt),
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.accessTtl(options.mfaVerifiedAt),
    };
  }

  /** End every session of a user (role revoked, second factor reset…). */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.revokeOtherSessions(userId);
  }

  /** Validate a refresh token and rotate it, returning a new token pair. */
  async rotate(presentedRefreshToken: string): Promise<AuthTokens> {
    const tokenHash = this.hashToken(presentedRefreshToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!existing || existing.revokedAt || existing.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const credential = await this.prisma.authCredential.findUnique({
      where: { userId: existing.userId },
    });
    if (!credential) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const principal: TokenPrincipal = {
      userId: credential.userId,
      organizationId: credential.organizationId,
      accountType: credential.accountType as AccountType,
      email: credential.email,
    };
    // A member removed while holding a refresh token that somehow survived
    // (removal deletes them; this is the defense in depth) gets no new pair.
    await this.assertActiveMembership(principal);

    const mfaVerifiedAt = this.carriedMfa(existing);
    const newRefreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + this.config.refreshTtlSeconds * 1000);
    const replacement = await this.prisma.refreshToken.create({
      data: {
        userId: principal.userId,
        tokenHash: this.hashToken(newRefreshToken),
        expiresAt,
        mfaVerifiedAt,
      },
    });
    // Revoke the presented token and link it to its replacement (reuse trail).
    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), replacedById: replacement.id },
    });

    return {
      accessToken: this.signAccessToken(principal, mfaVerifiedAt),
      refreshToken: newRefreshToken,
      tokenType: 'Bearer',
      expiresIn: this.accessTtl(mfaVerifiedAt),
    };
  }

  /** Revoke a refresh token (logout). Idempotent and safe for unknown tokens. */
  async revoke(presentedRefreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(presentedRefreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
