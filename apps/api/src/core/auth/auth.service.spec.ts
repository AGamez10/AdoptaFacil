import type { ConfigService } from '@nestjs/config';
import {
  currentLegalAcceptanceItems,
  type IdentityPort,
  requiredLegalDocuments,
} from '@adoptafacil/contracts';
import type { AuditService } from '../audit/audit.service';
import { LegalService } from '../legal/legal.service';
import type { NotificationPort } from '../notifications/notification.port';
import type { PrismaService } from '../../prisma/prisma.service';
import type { Env } from '../../config/env.validation';
import { AuthService } from './auth.service';
import type { PasswordService } from './password.service';
import type { TokenService } from './token.service';

/**
 * Unit tests for the Owner-on-registration behavior (T-012b) and its atomicity.
 * The DB is mocked; the assertions focus on: (a) every write for an org
 * registration flows through a SINGLE withOrgContext transaction, (b) the Owner
 * role is created for organizations only, and (c) a failure in the role write
 * propagates so the (real) transaction would roll back.
 */
interface TxMock {
  organization: { create: jest.Mock };
  user: { create: jest.Mock };
  authCredential: { create: jest.Mock };
  userRole: { create: jest.Mock };
  animalBreed: { createMany: jest.Mock };
  legalAcceptance: { createMany: jest.Mock };
}

const ORG_LEGAL = currentLegalAcceptanceItems(requiredLegalDocuments('organization'));
const PERSON_LEGAL = currentLegalAcceptanceItems(requiredLegalDocuments('person'));

function makeTx(): TxMock {
  return {
    organization: { create: jest.fn().mockResolvedValue({}) },
    user: { create: jest.fn().mockResolvedValue({}) },
    authCredential: { create: jest.fn().mockResolvedValue({}) },
    userRole: { create: jest.fn().mockResolvedValue({}) },
    animalBreed: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    legalAcceptance: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
}

function makeService(tx: TxMock): { service: AuthService; withOrgContext: jest.Mock } {
  const withOrgContext = jest
    .fn()
    .mockImplementation((_org: string, cb: (t: TxMock) => Promise<unknown>) => cb(tx));
  const prisma = {
    authCredential: { findUnique: jest.fn().mockResolvedValue(null) },
    withOrgContext,
  } as unknown as PrismaService;
  const passwords = { hash: jest.fn().mockResolvedValue('hashed') } as unknown as PasswordService;
  const tokens = {
    issueTokens: jest.fn().mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      tokenType: 'Bearer',
      expiresIn: 900,
    }),
  } as unknown as TokenService;
  const notifications = { send: jest.fn() } as unknown as NotificationPort;
  const audit = { record: jest.fn(), recordWithTx: jest.fn() } as unknown as AuditService;
  const config = {
    get: (key: string) => (key === 'WEB_BASE_URL' ? 'http://localhost:5173' : undefined),
  } as unknown as ConfigService<Env, true>;
  const identity = { verifyGoogleIdToken: jest.fn() } as unknown as IdentityPort;
  return {
    service: new AuthService(
      prisma,
      passwords,
      tokens,
      notifications,
      identity,
      audit,
      config,
      new LegalService(prisma, audit, notifications, config),
    ),
    withOrgContext,
  };
}

describe('AuthService — Owner on organization registration (T-012b)', () => {
  it('creates the Owner role for the registrant within a single transaction', async () => {
    const tx = makeTx();
    const { service, withOrgContext } = makeService(tx);

    await service.registerOrganization({
      organizationName: 'Org',
      displayName: 'Rep',
      email: 'rep@test.local',
      password: 'password123',
      legalAcceptances: ORG_LEGAL,
    });

    expect(withOrgContext).toHaveBeenCalledTimes(1);
    expect(tx.organization.create).toHaveBeenCalledTimes(1);
    expect(tx.user.create).toHaveBeenCalledTimes(1);
    expect(tx.authCredential.create).toHaveBeenCalledTimes(1);
    expect(tx.userRole.create).toHaveBeenCalledTimes(1);
    expect(tx.userRole.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ role: 'owner' }),
    });
    // S2-04A: an organization gets the common breed catalog preloaded.
    expect(tx.animalBreed.createMany).toHaveBeenCalledTimes(1);
    expect(tx.animalBreed.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });

  it('does NOT assign a role or preload breeds when registering a Person', async () => {
    const tx = makeTx();
    const { service } = makeService(tx);

    await service.registerPerson({
      displayName: 'Persona',
      email: 'persona@test.local',
      password: 'password123',
      legalAcceptances: PERSON_LEGAL,
    });

    expect(tx.user.create).toHaveBeenCalledTimes(1);
    expect(tx.userRole.create).not.toHaveBeenCalled();
    expect(tx.animalBreed.createMany).not.toHaveBeenCalled();
  });

  it('rejects registration if the Owner role assignment fails (atomic rollback)', async () => {
    const tx = makeTx();
    tx.userRole.create.mockRejectedValueOnce(new Error('role insert failed'));
    const { service } = makeService(tx);

    await expect(
      service.registerOrganization({
        organizationName: 'Org',
        displayName: 'Rep',
        email: 'fail@test.local',
        password: 'password123',
        legalAcceptances: ORG_LEGAL,
      }),
    ).rejects.toThrow('role insert failed');
  });
});

describe('AuthService — aceptación legal en el registro (Ley 1581)', () => {
  it('no crea la cuenta si faltan los documentos obligatorios', async () => {
    const tx = makeTx();
    const { service, withOrgContext } = makeService(tx);

    await expect(
      service.registerPerson({
        displayName: 'Persona',
        email: 'sin-aceptar@test.local',
        password: 'password123',
      }),
    ).rejects.toMatchObject({ response: { code: 'LEGAL_ACCEPTANCE_REQUIRED' } });
    expect(withOrgContext).not.toHaveBeenCalled();
  });

  it('una organización también debe aceptar sus condiciones propias', async () => {
    const tx = makeTx();
    const { service } = makeService(tx);

    await expect(
      service.registerOrganization({
        organizationName: 'Org',
        displayName: 'Rep',
        email: 'org@test.local',
        password: 'password123',
        legalAcceptances: PERSON_LEGAL,
      }),
    ).rejects.toMatchObject({ response: { missing: ['org_terms'] } });
  });

  it('rechaza una versión que ya no está vigente', async () => {
    const tx = makeTx();
    const { service } = makeService(tx);

    await expect(
      service.registerPerson({
        displayName: 'Persona',
        email: 'vieja@test.local',
        password: 'password123',
        legalAcceptances: PERSON_LEGAL.map((i) => ({ ...i, version: '2020-01-01' })),
      }),
    ).rejects.toMatchObject({ response: { code: 'LEGAL_VERSION_OUTDATED' } });
  });

  it('registra versión, hash, canal, IP y navegador en la misma transacción', async () => {
    const tx = makeTx();
    const { service } = makeService(tx);

    await service.registerPerson(
      {
        displayName: 'Persona',
        email: 'ok@test.local',
        password: 'password123',
        legalAcceptances: PERSON_LEGAL,
      },
      { ipAddress: '203.0.113.7', userAgent: 'jest' },
    );

    expect(tx.legalAcceptance.createMany).toHaveBeenCalledTimes(1);
    const rows = tx.legalAcceptance.createMany.mock.calls[0][0].data;
    expect(rows.map((r: { documentKey: string }) => r.documentKey).sort()).toEqual(
      [...requiredLegalDocuments('person')].sort(),
    );
    expect(rows[0]).toMatchObject({
      subjectType: 'user',
      channel: 'registration',
      action: 'accepted',
      ipAddress: '203.0.113.7',
      userAgent: 'jest',
    });
    expect(rows[0].documentSha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
