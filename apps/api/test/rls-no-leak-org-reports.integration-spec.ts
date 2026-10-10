import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate extended to `org_reports` (M13): un reporte sellado pertenece a
 * una organización y nunca debe ser visible — ni creable — bajo el contexto de
 * otra. Además es APPEND-ONLY: ni el rol de la app ni el superusuario pueden
 * modificarlo o borrarlo. Conecta como el rol NO-superusuario
 * `adoptafacil_app`. Cada prueba contiene "no-leak" para el gate `test:rls`.
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

function reportData(organizationId: string, userId: string, secret: string) {
  return {
    organizationId,
    kind: 'donations',
    code: `ADF-REP-2026-${randomUUID()
      .replace(/[^A-Z2-9]/gi, '')
      .toUpperCase()
      .slice(0, 8)
      .padEnd(8, 'X')}`,
    periodStart: new Date('2026-09-01T00:00:00Z'),
    periodEnd: new Date('2026-09-30T00:00:00Z'),
    legalEffect: 'informative',
    payload: { organization: { name: secret }, rows: [{ donor: secret }] },
    summary: { rowCount: 1 },
    contentHash: randomUUID(),
    generatedByUserId: userId,
  };
}

describe('RLS cross-org no-leak (org_reports)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();
  let reportAId = '';

  beforeAll(async () => {
    await prisma.$connect();
    await admin.organization.createMany({
      data: [
        { id: orgA, name: 'Org A' },
        { id: orgB, name: 'Org B' },
      ],
      skipDuplicates: true,
    });
    await admin.user.createMany({
      data: [
        {
          id: userA,
          organizationId: orgA,
          accountType: 'organization',
          email: `rep-a-${orgA}@test.local`,
          displayName: 'Owner A',
        },
        {
          id: userB,
          organizationId: orgB,
          accountType: 'organization',
          email: `rep-b-${orgB}@test.local`,
          displayName: 'Owner B',
        },
      ],
      skipDuplicates: true,
    });
    const a = await withOrgContext(prisma, orgA, (tx) =>
      tx.orgReport.create({ data: reportData(orgA, userA, 'secret-A') }),
    );
    reportAId = a.id;
    await withOrgContext(prisma, orgB, (tx) =>
      tx.orgReport.create({ data: reportData(orgB, userB, 'secret-B') }),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own reports, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.orgReport.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.organizationId === orgA)).toBe(true);
    expect(JSON.stringify(rows)).not.toContain('secret-B');
  });

  it('no-leak: Org B sees only its own reports, never Org A (inverse)', async () => {
    const rows = await withOrgContext(prisma, orgB, (tx) => tx.orgReport.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.organizationId === orgB)).toBe(true);
    expect(JSON.stringify(rows)).not.toContain('secret-A');
  });

  it('no-leak: Org B cannot read Org A report even by its exact id', async () => {
    const row = await withOrgContext(prisma, orgB, (tx) =>
      tx.orgReport.findUnique({ where: { id: reportAId } }),
    );
    expect(row).toBeNull();
  });

  it('no-leak: with no tenant context, no reports are visible', async () => {
    expect(await prisma.orgReport.findMany()).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks creating a report for another org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.orgReport.create({ data: reportData(orgB, userA, 'x') }),
      ),
    ).rejects.toThrow();
  });

  it('no-leak: a sealed report is append-only (no UPDATE/DELETE, even as superuser)', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.orgReport.update({ where: { id: reportAId }, data: { legalEffect: 'certified' } }),
      ),
    ).rejects.toThrow();
    await expect(
      withOrgContext(prisma, orgA, (tx) => tx.orgReport.delete({ where: { id: reportAId } })),
    ).rejects.toThrow();
    await expect(
      admin.$executeRawUnsafe(
        `UPDATE org_reports SET legal_effect = 'certified' WHERE id = $1::uuid`,
        reportAId,
      ),
    ).rejects.toThrow(/append-only/);
  });
});
