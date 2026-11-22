import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { ORG_ROLES, Role } from '@adoptafacil/contracts';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PasswordService } from '../src/core/auth/password.service';
import { TokenService } from '../src/core/auth/token.service';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG } from './support/legal';

/**
 * La matriz de roles, comprobada por HTTP con una cuenta real de cada cargo de
 * una misma organización. Lo esperado sale de `docs/seguridad/matriz-roles-api.md`
 * (que `role-matrix.spec.ts` mantiene igual a los decoradores): así se prueba
 * que lo documentado es lo que de verdad responde la API.
 *
 * - Lecturas: cada cargo con permiso NO recibe 403; cada cargo sin permiso, sí.
 * - Escrituras: solo se prueban los cargos SIN permiso (403 antes de validar el
 *   cuerpo, sin efectos), para no crear datos.
 * - Ningún cargo de organización entra a rutas de plataforma.
 */
const COLUMNS: Role[] = [
  Role.Owner,
  Role.Administrator,
  Role.Operator,
  Role.Veterinarian,
  Role.Volunteer,
  Role.TemporaryCollaborator,
  Role.ReadOnlyAuditor,
  Role.PlatformAdmin,
  Role.PlatformSuperAdmin,
];

function documentedMatrix(): Map<string, Role[]> {
  const doc = readFileSync(
    join(__dirname, '..', '..', '..', 'docs', 'seguridad', 'matriz-roles-api.md'),
    'utf8',
  );
  const matrix = new Map<string, Role[]>();
  for (const line of doc.split('\n')) {
    const match = /^\| `([A-Z]+ [^`]+)` \|(.*)\|$/.exec(line);
    if (!match) continue;
    const cells = match[2].split('|').map((c) => c.trim());
    matrix.set(
      match[1],
      COLUMNS.filter((_, i) => cells[i] === '✓'),
    );
  }
  return matrix;
}

const MATRIX = documentedMatrix();

/** Lecturas representativas de cada área (sin PlanGuard ni banderas). */
const READS = [
  'GET /animals',
  'GET /clinical-reminders',
  'GET /adoptions',
  'GET /campaigns',
  'GET /donations/received',
  'GET /org/ledger',
  'GET /org/reports',
  'GET /org/documents',
  'GET /volunteer-opportunities',
  'GET /org/members',
  'GET /org/invitations',
  'GET /org/signers',
  'GET /org/plan',
  'GET /org/status',
  'GET /platform/dashboard/admin',
];

/** Escrituras de gobierno y de datos: los cargos sin permiso reciben 403. */
const WRITES = [
  'POST /org/invitations',
  'POST /rbac/roles',
  'PUT /org/profile',
  'PUT /portals/theme',
  'POST /animals',
  'POST /campaigns',
  'POST /org/signers',
  'POST /org/status/submit',
];

describe('Role matrix over HTTP (one account per org role)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];
  const tokens = new Map<Role, string>();

  async function memberOf(orgId: string, role: Role): Promise<string> {
    const userId = randomUUID();
    const email = `matrix-${role}-${randomUUID()}@test.local`;
    const passwordHash = await new PasswordService().hash('password-1234');
    await admin.user.create({
      data: {
        id: userId,
        organizationId: orgId,
        accountType: 'organization',
        email,
        displayName: role,
      },
    });
    await admin.authCredential.create({
      data: { userId, organizationId: orgId, accountType: 'organization', email, passwordHash },
    });
    await admin.userRole.create({ data: { organizationId: orgId, userId, role } });
    const issued = await app
      .get(TokenService)
      .issueTokens({ userId, organizationId: orgId, accountType: 'organization', email });
    return issued.accessToken;
  }

  const call = (route: string, token: string) => {
    const [method, path] = route.split(' ');
    const sample = path.replace(/:[a-zA-Z]+/g, randomUUID());
    const req = request(server)[method.toLowerCase() as 'get' | 'post' | 'put' | 'delete'](sample);
    return req.set('Authorization', `Bearer ${token}`).send({});
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: 'Refugio Matriz de Roles',
        displayName: 'Propietaria',
        email: `matrix-owner-${randomUUID()}@test.local`,
        password: 'password-1234',
      })
      .expect(201);
    const orgId = res.body.user.organizationId as string;
    createdOrgIds.push(orgId);
    // Aprobada, como una organización real en operación.
    await admin.organization.update({ where: { id: orgId }, data: { status: 'approved' } });
    tokens.set(Role.Owner, res.body.tokens.accessToken);
    for (const role of ORG_ROLES.filter((r) => r !== Role.Owner)) {
      tokens.set(role, await memberOf(orgId, role));
    }
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('every probed route is in the documented matrix', () => {
    for (const route of [...READS, ...WRITES]) {
      expect(MATRIX.has(route)).toBe(true);
    }
  });

  describe.each(READS)('%s', (route) => {
    it.each([...ORG_ROLES])('as %s answers what the matrix says', async (role) => {
      const allowed = MATRIX.get(route)?.includes(role) ?? false;
      const res = await call(route, tokens.get(role) as string);
      if (allowed) {
        expect([401, 403]).not.toContain(res.status);
      } else {
        expect(res.status).toBe(403);
      }
    });
  });

  describe.each(WRITES)('%s', (route) => {
    it('refuses every org role the matrix does not list (403, nothing written)', async () => {
      const denied = ORG_ROLES.filter((role) => !(MATRIX.get(route)?.includes(role) ?? false));
      expect(denied.length).toBeGreaterThan(0);
      for (const role of denied) {
        const res = await call(route, tokens.get(role) as string);
        expect({ role, status: res.status }).toEqual({ role, status: 403 });
      }
    });
  });

  it('no org role reaches a platform route', async () => {
    for (const role of ORG_ROLES) {
      const res = await call('GET /platform/dashboard/admin', tokens.get(role) as string);
      expect(res.status).toBe(403);
    }
  });
});
