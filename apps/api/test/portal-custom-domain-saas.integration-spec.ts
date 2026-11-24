import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  CloudflareCustomHostnames,
  type EdgeHostnameStatus,
} from '../src/modules/portals/cloudflare-custom-hostnames';
import { PortalDnsLookup, PortalDomainService } from '../src/modules/portals/portal-domain.service';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG } from './support/legal';
import { approveTestOrganization } from './support/organization-status';

const TARGET = 'portales.adoptafacil.test';

class FakeDns {
  txtRecords = new Map<string, string[]>();
  cnameRecords = new Map<string, string[]>();
  async txt(name: string) {
    return this.txtRecords.get(name) ?? [];
  }
  async cname(name: string) {
    return this.cnameRecords.get(name) ?? [];
  }
  async a() {
    return [] as string[];
  }
}

/** Cloudflare for SaaS simulado: qué dominios están registrados en la zona. */
class FakeEdge {
  readonly enabled = true;
  hostnames = new Map<string, EdgeHostnameStatus>();
  fail = false;
  async ensure(hostname: string): Promise<EdgeHostnameStatus> {
    if (this.fail) throw new Error('Cloudflare caído');
    if (!this.hostnames.has(hostname)) this.hostnames.set(hostname, 'pending');
    return this.hostnames.get(hostname) as EdgeHostnameStatus;
  }
  async status(hostname: string) {
    if (this.fail) throw new Error('Cloudflare caído');
    return this.hostnames.get(hostname) ?? null;
  }
  async remove(hostname: string) {
    if (this.fail) throw new Error('Cloudflare caído');
    this.hostnames.delete(hostname);
  }
}

/**
 * Dominio propio con Cloudflare for SaaS: al verificar el DNS, el dominio se
 * registra en la zona de AdoptaFácil (entra por Cloudflare y el VPS sigue
 * cerrado a sus IPs); al quitarlo o cambiarlo, sale de la zona. La raíz del
 * dominio no se puede conectar en este modo.
 */
describe('Dominio propio con Cloudflare for SaaS', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let service: PortalDomainService;
  const dns = new FakeDns();
  const edge = new FakeEdge();
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];
  const suffix = randomUUID().slice(0, 8);
  const domain = `www.saas-${suffix}.org`;
  const other = `portal.saas-${suffix}.org`;
  let owner = '';
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function publishRecords(host: string) {
    const view = await request(server).get('/org/portal/domain').set(auth(owner)).expect(200);
    const txt = view.body.records.find((r: { type: string }) => r.type === 'TXT');
    dns.txtRecords.set(txt.name, [txt.value]);
    dns.cnameRecords.set(host, [`${TARGET}.`]);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PortalDnsLookup)
      .useValue(dns)
      .overrideProvider(CloudflareCustomHostnames)
      .useValue(edge)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    service = app.get(PortalDomainService);
    Object.defineProperty(service, 'target', { value: TARGET, configurable: true });

    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: 'Refugio SaaS',
        displayName: 'Owner',
        email: `saas-${randomUUID()}@test.local`,
        password: 'password-saas-123',
      })
      .expect(201);
    await approveTestOrganization(admin, res.body.user.organizationId);
    createdOrgIds.push(res.body.user.organizationId);
    owner = res.body.tokens.accessToken;
    await request(server)
      .put('/org/profile')
      .set(auth(owner))
      .send({ slug: `saas-${suffix}` })
      .expect(200);
  });

  afterEach(() => {
    edge.fail = false;
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('no deja conectar la raíz del dominio (solo subdominios por CNAME)', async () => {
    await request(server)
      .put('/org/portal/domain')
      .set(auth(owner))
      .send({ domain: `saas-${suffix}.org` })
      .expect(400);
  });

  it('si Cloudflare falla, el dominio no se activa y la organización ve por qué', async () => {
    await request(server).put('/org/portal/domain').set(auth(owner)).send({ domain }).expect(200);
    await publishRecords(domain);
    edge.fail = true;
    const res = await request(server)
      .post('/org/portal/domain/verify')
      .set(auth(owner))
      .expect(200);
    expect(res.body).toMatchObject({ state: 'pending_dns', lastError: 'edge_error' });
    expect(edge.hostnames.has(domain)).toBe(false);
  });

  it('verificado: queda en la zona de Cloudflare y avisa mientras se emite el certificado', async () => {
    let res = await request(server).post('/org/portal/domain/verify').set(auth(owner)).expect(200);
    expect(res.body).toMatchObject({ state: 'active', lastError: null, certificate: 'pending' });
    expect(edge.hostnames.get(domain)).toBe('pending');

    edge.hostnames.set(domain, 'active');
    res = await request(server).get('/org/portal/domain').set(auth(owner)).expect(200);
    expect(res.body).toMatchObject({ state: 'active', certificate: 'active' });
    await request(server).get('/public/portal-domains/ask').query({ domain }).expect(200);
  });

  it('un fallo pasajero de Cloudflare no apaga un dominio activo', async () => {
    edge.fail = true;
    const res = await request(server)
      .post('/org/portal/domain/verify')
      .set(auth(owner))
      .expect(200);
    expect(res.body).toMatchObject({ state: 'active', lastError: 'edge_error' });
    expect(res.body.certificate).toBeUndefined();
  });

  it('cambiar de dominio saca el anterior de la zona', async () => {
    await request(server)
      .put('/org/portal/domain')
      .set(auth(owner))
      .send({ domain: other })
      .expect(200);
    expect(edge.hostnames.has(domain)).toBe(false);
    await publishRecords(other);
    await request(server).post('/org/portal/domain/verify').set(auth(owner)).expect(200);
    expect(edge.hostnames.has(other)).toBe(true);
  });

  it('si los registros desaparecen, sale de la zona', async () => {
    dns.cnameRecords.delete(other);
    const res = await request(server)
      .post('/org/portal/domain/verify')
      .set(auth(owner))
      .expect(200);
    expect(res.body).toMatchObject({ state: 'pending_dns', lastError: 'target_mismatch' });
    expect(edge.hostnames.has(other)).toBe(false);
  });

  it('quitar el dominio lo saca de la zona', async () => {
    dns.cnameRecords.set(other, [`${TARGET}.`]);
    await request(server).post('/org/portal/domain/verify').set(auth(owner)).expect(200);
    expect(edge.hostnames.has(other)).toBe(true);
    const res = await request(server).delete('/org/portal/domain').set(auth(owner)).expect(200);
    expect(res.body.state).toBe('none');
    expect(edge.hostnames.has(other)).toBe(false);
  });
});
