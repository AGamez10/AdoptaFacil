import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate extended to las tablas de firma con consentimiento (M13):
 * `org_signer_designations`, `org_report_approvals` y `org_report_policies`.
 * Un firmante, una aprobación o una política de la Org A nunca es visible ni
 * creable bajo el contexto de la Org B. `org_report_approvals` es además
 * APPEND-ONLY. Conecta como el rol NO-superusuario `adoptafacil_app`.
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

describe('RLS cross-org no-leak (firma con consentimiento)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();
  let reportA = '';
  let approvalA = '';
  let designationA = '';

  async function seedOrg(orgId: string, userId: string, label: string) {
    await admin.organization.create({ data: { id: orgId, name: label } });
    await admin.user.create({
      data: {
        id: userId,
        organizationId: orgId,
        accountType: 'organization',
        email: `sign-${orgId}@test.local`,
        displayName: label,
      },
    });
    const rep = await admin.legalRepresentative.create({
      data: {
        organizationId: orgId,
        memberId: userId,
        role: 'legal_representative',
        fullName: label,
        documentType: 'cedula_ciudadania',
        documentNumber: '1',
        position: 'Representante legal',
        signatureFileRef: 'k',
        signatureHash: 'h',
        signedAt: new Date(),
      },
    });
    const report = await withOrgContext(prisma, orgId, (tx) =>
      tx.orgReport.create({
        data: {
          organizationId: orgId,
          kind: 'donations',
          code: `ADF-REP-2026-${randomUUID()
            .replace(/[^A-Z2-9]/gi, '')
            .toUpperCase()
            .slice(0, 8)
            .padEnd(8, 'X')}`,
          periodStart: new Date('2026-09-01T00:00:00Z'),
          periodEnd: new Date('2026-09-30T00:00:00Z'),
          legalEffect: 'signed',
          payload: { organization: { name: label } },
          summary: { rowCount: 0 },
          contentHash: randomUUID(),
          generatedByUserId: userId,
        },
      }),
    );
    const approval = await withOrgContext(prisma, orgId, (tx) =>
      tx.orgReportApproval.create({
        data: {
          organizationId: orgId,
          reportId: report.id,
          signerRole: 'legal_representative',
          signerUserId: userId,
          legalRepresentativeId: rep.id,
          signatureHash: 'h',
          contentHash: report.contentHash,
          decision: 'approved',
        },
      }),
    );
    const designation = await withOrgContext(prisma, orgId, (tx) =>
      tx.orgSignerDesignation.create({
        data: {
          organizationId: orgId,
          userId,
          role: 'accountant',
          designatedByUserId: userId,
        },
      }),
    );
    await withOrgContext(prisma, orgId, (tx) =>
      tx.orgReportPolicy.create({
        data: {
          organizationId: orgId,
          kind: 'donations',
          requiredRoles: ['legal_representative', 'accountant'],
          updatedByUserId: userId,
        },
      }),
    );
    return { report, approval, designation };
  }

  beforeAll(async () => {
    await prisma.$connect();
    const a = await seedOrg(orgA, userA, 'Org A');
    reportA = a.report.id;
    approvalA = a.approval.id;
    designationA = a.designation.id;
    await seedOrg(orgB, userB, 'Org B');
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org B sees none of Org A designations, approvals or policies, even by exact id', async () => {
    const [designations, approvals, policies] = await withOrgContext(prisma, orgB, (tx) =>
      Promise.all([
        tx.orgSignerDesignation.findMany(),
        tx.orgReportApproval.findMany(),
        tx.orgReportPolicy.findMany(),
      ]),
    );
    expect(designations.every((d) => d.organizationId === orgB)).toBe(true);
    expect(approvals.every((a) => a.organizationId === orgB)).toBe(true);
    expect(policies.every((p) => p.organizationId === orgB)).toBe(true);
    expect(designations.length + approvals.length + policies.length).toBe(3);
    const byId = await withOrgContext(prisma, orgB, (tx) =>
      Promise.all([
        tx.orgSignerDesignation.findUnique({ where: { id: designationA } }),
        tx.orgReportApproval.findUnique({ where: { id: approvalA } }),
      ]),
    );
    expect(byId).toEqual([null, null]);
  });

  it('no-leak: with no tenant context nothing is visible', async () => {
    expect(await prisma.orgSignerDesignation.findMany()).toHaveLength(0);
    expect(await prisma.orgReportApproval.findMany()).toHaveLength(0);
    expect(await prisma.orgReportPolicy.findMany()).toHaveLength(0);
  });

  it('no-leak: under Org B context an approval or designation for Org A cannot be created', async () => {
    await expect(
      withOrgContext(prisma, orgB, (tx) =>
        tx.orgReportApproval.create({
          data: {
            organizationId: orgA,
            reportId: reportA,
            signerRole: 'accountant',
            signerUserId: userA,
            legalRepresentativeId: randomUUID(),
            signatureHash: 'h',
            contentHash: 'c',
            decision: 'approved',
          },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      withOrgContext(prisma, orgB, (tx) =>
        tx.orgSignerDesignation.create({
          data: {
            organizationId: orgA,
            userId: userA,
            role: 'fiscal_reviewer',
            designatedByUserId: userA,
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('no-leak: Org B cannot revoke Org A designation (the row does not exist for it)', async () => {
    const res = await withOrgContext(prisma, orgB, (tx) =>
      tx.orgSignerDesignation.updateMany({
        where: { id: designationA },
        data: { revokedAt: new Date(), revokedByUserId: userB },
      }),
    );
    expect(res.count).toBe(0);
  });

  it('org_report_approvals is append-only: the app role and a superuser cannot change or delete a decision', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.orgReportApproval.update({ where: { id: approvalA }, data: { decision: 'rejected' } }),
      ),
    ).rejects.toThrow();
    await expect(
      admin.orgReportApproval.update({ where: { id: approvalA }, data: { decision: 'rejected' } }),
    ).rejects.toThrow(/append-only/);
    await expect(admin.orgReportApproval.delete({ where: { id: approvalA } })).rejects.toThrow(
      /append-only/,
    );
  });

  it('one decision per seat per report, and one active signer per person and per seat', async () => {
    const rep = await admin.legalRepresentative.findFirstOrThrow({
      where: { organizationId: orgA },
    });
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.orgReportApproval.create({
          data: {
            organizationId: orgA,
            reportId: reportA,
            signerRole: 'legal_representative',
            signerUserId: userA,
            legalRepresentativeId: rep.id,
            signatureHash: 'h',
            contentHash: 'c',
            decision: 'rejected',
          },
        }),
      ),
    ).rejects.toThrow(/Unique constraint/);

    const other = randomUUID();
    await admin.user.create({
      data: {
        id: other,
        organizationId: orgA,
        accountType: 'organization',
        email: `sign-other-${other}@test.local`,
        displayName: 'Otra persona',
      },
    });
    // El cargo de contador ya tiene una persona vigente.
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.orgSignerDesignation.create({
          data: {
            organizationId: orgA,
            userId: other,
            role: 'accountant',
            designatedByUserId: userA,
          },
        }),
      ),
    ).rejects.toThrow(/Unique constraint/);
    // Y la persona vigente no puede tener un segundo cargo.
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.orgSignerDesignation.create({
          data: {
            organizationId: orgA,
            userId: userA,
            role: 'fiscal_reviewer',
            designatedByUserId: userA,
          },
        }),
      ),
    ).rejects.toThrow(/Unique constraint/);
  });
});
