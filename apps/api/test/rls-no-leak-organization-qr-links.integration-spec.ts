import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate para el QR fijo (`organization_qr_links`) y su contador
 * (`organization_qr_scan_days`): una org nunca ve ni escribe los de otra.
 * Conecta como `adoptafacil_app` (no superusuario). Cada nombre lleva
 * "no-leak" para el gate `test:rls`.
 */
const APP_DATABASE_URL =
  process.env.DATABASE_URL_APP ??
  'postgresql://adoptafacil_app:adoptafacil_app@localhost:5433/adoptafacil?schema=public';

async function withOrgContext<T>(
  prisma: PrismaClient,
  organizationId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$executeRaw`SELECT set_config('app.current_org_id', ${organizationId}, true)`;
    return fn(tx);
  });
}

describe('RLS cross-org no-leak (organization_qr_links)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.createMany({
      data: [
        { id: orgA, name: 'Org A' },
        { id: orgB, name: 'Org B' },
      ],
      skipDuplicates: true,
    });
    await withOrgContext(prisma, orgA, (tx) =>
      tx.organizationQrLink.create({ data: { organizationId: orgA, code: 'aaaaaaaa' } }),
    );
    await withOrgContext(prisma, orgB, (tx) =>
      tx.organizationQrLink.create({ data: { organizationId: orgB, code: 'bbbbbbbb' } }),
    );
    await admin.organizationQrScanDay.createMany({
      data: [
        { organizationId: orgA, day: new Date('2026-10-01'), targetKind: 'donate', scans: 3 },
        { organizationId: orgB, day: new Date('2026-10-01'), targetKind: 'donate', scans: 5 },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own QR, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.organizationQrLink.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.organizationId === orgA)).toBe(true);
  });

  it('no-leak: Org B sees only its own QR, never Org A (inverse)', async () => {
    const rows = await withOrgContext(prisma, orgB, (tx) => tx.organizationQrLink.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.organizationId === orgB)).toBe(true);
  });

  it('no-leak: with no tenant context, no QR is visible', async () => {
    expect(await prisma.organizationQrLink.findMany()).toHaveLength(0);
    expect(await prisma.organizationQrScanDay.findMany()).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks writing a QR for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.organizationQrLink.update({
          where: { organizationId: orgB },
          data: { targetKind: 'donate' },
        }),
      ),
    ).rejects.toThrow();
  });

  it('no-leak: each org only reads its own scan counter, and cannot write it', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.organizationQrScanDay.findMany());
    expect(rows.map((r) => r.scans)).toEqual([3]);
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.organizationQrScanDay.create({
          data: { organizationId: orgA, day: new Date('2026-10-02'), targetKind: 'donate' },
        }),
      ),
    ).rejects.toThrow();
  });
});
