import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

/**
 * Ola 1 · R0-1 + R1-1: the API configured the way production must run (every
 * simulated adapter replaced by its `disabled` adapter, every deferred module
 * off). Closes, by HTTP:
 *  - SEC-001: `POST /auth/google` with a `fake:` token no longer yields a
 *    session (it answered with the PlatformSuperAdmin's tokens before).
 *  - SEC-002: an unsigned, forged "approved" webhook no longer reaches the
 *    donations service (it approved the donation and issued a receipt).
 *  - C2: donations, sponsorships and certificates (and the deferred modules)
 *    answer 404 exactly like a route that does not exist.
 *
 * NODE_ENV stays `test` (the boot-time production guard itself is covered by
 * production-guard.spec.ts); what matters here is the wiring of the
 * adapters and flags that production is forced to use.
 */
const POSTURE: Record<string, string> = {
  AUTH_IDENTITY_DRIVER: 'disabled',
  PAYMENT_DRIVER: 'disabled',
  DIAN_DRIVER: 'disabled',
  SIGNATURE_DRIVER: 'disabled',
  FEATURE_PAYMENTS: 'false',
  FEATURE_SPONSORSHIPS: 'false',
  FEATURE_DONATION_CERTIFICATES: 'false',
  FEATURE_COMMUNITY: 'false',
  FEATURE_REPUTATION: 'false',
  FEATURE_RESOURCES: 'false',
  FEATURE_MARKETPLACE: 'false',
  FEATURE_VOLUNTEERING_MINORS: 'false',
};

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const ID = '00000000-0000-4000-8000-000000000002';

/** One route per switched-off controller (method, path). */
const SWITCHED_OFF: Array<[string, 'get' | 'post', string]> = [
  ['payments', 'post', '/donations'],
  ['payments', 'get', '/donations/mine'],
  ['payments', 'post', '/donations/webhook'],
  ['payments', 'get', '/public/donations/access/some-token'],
  ['payments', 'get', '/public/donations/status/some-reference'],
  ['payments', 'get', `/public/donations/organizations/${ORG_ID}/availability`],
  ['payments', 'post', '/campaigns/funding/reconcile'],
  ['payments', 'get', '/org/dashboard/donations'],
  ['payments', 'get', '/org/payout-bank-account'],
  ['payments', 'get', '/org/mercadopago/status'],
  ['payments', 'get', '/org/mercadopago/callback'],
  ['payments', 'post', '/payments/payouts/webhook'],
  ['payments', 'get', `/platform/payouts/${ORG_ID}`],
  ['payments', 'get', '/platform/reconciliation'],
  ['donationCertificates', 'get', '/public/donations/certificates/ABC123'],
  ['sponsorships', 'get', `/public/sponsorships/animals/${ID}`],
  ['sponsorships', 'get', '/public/sponsorships/status/some-reference'],
  ['sponsorships', 'get', '/sponsorship-plans'],
  ['sponsorships', 'post', '/sponsorships'],
  ['sponsorships', 'get', '/sponsorships/mine'],
  ['community', 'get', '/community/posts'],
  ['community', 'get', '/platform/community/posts'],
  ['reputation', 'get', '/reviews/mine'],
  ['reputation', 'get', '/platform/reviews/queue'],
  ['reputation', 'get', '/public/organizations/some-slug/reputation-summary'],
  ['reputation', 'post', '/public/organizations/some-slug/reviews'],
  ['resources', 'get', '/public/resources/needs'],
  ['resources', 'get', '/resources/needs'],
  ['resources', 'get', '/resources/offers'],
  ['resources', 'get', '/resources/deliveries'],
  ['resources', 'get', `/resources/offers/${ID}/proofs`],
  ['resources', 'get', `/resources/deliveries/${ID}/evidences`],
  ['marketplace', 'get', '/public/marketplace/products'],
  ['marketplace', 'get', '/marketplace/products'],
];

describe('production posture: disabled adapters and switched-off modules (R0-1, R1-1)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const previous: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const [key, value] of Object.entries(POSTURE)) {
      previous[key] = process.env[key];
      process.env[key] = value;
    }
    // Imported after the env is set: ConfigModule.forRoot reads it when the
    // AppModule decorator runs.
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('SEC-001: a fake Google token is refused and yields no session', async () => {
    for (const idToken of [
      'fake:admin@adoptafacil.local:atacante',
      Buffer.from(
        JSON.stringify({ email: 'admin@adoptafacil.local', emailVerified: true }),
      ).toString('base64url'),
    ]) {
      const response = await request(server).post('/auth/google').send({ idToken });
      expect(response.status).toBe(404);
      expect(response.body.accessToken).toBeUndefined();
      expect(response.headers['set-cookie']).toBeUndefined();
    }
  });

  it('SEC-002: a forged, unsigned "approved" webhook never reaches the donations service', async () => {
    const response = await request(server)
      .post('/donations/webhook')
      .send({ collectionId: 'fake-col-forged', status: 'approved', eventId: 'forged-evt-1' });
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Cannot POST /donations/webhook',
    });
  });

  it.each(SWITCHED_OFF)(
    '%s off: %s %s answers 404 like an unknown route',
    async (_f, method, path) => {
      const anonymous = await request(server)[method](path).send({});
      expect(anonymous.status).toBe(404);
      expect(anonymous.body).toEqual({
        statusCode: 404,
        error: 'Not Found',
        message: `Cannot ${method.toUpperCase()} ${path}`,
      });
      // A bearer token changes nothing: the flag is checked before authentication.
      const withToken = await request(server)
        [method](path)
        .set('Authorization', 'Bearer not-a-real-token')
        .send({});
      expect(withToken.status).toBe(404);
    },
  );

  it('leaves the MVP modules alone (they still reach their own auth)', async () => {
    await request(server).get('/animals').expect(401);
    await request(server).get('/adoptions/mine').expect(401);
    await request(server).get('/health').expect(200);
  });

  it('publishes the capabilities the web reads, all closed', async () => {
    const response = await request(server).get('/public/config/features').expect(200);
    expect(response.body).toEqual({
      features: {
        payments: false,
        sponsorships: false,
        donationCertificates: false,
        community: false,
        reputation: false,
        resources: false,
        marketplace: false,
        volunteeringMinors: false,
      },
      googleSignIn: false,
    });
  });
});
