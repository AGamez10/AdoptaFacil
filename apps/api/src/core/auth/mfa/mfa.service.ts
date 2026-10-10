import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import QRCode from 'qrcode';
import {
  type AccountType,
  type AuthTokens,
  type MfaEnrollment,
  type MfaStatus,
  PLATFORM_ROLES,
  type Role,
} from '@adoptafacil/contracts';
import { PrismaService } from '../../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../../redis/redis.service';
import { AuditService } from '../../audit/audit.service';
import { NOTIFICATION_PORT, type NotificationPort } from '../../notifications/notification.port';
import type { RequestUser } from '../auth.types';
import { PasswordService } from '../password.service';
import { TokenService } from '../token.service';
import { decryptTotpSecret, encryptTotpSecret, MFA_ENCRYPTION_KEY } from './mfa-crypto';
import {
  isMfaFresh,
  PLATFORM_SECURITY_CONFIG,
  type PlatformSecurityConfig,
} from './platform-security.config';
import { buildOtpauthUri, generateTotpSecret, verifyTotp } from './totp';

/** Wrong codes allowed per account before a temporary lock. */
export const MFA_MAX_FAILURES = 5;
/** How long the lock (and the failure window) lasts. */
export const MFA_LOCK_SECONDS = 15 * 60;
const ISSUER = 'AdoptaFácil';
const FAILURE_KEY = (userId: string) => `mfa:failures:${userId}`;

/**
 * Second factor (TOTP) for platform staff. Every check is replay-proof (a code
 * step is accepted once, and never one older than the last accepted), the
 * account locks for 15 minutes after 5 wrong codes, and every enrollment,
 * success and failure lands in the account's organization audit trail
 * (without the code or the secret).
 */
@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
    @Inject(MFA_ENCRYPTION_KEY) private readonly key: Buffer,
    @Inject(PLATFORM_SECURITY_CONFIG) private readonly config: PlatformSecurityConfig,
  ) {}

  /** Platform roles the user holds in their own organization (the team). */
  async platformRolesOf(user: Pick<RequestUser, 'id' | 'organizationId'>): Promise<Role[]> {
    const rows = await this.prisma.withOrgContext(user.organizationId, (tx) =>
      tx.userRole.findMany({ where: { userId: user.id }, select: { role: true } }),
    );
    return rows.map((row) => row.role as Role).filter((role) => PLATFORM_ROLES.includes(role));
  }

  async status(user: RequestUser): Promise<MfaStatus> {
    const [roles, factor] = await Promise.all([
      this.platformRolesOf(user),
      this.prisma.authMfaFactor.findUnique({
        where: { userId: user.id },
        select: { confirmedAt: true },
      }),
    ]);
    const verified = isMfaFresh(user.mfaAt, this.config);
    return {
      required: roles.length > 0 && this.config.mfaRequired,
      enrolled: Boolean(factor?.confirmedAt),
      verified,
      verifiedUntil:
        verified && user.mfaAt
          ? new Date((user.mfaAt + this.config.mfaSessionMaxSeconds) * 1000).toISOString()
          : null,
    };
  }

  /**
   * Start (or restart, while unconfirmed) the enrollment. Only platform staff
   * enroll, and only after typing their password again: a stolen session
   * alone cannot bind an attacker's authenticator. A confirmed factor is never
   * replaced from here — resetting it takes a four-eyes approval.
   */
  async startEnrollment(user: RequestUser, password: string): Promise<MfaEnrollment> {
    await this.assertStaff(user);
    await this.assertPassword(user, password);
    const existing = await this.prisma.authMfaFactor.findUnique({ where: { userId: user.id } });
    if (existing?.confirmedAt) {
      throw new ConflictException(
        'Two-step verification is already active. Ask your team to reset it.',
      );
    }
    const secret = generateTotpSecret();
    const secretCiphertext = encryptTotpSecret(secret, this.key);
    await this.prisma.authMfaFactor.upsert({
      where: { userId: user.id },
      create: { userId: user.id, secretCiphertext },
      update: { secretCiphertext, confirmedAt: null, lastUsedStep: null },
    });
    await this.record(user, 'auth.mfa.enrollment_started');
    const otpauthUri = buildOtpauthUri(secret, user.email, ISSUER);
    return {
      secret,
      otpauthUri,
      qrDataUrl: await QRCode.toDataURL(otpauthUri, { margin: 1, width: 240 }),
    };
  }

  /** First code proves the app works: the factor becomes active and this
   *  session counts as verified. */
  async confirmEnrollment(user: RequestUser, code: string): Promise<AuthTokens> {
    await this.assertStaff(user);
    const factor = await this.prisma.authMfaFactor.findUnique({ where: { userId: user.id } });
    if (!factor || factor.confirmedAt) {
      throw new ConflictException('There is no pending two-step verification setup.');
    }
    const step = await this.checkCode(user, factor, code);
    const updated = await this.prisma.authMfaFactor.updateMany({
      where: { userId: user.id, confirmedAt: null },
      data: { confirmedAt: new Date(), lastUsedStep: BigInt(step) },
    });
    if (updated.count !== 1) {
      throw new ConflictException('There is no pending two-step verification setup.');
    }
    await this.record(user, 'auth.mfa.enrolled');
    await this.notifyEnrollment(user.email);
    return this.issueVerifiedSession(user);
  }

  /** Pass the second factor for the current session. */
  async verify(user: RequestUser, code: string): Promise<AuthTokens> {
    await this.assertStaff(user);
    await this.assertFreshCode(user, code);
    await this.record(user, 'auth.mfa.verified');
    return this.issueVerifiedSession(user);
  }

  /**
   * Step-up check for sensitive actions: a fresh, never-used code of the
   * caller's confirmed factor. Throws 401 on a wrong/reused code, 429 when the
   * account is locked.
   */
  async assertFreshCode(
    user: Pick<RequestUser, 'id' | 'organizationId' | 'email'>,
    code: string,
  ): Promise<void> {
    const factor = await this.prisma.authMfaFactor.findUnique({ where: { userId: user.id } });
    if (!factor?.confirmedAt) {
      throw new ForbiddenException('Two-step verification is not set up for this account.');
    }
    const step = await this.checkCode(user, factor, code);
    // Consume the step atomically: a concurrent replay of the same code loses.
    const consumed = await this.prisma.$executeRaw`
      UPDATE auth_mfa_factors
         SET last_used_step = ${BigInt(step)}, updated_at = now()
       WHERE user_id = ${user.id}::uuid
         AND (last_used_step IS NULL OR last_used_step < ${BigInt(step)})`;
    if (consumed !== 1) {
      await this.fail(user, 'replayed');
    }
  }

  /** Remove a factor (four-eyes approved reset) and end the account's sessions. */
  async resetFactor(userId: string): Promise<boolean> {
    const { count } = await this.prisma.authMfaFactor.deleteMany({ where: { userId } });
    await this.tokens.revokeAllSessions(userId);
    await this.redis.del(FAILURE_KEY(userId));
    return count > 0;
  }

  private async checkCode(
    user: Pick<RequestUser, 'id' | 'organizationId' | 'email'>,
    factor: { secretCiphertext: string; lastUsedStep: bigint | null },
    code: string,
  ): Promise<number> {
    const failures = Number((await this.redis.get(FAILURE_KEY(user.id))) ?? 0);
    if (failures >= MFA_MAX_FAILURES) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'MFA_LOCKED',
          message: 'Too many wrong codes. Wait 15 minutes and try again.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const secret = decryptTotpSecret(factor.secretCiphertext, this.key);
    const step = verifyTotp(secret, String(code ?? '').trim(), Date.now());
    if (step === null) {
      return this.fail(user, 'wrong_code');
    }
    if (factor.lastUsedStep !== null && BigInt(step) <= factor.lastUsedStep) {
      return this.fail(user, 'replayed');
    }
    await this.redis.del(FAILURE_KEY(user.id));
    return step;
  }

  private async fail(
    user: Pick<RequestUser, 'id' | 'organizationId'>,
    reason: 'wrong_code' | 'replayed',
  ): Promise<never> {
    const key = FAILURE_KEY(user.id);
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, MFA_LOCK_SECONDS);
    await this.record(user, 'auth.mfa.failed', { reason, failures: count });
    throw new UnauthorizedException({
      statusCode: 401,
      code: 'MFA_INVALID_CODE',
      message: 'The code is not valid. Use the current code of your app.',
    });
  }

  private async issueVerifiedSession(user: RequestUser): Promise<AuthTokens> {
    const credential = await this.prisma.authCredential.findUnique({
      where: { userId: user.id },
      select: { organizationId: true, accountType: true, email: true },
    });
    if (!credential) throw new UnauthorizedException('Invalid session');
    return this.tokens.issueTokens(
      {
        userId: user.id,
        organizationId: credential.organizationId,
        accountType: credential.accountType as AccountType,
        email: credential.email,
      },
      { mfaVerifiedAt: new Date() },
    );
  }

  private async assertStaff(user: RequestUser): Promise<void> {
    if ((await this.platformRolesOf(user)).length === 0) {
      throw new ForbiddenException('Two-step verification is only for platform staff accounts.');
    }
  }

  private async assertPassword(user: RequestUser, password: string): Promise<void> {
    const credential = await this.prisma.authCredential.findUnique({
      where: { userId: user.id },
      select: { passwordHash: true },
    });
    const ok = await this.passwords.verify(
      String(password ?? ''),
      credential?.passwordHash ?? PasswordService.DUMMY_HASH,
    );
    if (!credential || !ok) {
      await this.record(user, 'auth.mfa.enrollment_password_failed');
      throw new UnauthorizedException('Invalid credentials');
    }
  }

  private record(
    user: Pick<RequestUser, 'id' | 'organizationId'>,
    action: string,
    metadata: Record<string, unknown> = {},
  ) {
    return this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action,
      entityType: 'user',
      entityId: user.id,
      metadata,
    });
  }

  private async notifyEnrollment(email: string): Promise<void> {
    try {
      await this.notifications.send({
        to: email,
        subject: 'Activaste la verificación en dos pasos en AdoptaFácil',
        body:
          'Hola,\n\nLa verificación en dos pasos quedó activa en tu cuenta del equipo de ' +
          'AdoptaFácil. Desde ahora, además de tu contraseña, te pediremos el código de tu app.\n\n' +
          'Si no fuiste tú, avisa de inmediato a tu líder de equipo para que bloquee la cuenta.',
      });
    } catch (error) {
      // The factor is active either way; a failed courtesy email must not undo it.
      this.logger.warn(`MFA enrollment notice not delivered: ${(error as Error).name}`);
    }
  }
}
