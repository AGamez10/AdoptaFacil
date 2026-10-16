import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Role } from '@adoptafacil/contracts';
import type { AuditService } from '../../core/audit/audit.service';
import { ROLES_KEY } from '../../core/rbac/roles.decorator';
import { REQUIRED_FEATURES_KEY } from '../../core/features';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { EpaycoConnectController } from './epayco-connect.controller';
import { connectEpaycoAccountSchema } from './epayco-connect.schemas';
import { EpaycoConnectService, loadEpaycoCollector } from './epayco-connect.service';
import { decryptEpaycoSecret, loadEpaycoKeysEncryptionKey } from './epayco-keys-crypto';

const KEY = loadEpaycoKeysEncryptionKey();
const INPUT = {
  custId: '123456',
  pKey: 'p-key-secret-value',
  publicKey: 'public-key-wxyz',
  privateKey: 'private-key-secret-value',
};

function harness() {
  const tenant = new TenantContextService();
  const upsert = jest.fn(async (args: { create: Record<string, string> }) => ({
    ...args.create,
    connectedAt: new Date('2026-10-15T12:00:00.000Z'),
  }));
  const findUnique = jest.fn();
  const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
  const recordWithTx = jest.fn().mockResolvedValue(undefined);
  const tx = { organizationEpaycoAccount: { upsert, findUnique, deleteMany } };
  const withOrgContext = jest.fn((_orgId: string, fn: (t: unknown) => unknown) => fn(tx));
  const prisma = { withOrgContext } as unknown as PrismaService;
  const audit = { recordWithTx } as unknown as AuditService;
  const service = new EpaycoConnectService(prisma, tenant, audit, KEY);
  const asOrg = <T>(fn: () => T) => tenant.run({ organizationId: 'org-1' }, fn);
  return { service, upsert, findUnique, deleteMany, recordWithTx, withOrgContext, prisma, asOrg };
}

describe('EpaycoConnectController — RBAC metadata (deny-by-default)', () => {
  it('only Owner/Administrator, behind the payments feature', () => {
    expect(Reflect.getMetadata(ROLES_KEY, EpaycoConnectController)).toEqual([
      Role.Owner,
      Role.Administrator,
    ]);
    expect(Reflect.getMetadata(REQUIRED_FEATURES_KEY, EpaycoConnectController)).toEqual([
      'payments',
    ]);
    const guards = Reflect.getMetadata('__guards__', EpaycoConnectController) as unknown[];
    expect(guards.map((g) => (g as { name: string }).name)).toEqual(['JwtAuthGuard', 'RolesGuard']);
  });
});

describe('connectEpaycoAccountSchema', () => {
  it('trims and accepts valid keys', () => {
    expect(connectEpaycoAccountSchema.parse({ ...INPUT, custId: ' 123456 ' }).custId).toBe(
      '123456',
    );
  });

  it.each([
    [{ custId: 'abc' }],
    [{ pKey: '' }],
    [{ privateKey: 'x'.repeat(201) }],
    [{ publicKey: 'has space' }],
    [{ extra: 'nope' }],
  ])('rejects %j', (patch) => {
    expect(connectEpaycoAccountSchema.safeParse({ ...INPUT, ...patch }).success).toBe(false);
  });
});

describe('EpaycoConnectService', () => {
  it('encrypts the secrets, audits only custId and never returns a secret', async () => {
    const h = harness();
    const view = await h.asOrg(() => h.service.connect('user-1', INPUT));

    expect(view).toEqual({
      connected: true,
      custId: '123456',
      publicKeyHint: 'wxyz',
      connectedAt: '2026-10-15T12:00:00.000Z',
    });
    expect(h.withOrgContext).toHaveBeenCalledWith('org-1', expect.any(Function));
    const saved = h.upsert.mock.calls[0][0].create;
    expect(saved.pKeyEnc).not.toContain(INPUT.pKey);
    expect(saved.privateKeyEnc).not.toContain(INPUT.privateKey);
    expect(decryptEpaycoSecret(saved.pKeyEnc, KEY)).toBe(INPUT.pKey);
    expect(decryptEpaycoSecret(saved.privateKeyEnc, KEY)).toBe(INPUT.privateKey);

    expect(h.recordWithTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        organizationId: 'org-1',
        action: 'payment_gateway.epayco_connected',
        metadata: { custId: '123456' },
      }),
    );
    const serialized = JSON.stringify([view, h.recordWithTx.mock.calls]);
    for (const secret of [INPUT.pKey, INPUT.privateKey, INPUT.publicKey]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('maps a cust_id already used by another org to a generic 409', async () => {
    const h = harness();
    h.upsert.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.22.0',
        meta: { target: ['cust_id'] },
      }),
    );
    const error = await h.asOrg(() => h.service.connect('user-1', INPUT)).catch((e) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toBe(
      'Esta cuenta de ePayco ya está conectada a otra organización.',
    );
    expect(h.recordWithTx).not.toHaveBeenCalled();
  });

  it('refuses without a tenant context', async () => {
    const h = harness();
    await expect(h.service.connect('user-1', INPUT)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(h.service.getStatus()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('status: not connected / connected without secrets', async () => {
    const h = harness();
    h.findUnique.mockResolvedValueOnce(null);
    await expect(h.asOrg(() => h.service.getStatus())).resolves.toEqual({ connected: false });
    h.findUnique.mockResolvedValueOnce({
      custId: '123456',
      publicKey: 'public-key-wxyz',
      connectedAt: new Date('2026-10-15T12:00:00.000Z'),
    });
    const view = await h.asOrg(() => h.service.getStatus());
    expect(view).toEqual({
      connected: true,
      custId: '123456',
      publicKeyHint: 'wxyz',
      connectedAt: '2026-10-15T12:00:00.000Z',
    });
    expect(h.findUnique.mock.calls[1][0].select).toEqual({
      custId: true,
      publicKey: true,
      connectedAt: true,
    });
  });

  it('disconnect deletes + audits custId; idempotent when nothing is connected', async () => {
    const h = harness();
    h.findUnique.mockResolvedValueOnce({ custId: '123456' });
    await h.asOrg(() => h.service.disconnect('user-1'));
    expect(h.deleteMany).toHaveBeenCalledWith({ where: { organizationId: 'org-1' } });
    expect(h.recordWithTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'payment_gateway.epayco_disconnected',
        metadata: { custId: '123456' },
      }),
    );

    const h2 = harness();
    h2.findUnique.mockResolvedValueOnce(null);
    await h2.asOrg(() => h2.service.disconnect('user-1'));
    expect(h2.deleteMany).not.toHaveBeenCalled();
    expect(h2.recordWithTx).not.toHaveBeenCalled();
  });

  it('loadEpaycoCollector decrypts the keys under the org context', async () => {
    const h = harness();
    await h.asOrg(() => h.service.connect('user-1', INPUT));
    const saved = h.upsert.mock.calls[0][0].create;
    h.findUnique.mockResolvedValueOnce(saved);
    await expect(loadEpaycoCollector(h.prisma, KEY, 'org-1')).resolves.toEqual(INPUT);
    expect(h.withOrgContext).toHaveBeenLastCalledWith('org-1', expect.any(Function));
    h.findUnique.mockResolvedValueOnce(null);
    await expect(loadEpaycoCollector(h.prisma, KEY, 'org-2')).resolves.toBeUndefined();
  });
});
