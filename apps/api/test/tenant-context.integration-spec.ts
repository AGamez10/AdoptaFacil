import { randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { NextFunction, Request, Response } from 'express';
import { TenantContextMiddleware } from '../src/core/tenant/tenant-context.middleware';
import { TenantContextService } from '../src/core/tenant/tenant-context.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Integration test for the per-request tenant context: the middleware sets the
 * organization for the request, PrismaService.withTenant runs queries under it,
 * and the underlying `app.current_org_id` GUC is transaction-local — it never
 * leaks between transactions or requests. Exercises the REAL `org_members`
 * table as the non-superuser app role, so RLS is genuinely in force.
 *
 * The tenant comes ONLY from a valid access token (AF-009): an `x-org-id`
 * header, with or without a token, never establishes or overrides it.
 */
function fakeRequest(headers: Record<string, string>): Request {
  return { headers } as unknown as Request;
}

const NOOP_RESPONSE = {} as Response;

const jwt = new JwtService({ secret: 'tenant-context-test-secret' });

function bearer(org: string): Record<string, string> {
  const token = jwt.sign({ sub: randomUUID(), org, typ: 'organization', email: 't@ctx.test' });
  return { authorization: `Bearer ${token}` };
}

describe('Tenant context middleware + PrismaService.withTenant (org_members)', () => {
  const tenant = new TenantContextService();
  const prisma = new PrismaService(tenant);
  const middleware = new TenantContextMiddleware(tenant, jwt);
  const orgA = randomUUID();
  const orgB = randomUUID();

  beforeAll(async () => {
    await prisma.onModuleInit();
    await prisma.organization.createMany({
      data: [
        { id: orgA, name: 'Org A' },
        { id: orgB, name: 'Org B' },
      ],
      skipDuplicates: true,
    });
    await prisma.withOrgContext(orgA, (tx) =>
      tx.orgMember.create({
        data: { organizationId: orgA, email: 'a@ctx.test', displayName: 'A', role: 'owner' },
      }),
    );
    await prisma.withOrgContext(orgB, (tx) =>
      tx.orgMember.create({
        data: { organizationId: orgB, email: 'b@ctx.test', displayName: 'B', role: 'owner' },
      }),
    );
  });

  afterAll(async () => {
    await prisma.withOrgContext(orgA, (tx) => tx.orgMember.deleteMany({}));
    await prisma.withOrgContext(orgB, (tx) => tx.orgMember.deleteMany({}));
    await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    await prisma.onModuleDestroy();
  });

  it('TenantContextService.run sets the context and clears it afterwards', () => {
    expect(tenant.getOrganizationId()).toBeUndefined();
    const inside = tenant.run({ organizationId: orgA }, () => tenant.getOrganizationId());
    expect(inside).toBe(orgA);
    expect(tenant.getOrganizationId()).toBeUndefined();
  });

  it('middleware establishes the context from a valid access token, then resets it', () => {
    let seen: string | undefined;
    const next: NextFunction = () => {
      seen = tenant.getOrganizationId();
    };
    middleware.use(fakeRequest(bearer(orgA)), NOOP_RESPONSE, next);
    expect(seen).toBe(orgA);
    // Context is bound to the request's async chain and gone once it ends.
    expect(tenant.getOrganizationId()).toBeUndefined();
  });

  it('middleware leaves no context without a valid token (missing, forged or malformed)', () => {
    let seen: string | undefined = 'sentinel';
    const next: NextFunction = () => {
      seen = tenant.getOrganizationId();
    };
    middleware.use(fakeRequest({}), NOOP_RESPONSE, next);
    expect(seen).toBeUndefined();

    seen = 'sentinel';
    const forged = new JwtService({ secret: 'attacker' }).sign({ sub: 'x', org: orgA });
    middleware.use(fakeRequest({ authorization: `Bearer ${forged}` }), NOOP_RESPONSE, next);
    expect(seen).toBeUndefined();

    seen = 'sentinel';
    middleware.use(fakeRequest(bearer('not-a-uuid')), NOOP_RESPONSE, next);
    expect(seen).toBeUndefined();
  });

  it('AF-009: an x-org-id header never sets the tenant on its own', () => {
    let seen: string | undefined = 'sentinel';
    const next: NextFunction = () => {
      seen = tenant.getOrganizationId();
    };
    middleware.use(fakeRequest({ 'x-org-id': orgA }), NOOP_RESPONSE, next);
    expect(seen).toBeUndefined();
  });

  it('AF-009: an x-org-id header never overrides the tenant of the token', () => {
    let seen: string | undefined;
    const next: NextFunction = () => {
      seen = tenant.getOrganizationId();
    };
    middleware.use(fakeRequest({ ...bearer(orgA), 'x-org-id': orgB }), NOOP_RESPONSE, next);
    expect(seen).toBe(orgA);
  });

  it('withTenant runs queries scoped to the request organization', async () => {
    const rows = await new Promise<Array<{ organizationId: string; email: string }>>(
      (resolve, reject) => {
        const next: NextFunction = () => {
          prisma.withTenant((tx) => tx.orgMember.findMany()).then(resolve, reject);
        };
        middleware.use(fakeRequest(bearer(orgA)), NOOP_RESPONSE, next);
      },
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.organizationId === orgA)).toBe(true);
    expect(rows.some((row) => row.email === 'b@ctx.test')).toBe(false);
  });

  it('withTenant rejects when the request has no tenant context', async () => {
    await expect(prisma.withTenant((tx) => tx.orgMember.findMany())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('the app.current_org_id GUC is transaction-local (no leak after withTenant)', async () => {
    // Run a scoped query, then a context-less one on the same client. If SET
    // LOCAL leaked past its transaction this would return rows; it must not.
    await new Promise<void>((resolve, reject) => {
      const next: NextFunction = () => {
        prisma.withTenant((tx) => tx.orgMember.findMany()).then(() => resolve(), reject);
      };
      middleware.use(fakeRequest(bearer(orgA)), NOOP_RESPONSE, next);
    });
    const leaked = await prisma.orgMember.findMany();
    expect(leaked).toHaveLength(0);
  });
});
