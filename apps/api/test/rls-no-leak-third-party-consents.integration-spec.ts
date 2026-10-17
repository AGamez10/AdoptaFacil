import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate para `third_party_consents` (M13). El consentimiento dado a la
 * Org A nunca es visible ni creable bajo el contexto de la Org B, la
 * organización NO puede escribir (solo lee) y el historial es inmutable: solo
 * se revoca por la función de la persona. Conecta como `adoptafacil_app`.
 */
const APP_DATABASE_URL =
  process.env.DATABASE_URL_APP ??
  'postgresql://adoptafacil_app:adoptafacil_app@localhost:5433/adoptafacil?schema=public';
const TEXT_HASH = 'a'.repeat(64);

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

describe('RLS cross-org no-leak (consentimiento de terceros)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();
  const person = randomUUID();
  const stranger = randomUUID();
  let consentA = '';

  beforeAll(async () => {
    for (const [id, label] of [
      [orgA, 'Org A consent'],
      [orgB, 'Org B consent'],
    ] as const) {
      await admin.organization.create({ data: { id, name: label } });
    }
    for (const [id, orgId] of [
      [person, orgA],
      [stranger, orgB],
    ] as const) {
      await admin.user.create({
        data: {
          id,
          organizationId: orgId,
          accountType: 'person',
          email: `consent-${id}@test.local`,
          displayName: 'Persona de prueba',
        },
      });
    }
    // La persona se inscribe como voluntaria SOLO en la Org A.
    const opp = await admin.volunteerOpportunity.create({
      data: {
        organizationId: orgA,
        title: 'Paseo',
        category: 'cuidado',
        startDate: new Date(),
        endDate: new Date(Date.now() + 86_400_000),
        location: 'Medellín',
      },
    });
    await admin.volunteerEnrollment.create({
      data: {
        organizationId: orgA,
        opportunityId: opp.id,
        volunteerUserId: person,
        volunteerName: 'Persona de prueba',
        volunteerEmail: 'p@test.local',
        appliesToStudentService: false,
        status: 'accepted',
      },
    });
    const rows = await prisma.$queryRaw<Array<{ id: string | null }>>`
      SELECT grant_third_party_consent(${person}::uuid, ${orgA}::uuid, 'org_report_identification',
        '2026-10-10', ${TEXT_HASH}, 'preferences') AS id`;
    consentA = rows[0]?.id ?? '';
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('otorgar creó un consentimiento vigente en la Org A', () => {
    expect(consentA).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('no-leak: la Org B no ve el consentimiento de la Org A, ni por id exacto', async () => {
    const [list, byId] = await withOrgContext(prisma, orgB, (tx) =>
      Promise.all([
        tx.thirdPartyConsent.findMany(),
        tx.thirdPartyConsent.findUnique({ where: { id: consentA } }),
      ]),
    );
    expect(list).toEqual([]);
    expect(byId).toBeNull();
    const own = await withOrgContext(prisma, orgA, (tx) => tx.thirdPartyConsent.findMany());
    expect(own).toHaveLength(1);
  });

  it('la organización solo lee: ni inserta, ni actualiza, ni borra, ni siquiera en su propio contexto', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.thirdPartyConsent.create({
          data: {
            organizationId: orgA,
            subjectUserId: person,
            purpose: 'org_report_identification',
            textVersion: 'x',
            textSha256: TEXT_HASH,
            channel: 'preferences',
          },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.thirdPartyConsent.update({ where: { id: consentA }, data: { revokedAt: new Date() } }),
      ),
    ).rejects.toThrow();
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.thirdPartyConsent.delete({ where: { id: consentA } }),
      ),
    ).rejects.toThrow();
  });

  it('una persona sin relación con la organización no puede otorgarle consentimiento', async () => {
    const rows = await prisma.$queryRaw<Array<{ id: string | null }>>`
      SELECT grant_third_party_consent(${stranger}::uuid, ${orgA}::uuid, 'org_report_identification',
        '2026-10-10', ${TEXT_HASH}, 'preferences') AS id`;
    expect(rows[0]?.id).toBeNull();
    const none = await admin.thirdPartyConsent.count({ where: { subjectUserId: stranger } });
    expect(none).toBe(0);
  });

  it('otorgar dos veces es idempotente; revocar conserva el historial y no se reactiva', async () => {
    const again = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT grant_third_party_consent(${person}::uuid, ${orgA}::uuid, 'org_report_identification',
        '2026-10-10', ${TEXT_HASH}, 'preferences') AS id`;
    expect(again[0]?.id).toBe(consentA);

    const revoked = await prisma.$queryRaw<Array<{ revoked: boolean }>>`
      SELECT revoke_third_party_consent(${person}::uuid, ${orgA}::uuid, 'org_report_identification') AS revoked`;
    expect(revoked[0]?.revoked).toBe(true);
    const twice = await prisma.$queryRaw<Array<{ revoked: boolean }>>`
      SELECT revoke_third_party_consent(${person}::uuid, ${orgA}::uuid, 'org_report_identification') AS revoked`;
    expect(twice[0]?.revoked).toBe(false);

    const row = await admin.thirdPartyConsent.findUniqueOrThrow({ where: { id: consentA } });
    expect(row.revokedAt).not.toBeNull();
    // Ni el superusuario puede reactivarlo ni borrarlo (trigger).
    await expect(
      admin.thirdPartyConsent.update({ where: { id: consentA }, data: { revokedAt: null } }),
    ).rejects.toThrow();
    await expect(admin.thirdPartyConsent.delete({ where: { id: consentA } })).rejects.toThrow();

    // Un consentimiento nuevo es otra fila: el historial queda.
    const fresh = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT grant_third_party_consent(${person}::uuid, ${orgA}::uuid, 'org_report_identification',
        '2026-10-10', ${TEXT_HASH}, 'preferences') AS id`;
    expect(fresh[0]?.id).not.toBe(consentA);
    expect(await admin.thirdPartyConsent.count({ where: { subjectUserId: person } })).toBe(2);
  });
});
