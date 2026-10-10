import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate para `legal_acceptances` (prueba de la autorización, Ley 1581):
 * la aceptación de un usuario de la Org A nunca es visible bajo el contexto de
 * la Org B, y la tabla es append-only para el rol de la app. Conecta como el rol
 * NO superusuario `adoptafacil_app`; cada prueba lleva "no-leak" en el nombre
 * para que el gate `test:rls` la ejecute.
 */
const APP_DATABASE_URL =
  process.env.DATABASE_URL_APP ??
  'postgresql://adoptafacil_app:adoptafacil_app@localhost:5433/adoptafacil?schema=public';

const SHA = 'a'.repeat(64);

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

function row(organizationId: string, userId: string) {
  return {
    organizationId,
    userId,
    subjectType: 'user',
    subjectId: userId,
    documentKey: 'terms',
    documentVersion: '2026-10-09',
    documentSha256: SHA,
    channel: 'registration',
  };
}

describe('RLS cross-org no-leak (legal_acceptances)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();

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
      tx.legalAcceptance.create({ data: row(orgA, userA) }),
    );
    await withOrgContext(prisma, orgB, (tx) =>
      tx.legalAcceptance.create({ data: row(orgB, userB) }),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own acceptances, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.legalAcceptance.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('no-leak: Org B sees only its own acceptances, never Org A (inverse)', async () => {
    const rows = await withOrgContext(prisma, orgB, (tx) => tx.legalAcceptance.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgB)).toBe(true);
  });

  it('no-leak: with no tenant context, no acceptances are visible', async () => {
    expect(await prisma.legalAcceptance.findMany()).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks writing an acceptance for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) => tx.legalAcceptance.create({ data: row(orgB, userA) })),
    ).rejects.toThrow();
  });

  it('no-leak: an acceptance can never be edited or deleted (append-only, app role)', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.legalAcceptance.updateMany({ data: { documentVersion: '1999-01-01' } }),
      ),
    ).rejects.toThrow();
    await expect(
      withOrgContext(prisma, orgA, (tx) => tx.legalAcceptance.deleteMany()),
    ).rejects.toThrow();
  });

  it('no-leak: not even the superuser can rewrite an acceptance (trigger)', async () => {
    await expect(
      admin.$executeRawUnsafe(
        `UPDATE legal_acceptances SET document_version = '1999-01-01' WHERE organization_id = $1::uuid`,
        orgA,
      ),
    ).rejects.toThrow(/append-only/);
  });
});
