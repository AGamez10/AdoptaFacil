import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { Role } from '@adoptafacil/contracts';
import type { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../auth/auth.types';
import { RolesGuard } from './roles.guard';

function makeContext(user: RequestUser | undefined): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function makeReflector(required: Role[] | undefined): Reflector {
  return { getAllAndOverride: jest.fn().mockReturnValue(required) } as unknown as Reflector;
}

function makePrisma(heldRoles: string[]): PrismaService {
  return {
    withTenant: jest.fn().mockResolvedValue(heldRoles.map((role) => ({ role }))),
  } as unknown as PrismaService;
}

const USER: RequestUser = {
  id: 'u1',
  organizationId: 'o1',
  accountType: 'organization',
  email: 'u1@test',
};

describe('RolesGuard', () => {
  it('allows when no roles are required (no restriction)', async () => {
    const prisma = makePrisma([]);
    const guard = new RolesGuard(makeReflector(undefined), prisma);
    await expect(guard.canActivate(makeContext(USER))).resolves.toBe(true);
    expect(prisma.withTenant).not.toHaveBeenCalled();
  });

  it('allows when the user holds one of the required roles', async () => {
    const guard = new RolesGuard(
      makeReflector([Role.Owner, Role.Administrator]),
      makePrisma(['administrator']),
    );
    await expect(guard.canActivate(makeContext(USER))).resolves.toBe(true);
  });

  it('denies (403) when the user lacks every required role', async () => {
    const guard = new RolesGuard(makeReflector([Role.Owner]), makePrisma(['operator']));
    await expect(guard.canActivate(makeContext(USER))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies (403) when there is no authenticated principal', async () => {
    const guard = new RolesGuard(makeReflector([Role.Owner]), makePrisma(['owner']));
    await expect(guard.canActivate(makeContext(undefined))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('denies (403) when the user holds no roles at all', async () => {
    const guard = new RolesGuard(makeReflector([Role.ReadOnlyAuditor]), makePrisma([]));
    await expect(guard.canActivate(makeContext(USER))).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('RolesGuard · second factor for platform authority (F19)', () => {
  const previous = process.env.PLATFORM_MFA_REQUIRED;
  beforeAll(() => {
    process.env.PLATFORM_MFA_REQUIRED = 'true';
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.PLATFORM_MFA_REQUIRED;
    else process.env.PLATFORM_MFA_REQUIRED = previous;
  });

  function prismaWith(heldRoles: string[], enrolled: boolean): PrismaService {
    return {
      withTenant: jest.fn().mockResolvedValue(heldRoles.map((role) => ({ role }))),
      authMfaFactor: {
        findUnique: jest.fn().mockResolvedValue(enrolled ? { confirmedAt: new Date() } : null),
      },
    } as unknown as PrismaService;
  }

  function contextWith(user: RequestUser, request: Record<string, unknown> = {}): ExecutionContext {
    return {
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => Object.assign(request, { user }) }),
    } as unknown as ExecutionContext;
  }

  const PLATFORM = [Role.PlatformAdmin, Role.PlatformSuperAdmin];

  it('asks an account without a factor to set one up', async () => {
    const guard = new RolesGuard(makeReflector(PLATFORM), prismaWith(['platform_admin'], false));
    await expect(guard.canActivate(contextWith(USER))).rejects.toMatchObject({
      response: { code: 'MFA_ENROLLMENT_REQUIRED' },
    });
  });

  it('asks an enrolled account whose session did not pass the code', async () => {
    const guard = new RolesGuard(makeReflector(PLATFORM), prismaWith(['platform_admin'], true));
    await expect(guard.canActivate(contextWith(USER))).rejects.toMatchObject({
      response: { code: 'MFA_REQUIRED' },
    });
  });

  it('refuses a second factor older than the work-day window', async () => {
    const guard = new RolesGuard(makeReflector(PLATFORM), prismaWith(['platform_admin'], true));
    const stale = { ...USER, mfaAt: Math.floor(Date.now() / 1000) - 9 * 3600 };
    await expect(guard.canActivate(contextWith(stale))).rejects.toMatchObject({
      response: { code: 'MFA_REQUIRED' },
    });
  });

  it('lets a fresh second factor in and marks the request for the access log', async () => {
    const guard = new RolesGuard(makeReflector(PLATFORM), prismaWith(['platform_admin'], true));
    const request: Record<string, unknown> = {};
    const fresh = { ...USER, mfaAt: Math.floor(Date.now() / 1000) - 60 };
    await expect(guard.canActivate(contextWith(fresh, request))).resolves.toBe(true);
    expect(request.platformAccess).toEqual({
      teamOrganizationId: USER.organizationId,
      roles: [Role.PlatformAdmin],
    });
  });

  it('does not touch routes an organization role also opens', async () => {
    const guard = new RolesGuard(
      makeReflector([Role.Owner, Role.PlatformAdmin]),
      prismaWith(['owner', 'platform_admin'], false),
    );
    await expect(guard.canActivate(contextWith(USER))).resolves.toBe(true);
  });
});
