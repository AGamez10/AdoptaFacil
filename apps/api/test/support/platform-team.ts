import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { MFA_ENCRYPTION_KEY, encryptTotpSecret } from '../../src/core/auth/mfa/mfa-crypto';
import { generateTotpSecret } from '../../src/core/auth/mfa/totp';
import { PasswordService } from '../../src/core/auth/password.service';
import { TokenService } from '../../src/core/auth/token.service';

export const STAFF_PASSWORD = 'password-staff-team-123';

export interface StaffMember {
  userId: string;
  /** The team = organization where the platform roles live. */
  orgId: string;
  email: string;
  token: string;
  refreshToken: string;
  /** Base32 TOTP secret, when the member has a confirmed factor. */
  totpSecret?: string;
}

interface Options {
  /** Join this team; without it a new team (organization) is created. */
  teamOrgId?: string;
  roles: string[];
  /** Create a confirmed TOTP factor (secret returned). */
  enrolled?: boolean;
  /** Issue a session that already passed the second factor. */
  mfaVerified?: boolean;
}

const passwords = new PasswordService();
let cachedHash: string | undefined;

/**
 * Platform staff for integration tests, created with the superuser client
 * (like the seed script) and signed in through TokenService — no /auth/login,
 * so suites don't burn the login throttle.
 */
export async function createStaffMember(
  admin: PrismaClient,
  app: INestApplication,
  options: Options,
): Promise<StaffMember> {
  const orgId = options.teamOrgId ?? randomUUID();
  const userId = randomUUID();
  const email = `staff-${randomUUID()}@test.local`;
  cachedHash ??= await passwords.hash(STAFF_PASSWORD);
  if (!options.teamOrgId) {
    await admin.organization.create({
      data: { id: orgId, name: `Equipo ${orgId.slice(0, 8)} (Platform)`, status: 'approved' },
    });
  }
  await admin.user.create({
    data: { id: userId, organizationId: orgId, accountType: 'person', email, displayName: email },
  });
  await admin.authCredential.create({
    data: { userId, organizationId: orgId, accountType: 'person', email, passwordHash: cachedHash },
  });
  for (const role of options.roles) {
    await admin.userRole.create({ data: { organizationId: orgId, userId, role } });
  }
  let totpSecret: string | undefined;
  if (options.enrolled) {
    totpSecret = generateTotpSecret();
    await admin.authMfaFactor.create({
      data: {
        userId,
        secretCiphertext: encryptTotpSecret(totpSecret, app.get<Buffer>(MFA_ENCRYPTION_KEY)),
        confirmedAt: new Date(),
      },
    });
  }
  const tokens = await app
    .get(TokenService)
    .issueTokens(
      { userId, organizationId: orgId, accountType: 'person', email },
      options.mfaVerified ? { mfaVerifiedAt: new Date() } : {},
    );
  return {
    userId,
    orgId,
    email,
    token: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    totpSecret,
  };
}
