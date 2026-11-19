import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PlansService } from '../src/core/plans/plans.service';
import {
  PortalDnsLookup,
  PortalDomainService,
  evaluatePortalDns,
} from '../src/modules/portals/portal-domain.service';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG } from './support/legal';
import { approveTestOrganization } from './support/organization-status';

const TARGET = 'portales.adoptafacil.test';
const IPV4 = '203.0.113.10';

/** DNS simulado: lo que "ve el mundo" por nombre. */
class FakeDns {
  txtRecords = new Map<string, string[]>();
  cnameRecords = new Map<string, string[]>();
  aRecords = new Map<string, string[]>();
  fail = false;
  async txt(name: string) {
    if (this.fail) throw Object.assign(new Error('SERVFAIL'), { code: 'ESERVFAIL' });
    return this.txtRecords.get(name) ?? [];
  }
  async cname(name: string) {
    if (this.fail) throw Object.assign(new Error('SERVFAIL'), { code: 'ESERVFAIL' });
    return this.cnameRecords.get(name) ?? [];
  }
  async a(name: string) {
    if (this.fail) throw Object.assign(new Error('SERVFAIL'), { code: 'ESERVFAIL' });
    return this.aRecords.get(name) ?? [];
  }
}

/**
 * Dominio propio del portal (Pro): la organización compra su dominio, crea un
 * CNAME (o A) y un TXT, y AdoptaFácil lo verifica. Solo un dominio verificado
 * de una organización con el plan vigente se sirve y obtiene HTTPS (Caddy
 * pregunta a `/public/portal-domains/ask`). Nadie puede bloquear el dominio
 * de otro pidiéndolo primero.
 */
describe('Dominio propio del portal (pedir, verificar por DNS, servir, suspender, quitar)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let plans: PlansService;
  let service: PortalDomainService;
  const dns = new FakeDns();
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];
  const suffix = randomUUID().slice(0, 8);
  const domain = `www.refugio-${suffix}.org`;
  let ownerA = '';
  let ownerB = '';
  let orgA = '';
  const slugA = `dom-a-${suffix}`;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const setEnforced = (value: boolean) =>
    Object.defineProperty(plans, 'enforced', { value, configurable: true });

  async function register(name: string): Promise<{ token: string; orgId: string }> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: name,
        displayName: 'Owner',
        email: `domain-${randomUUID()}@test.local`,
        password: 'password-domain-123',
      })
      .expect(201);
    await approveTestOrganization(admin, res.body.user.organizationId);
    createdOrgIds.push(res.body.user.organizationId);
    return { token: res.body.tokens.accessToken, orgId: res.body.user.organizationId };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PortalDnsLookup)
      .useValue(dns)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    plans = app.get(PlansService);
    service = app.get(PortalDomainService);
    Object.defineProperty(service, 'target', { value: TARGET, configurable: true });
    Object.defineProperty(service, 'ipv4', { value: IPV4, configurable: true });

    const a = await register('Refugio Dominio A');
    ownerA = a.token;
    orgA = a.orgId;
    await request(server).put('/org/profile').set(auth(ownerA)).send({ slug: slugA }).expect(200);
    ownerB = (await register('Refugio Dominio B')).token;
  });

  afterEach(() => {
    setEnforced(false);
    dns.fail = false;
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('sin la configuración de la plataforma dice "aún no disponible" y no deja pedirlo', async () => {
    Object.defineProperty(service, 'target', { value: undefined, configurable: true });
    try {
      const view = await request(server).get('/org/portal/domain').set(auth(ownerA)).expect(200);
      expect(view.body.state).toBe('unavailable');
      await request(server)
        .put('/org/portal/domain')
        .set(auth(ownerA))
        .send({ domain })
        .expect(503);
    } finally {
      Object.defineProperty(service, 'target', { value: TARGET, configurable: true });
    }
  });

  it('sin un plan que lo incluya responde PLAN_REQUIRED (se ofrece Pro)', async () => {
    setEnforced(true);
    Object.defineProperty(plans, 'promoEndsAt', { value: null, configurable: true });
    Object.defineProperty(plans, 'trialDays', { value: 0, configurable: true });
    const view = await request(server).get('/org/portal/domain').set(auth(ownerA)).expect(200);
    expect(view.body).toMatchObject({ state: 'none', planIncludes: false });
    const res = await request(server)
      .put('/org/portal/domain')
      .set(auth(ownerA))
      .send({ domain })
      .expect(403);
    expect(res.body.code).toBe('PLAN_REQUIRED');
  });

  it('valida el dominio: no acepta basura ni un dominio de AdoptaFácil', async () => {
    await request(server)
      .put('/org/portal/domain')
      .set(auth(ownerA))
      .send({ domain: 'no es un dominio' })
      .expect(400);
    await request(server)
      .put('/org/portal/domain')
      .set(auth(ownerA))
      .send({ domain: 'evil.localhost' })
      .expect(400);
  });

  it('pedir: queda pendiente con los dos registros DNS que hay que crear', async () => {
    const res = await request(server)
      .put('/org/portal/domain')
      .set(auth(ownerA))
      .send({ domain: `https://${domain.toUpperCase()}/` })
      .expect(200);
    expect(res.body).toMatchObject({ state: 'pending_dns', domain, planIncludes: true });
    expect(res.body.records).toEqual([
      { type: 'CNAME', name: domain, value: TARGET },
      {
        type: 'TXT',
        name: `_adoptafacil.${domain}`,
        value: expect.stringMatching(/^adoptafacil-verify=[0-9a-f]{32}$/),
      },
    ]);
    // Pendiente no se sirve ni obtiene certificado.
    await request(server).get('/public/portal-domains/ask').query({ domain }).expect(404);
    await request(server).get('/public/portal-domains/resolve').query({ host: domain }).expect(404);
  });

  it('otra organización puede pedir el mismo dominio (nadie lo bloquea) pero no verificarlo sin el DNS', async () => {
    await request(server).put('/org/portal/domain').set(auth(ownerB)).send({ domain }).expect(200);
    const res = await request(server)
      .post('/org/portal/domain/verify')
      .set(auth(ownerB))
      .expect(200);
    expect(res.body).toMatchObject({ state: 'pending_dns', lastError: 'txt_missing' });
  });

  it('verificar: falta el TXT, luego falta apuntar, luego queda activo y se sirve con HTTPS', async () => {
    const view = await request(server).get('/org/portal/domain').set(auth(ownerA)).expect(200);
    const txt = view.body.records.find((r: { type: string }) => r.type === 'TXT');

    let res = await request(server).post('/org/portal/domain/verify').set(auth(ownerA)).expect(200);
    expect(res.body).toMatchObject({ state: 'pending_dns', lastError: 'txt_missing' });

    dns.txtRecords.set(txt.name, [txt.value]);
    res = await request(server).post('/org/portal/domain/verify').set(auth(ownerA)).expect(200);
    expect(res.body).toMatchObject({ state: 'pending_dns', lastError: 'target_mismatch' });

    dns.cnameRecords.set(domain, [`${TARGET}.`]);
    res = await request(server).post('/org/portal/domain/verify').set(auth(ownerA)).expect(200);
    expect(res.body).toMatchObject({ state: 'active', lastError: null });
    expect(res.body.verifiedAt).toEqual(expect.any(String));

    await request(server).get('/public/portal-domains/ask').query({ domain }).expect(200);
    const resolved = await request(server)
      .get('/public/portal-domains/resolve')
      .query({ host: domain.toUpperCase() })
      .expect(200);
    expect(resolved.body).toEqual({ slug: slugA });

    const audit = await admin.auditLog.findMany({
      where: { organizationId: orgA, action: { startsWith: 'portal.custom_domain' } },
      select: { action: true },
    });
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(['portal.custom_domain_requested', 'portal.custom_domain_verified']),
    );
  });

  it('ya activo para A, la otra organización no puede tomarlo aunque copie los registros', async () => {
    const view = await request(server).get('/org/portal/domain').set(auth(ownerB)).expect(200);
    const txt = view.body.records.find((r: { type: string }) => r.type === 'TXT');
    dns.txtRecords.set(txt.name, [txt.value]);
    const res = await request(server)
      .post('/org/portal/domain/verify')
      .set(auth(ownerB))
      .expect(200);
    expect(res.body).toMatchObject({ state: 'pending_dns', lastError: 'taken' });
    const resolved = await request(server)
      .get('/public/portal-domains/resolve')
      .query({ host: domain })
      .expect(200);
    expect(resolved.body.slug).toBe(slugA);
  });

  it('un fallo pasajero del DNS no apaga un dominio activo', async () => {
    dns.fail = true;
    const res = await request(server)
      .post('/org/portal/domain/verify')
      .set(auth(ownerA))
      .expect(200);
    expect(res.body).toMatchObject({ state: 'active', lastError: 'dns_error' });
    await request(server).get('/public/portal-domains/ask').query({ domain }).expect(200);
  });

  it('si el plan ya no lo incluye queda suspendido: no se sirve ni renueva el certificado', async () => {
    setEnforced(true);
    const view = await request(server).get('/org/portal/domain').set(auth(ownerA)).expect(200);
    expect(view.body.state).toBe('suspended');
    await request(server).get('/public/portal-domains/ask').query({ domain }).expect(404);
    await request(server).get('/public/portal-domains/resolve').query({ host: domain }).expect(404);
    setEnforced(false);
    await request(server).get('/public/portal-domains/ask').query({ domain }).expect(200);
  });

  it('sin sesión no se gestiona el dominio', async () => {
    await request(server).get('/org/portal/domain').expect(401);
  });

  it('quitar: deja de servirse y la organización vuelve a "sin dominio"', async () => {
    const res = await request(server).delete('/org/portal/domain').set(auth(ownerA)).expect(200);
    expect(res.body.state).toBe('none');
    await request(server).get('/public/portal-domains/ask').query({ domain }).expect(404);
  });

  it('las reglas del DNS (pura): CNAME exacto o A a la IP del servidor, nunca mezclado', () => {
    const base = { token: 't', txt: ['adoptafacil-verify=t'], target: TARGET, ipv4: IPV4 };
    expect(evaluatePortalDns({ ...base, cname: [], a: [IPV4] })).toBeNull();
    expect(evaluatePortalDns({ ...base, cname: [], a: [IPV4, '198.51.100.1'] })).toBe(
      'target_mismatch',
    );
    expect(evaluatePortalDns({ ...base, cname: ['otro.example.com'], a: [] })).toBe(
      'target_mismatch',
    );
    expect(
      evaluatePortalDns({ ...base, txt: ['adoptafacil-verify=x'], cname: [TARGET], a: [] }),
    ).toBe('txt_missing');
  });
});
