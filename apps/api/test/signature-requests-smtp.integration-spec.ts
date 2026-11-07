import { randomUUID } from 'node:crypto';
import net from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { purgeOrganizations } from './support/cleanup';
import { SIGNATURE_PNG, registerOwnSignature } from './support/signers';
import { LEGAL_ORG } from './support/legal';

/** Bandeja SMTP mínima (como Mailpit): guarda cada DATA recibido. */
function startSink(port: number, inbox: string[]): net.Server {
  return net
    .createServer((sock) => {
      let data = false;
      let buf = '';
      sock.write('220 sink\r\n');
      sock.on('data', (chunk) => {
        buf += chunk.toString('utf8');
        let i: number;
        while ((i = buf.indexOf('\r\n')) >= 0) {
          if (data) {
            const end = buf.indexOf('\r\n.\r\n');
            if (end < 0) return;
            inbox.push(buf.slice(0, end));
            buf = buf.slice(end + 5);
            data = false;
            sock.write('250 queued\r\n');
            continue;
          }
          const line = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const cmd = line.slice(0, 4).toUpperCase();
          if (cmd === 'EHLO' || cmd === 'HELO') sock.write('250 sink\r\n');
          else if (cmd === 'DATA') {
            data = true;
            sock.write('354 go\r\n');
          } else if (cmd === 'QUIT') sock.end('221 bye\r\n');
          else sock.write('250 ok\r\n');
        }
      });
    })
    .listen(port, '127.0.0.1');
}

/**
 * M13 · De punta a punta por SMTP real (sin reemplazar NOTIFICATION_PORT): el
 * Owner genera el informe de donaciones, la cola de correos lo entrega por
 * SMTP a una bandeja local (igual que Mailpit en `docker compose`), y con el
 * enlace de ese correo el revisor fiscal registra su firma y aprueba.
 */
describe('E2E real SMTP: signature request reaches the reviewer mailbox', () => {
  const inbox: string[] = [];
  let sink: net.Server;
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const reviewerEmail = `rev-${randomUUID()}@test.local`;
  const today = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);

  const savedEnv = { ...process.env };

  beforeAll(async () => {
    sink = startSink(0, inbox);
    await new Promise((resolve) => sink.once('listening', resolve));
    process.env.NOTIFICATION_DRIVER = 'smtp';
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = String((sink.address() as net.AddressInfo).port);
    process.env.SMTP_FROM = '"AdoptaFácil (local)" <no-reply@adoptafacil.local>';
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app.close();
    sink.close();
    process.env = savedEnv;
  });

  it('Owner links reviewer, generates donations report, email arrives over SMTP, reviewer signs', async () => {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: 'Refugio SMTP',
        displayName: 'Owner SMTP',
        email: `o-${randomUUID()}@test.local`,
        password: 'password-1234',
      })
      .expect(201);
    const owner = {
      token: res.body.tokens.accessToken,
      userId: res.body.user.id,
      orgId: res.body.user.organizationId,
    };
    orgIds.push(owner.orgId);
    const auth = { Authorization: `Bearer ${owner.token}` };
    await admin.organizationProfile.upsert({
      where: { organizationId: owner.orgId },
      create: { organizationId: owner.orgId, formalizationState: 'formalizada' },
      update: { formalizationState: 'formalizada' },
    });
    await registerOwnSignature(server, owner, 'legal_representative', 'Rep SMTP').expect(201);
    await request(server)
      .post('/org/signers')
      .set(auth)
      .send({
        email: reviewerEmail,
        fullName: 'Diana Revisora',
        role: 'fiscal_reviewer',
        statutoryDeclaration: true,
      })
      .expect(201);
    const report = (
      await request(server)
        .post('/org/reports')
        .set(auth)
        .send({
          kind: 'donations',
          periodStart: today.slice(0, 8) + '01',
          periodEnd: today,
          signerRoles: ['legal_representative', 'fiscal_reviewer'],
        })
        .expect(201)
    ).body;
    expect(report.status).toBe('pending_signatures');

    const deadline = Date.now() + 20_000;
    let mail: string | undefined;
    while (!mail && Date.now() < deadline) {
      mail = inbox.find((m) => m.includes(reviewerEmail) && m.includes('firmar#token='));
      if (!mail) await new Promise((r) => setTimeout(r, 200));
    }
    expect(mail).toBeDefined();
    const flat = mail!.replace(/=\r\n/g, '').replace(/=3D/g, '=');
    const token = decodeURIComponent(/\/firmar#token=([A-Za-z0-9_%-]+)/.exec(flat)![1]!);
    expect(mail).toContain('Subject: Refugio SMTP necesita tu firma como revisor fiscal');

    const done = await request(server)
      .post('/public/signature-requests/decision')
      .send({
        token,
        decision: 'approved',
        consent: true,
        documentNumber: '79.000.111',
        signature: {
          fullName: 'Diana Revisora',
          documentType: 'cedula_ciudadania',
          position: 'Revisora fiscal',
          signatureBase64: SIGNATURE_PNG,
          signatureContentType: 'image/png',
        },
      })
      .expect(200);
    expect(done.body).toMatchObject({ decision: 'approved', status: 'issued', code: report.code });
  }, 60_000);
});
