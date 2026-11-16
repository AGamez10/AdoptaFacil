import { UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuthConfig } from './auth.config';
import { TokenService } from './token.service';

const CONFIG: AuthConfig = {
  jwtSecret: 'test-secret',
  accessTtlSeconds: 900,
  refreshTtlSeconds: 604800,
};

function makeJwt(): JwtService {
  return { sign: jest.fn().mockReturnValue('signed.access.token') } as unknown as JwtService;
}

function makePrisma(): PrismaService {
  return {
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    authCredential: { findUnique: jest.fn() },
    userRole: { count: jest.fn().mockResolvedValue(1) },
    // Runs the callback on the same mock (no real tenant transaction).
    withOrgContext: jest.fn(function (this: unknown, _org: string, fn: (tx: unknown) => unknown) {
      return fn(this);
    }),
  } as unknown as PrismaService;
}

describe('TokenService', () => {
  it('issues an access JWT plus an opaque refresh token stored only as a hash', async () => {
    const jwt = makeJwt();
    const prisma = makePrisma();
    (prisma.refreshToken.create as jest.Mock).mockResolvedValue({ id: 'r1' });
    const service = new TokenService(jwt, prisma, CONFIG);

    const tokens = await service.issueTokens({
      userId: 'u1',
      organizationId: 'o1',
      accountType: 'person',
      email: 'e@test',
    });

    expect(tokens.tokenType).toBe('Bearer');
    expect(tokens.expiresIn).toBe(900);
    expect(tokens.accessToken).toBe('signed.access.token');
    expect(tokens.refreshToken.length).toBeGreaterThan(20);

    const createArg = (prisma.refreshToken.create as jest.Mock).mock.calls[0][0];
    // The stored value is a hash — never the raw refresh token.
    expect(createArg.data.tokenHash).not.toBe(tokens.refreshToken);
    expect(createArg.data.userId).toBe('u1');
  });

  it('single active session: revokes every other active refresh token for the user before issuing a new one', async () => {
    const jwt = makeJwt();
    const prisma = makePrisma();
    (prisma.refreshToken.create as jest.Mock).mockResolvedValue({ id: 'r2' });
    const service = new TokenService(jwt, prisma, CONFIG);

    await service.issueTokens({
      userId: 'u1',
      organizationId: 'o1',
      accountType: 'person',
      email: 'e@test',
    });

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    // Revocation happens BEFORE the new token is persisted, not after.
    const revokeOrder = (prisma.refreshToken.updateMany as jest.Mock).mock.invocationCallOrder[0];
    const createOrder = (prisma.refreshToken.create as jest.Mock).mock.invocationCallOrder[0];
    expect(revokeOrder).toBeLessThan(createOrder);
  });

  it('rotates a valid refresh token: creates a replacement and revokes the old one', async () => {
    const jwt = makeJwt();
    const prisma = makePrisma();
    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      id: 'old',
      userId: 'u1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    (prisma.authCredential.findUnique as jest.Mock).mockResolvedValue({
      userId: 'u1',
      organizationId: 'o1',
      accountType: 'person',
      email: 'e@test',
    });
    (prisma.refreshToken.create as jest.Mock).mockResolvedValue({ id: 'new' });
    const service = new TokenService(jwt, prisma, CONFIG);

    const tokens = await service.rotate('presented-refresh');

    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    expect(prisma.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 'old' },
      data: expect.objectContaining({ replacedById: 'new' }),
    });
    expect(tokens.accessToken).toBe('signed.access.token');
    expect(tokens.refreshToken).toEqual(expect.any(String));
  });

  it('rejects an unknown refresh token', async () => {
    const prisma = makePrisma();
    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(null);
    const service = new TokenService(makeJwt(), prisma, CONFIG);
    await expect(service.rotate('nope')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an already-revoked refresh token', async () => {
    const prisma = makePrisma();
    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      id: 'old',
      userId: 'u1',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const service = new TokenService(makeJwt(), prisma, CONFIG);
    await expect(service.rotate('revoked')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired refresh token', async () => {
    const prisma = makePrisma();
    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      id: 'old',
      userId: 'u1',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1_000),
    });
    const service = new TokenService(makeJwt(), prisma, CONFIG);
    await expect(service.rotate('expired')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  // Security remediation `tenant-membership-not-revalidated`: every front door
  // (password, Google, MFA step-up, invitation) ends in issueTokens, and every
  // refresh in rotate — both refuse an organization account with no role left.
  describe('live membership', () => {
    const orgPrincipal = {
      userId: 'u-org',
      organizationId: 'o-org',
      accountType: 'organization' as const,
      email: 'ex@test',
    };

    it('refuses to issue a session to an organization account without roles', async () => {
      const prisma = makePrisma();
      (prisma.userRole.count as jest.Mock).mockResolvedValue(0);
      const service = new TokenService(makeJwt(), prisma, CONFIG);
      await expect(service.issueTokens(orgPrincipal)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
      expect(prisma.withOrgContext).toHaveBeenCalledWith('o-org', expect.any(Function));
    });

    it('issues it while the member holds a role; never checks a person account', async () => {
      const prisma = makePrisma();
      (prisma.refreshToken.create as jest.Mock).mockResolvedValue({ id: 'r' });
      const service = new TokenService(makeJwt(), prisma, CONFIG);
      await expect(service.issueTokens(orgPrincipal)).resolves.toBeDefined();
      (prisma.userRole.count as jest.Mock).mockClear();
      await service.issueTokens({ ...orgPrincipal, accountType: 'person' });
      expect(prisma.userRole.count).not.toHaveBeenCalled();
    });

    it('refuses to rotate a refresh token of a removed member', async () => {
      const prisma = makePrisma();
      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
        id: 'r1',
        userId: 'u-org',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        mfaVerifiedAt: null,
        createdAt: new Date(),
      });
      (prisma.authCredential.findUnique as jest.Mock).mockResolvedValue({
        userId: 'u-org',
        organizationId: 'o-org',
        accountType: 'organization',
        email: 'ex@test',
      });
      (prisma.userRole.count as jest.Mock).mockResolvedValue(0);
      const service = new TokenService(makeJwt(), prisma, CONFIG);
      await expect(service.rotate('presented')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });
  });
});
