import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SIGNER_DECLARATION_TEXT, SIGNER_DECLARATION_VERSION } from '@adoptafacil/contracts';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { NOTIFICATION_PORT } from '../src/core/notifications/notification.port';
import { purgeOrganizations } from './support/cleanup';
import { CapturingNotificationPort, SIGNATURE_PNG, registerOwnSignature } from './support/signers';
import { LEGAL_ORG } from './support/legal';

/**
 * M13 · Firma por enlace de correo. El contador / revisor fiscal NO crea
 * cuenta: el Owner lo vincula por correo; cada documento le llega con un
 * enlace de un solo uso. La primera vez registra su firma y consiente; las
 * siguientes, aprueba con su número de documento. Cambiar de revisor revoca al
 * anterior y sus enlaces dejan de servir.
 */
describe('Signature requests by email link (M13)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const notifications = new CapturingNotificationPort();
  const orgIds: string[] = [];
  let owner: { token: string; userId: string; orgId: string };
  const reviewerEmail = `rev-${randomUUID()}@test.local`;
  let lastLinkedEmail = reviewerEmail;

  const today = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
  const daysAgo = (n: number) =>
    new Date(Date.now() - 5 * 3600_000 - n * 86_400_000).toISOString().slice(0, 10);
  const auth = (a: { token: string }) => ({ Authorization: `Bearer ${a.token}` });

  function lastLinkFor(email: string): string {
    const message = [...notifications.sent].reverse().find((m) => m.to === email);
    const match = message?.body.match(/\/firmar#token=([A-Za-z0-9_%-]+)/);
    if (!match) throw new Error(`no signature link sent to ${email}`);
    return decodeURIComponent(match[1]);
  }

  const generate = (periodStart: string) =>
    request(server)
      .post('/org/reports')
      .set(auth(owner))
      .send({ kind: 'social_service', periodStart, periodEnd: today })
      .expect(201);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NOTIFICATION_PORT)
      .useValue(notifications)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: 'Refugio Enlace',
        displayName: 'Owner Enlace',
        email: `link-${randomUUID()}@test.local`,
        password: 'password-1234',
      })
      .expect(201);
    owner = {
      token: res.body.tokens.accessToken,
      userId: res.body.user.id,
      orgId: res.body.user.organizationId,
    };
    orgIds.push(owner.orgId);
    await admin.organizationProfile.upsert({
      where: { organizationId: owner.orgId },
      create: { organizationId: owner.orgId, formalizationState: 'formalizada' },
      update: { formalizationState: 'formalizada' },
    });
    await registerOwnSignature(server, owner, 'legal_representative', 'Rep Enlace').expect(201);
    await request(server)
      .put('/org/reports/policy')
      .set(auth(owner))
      .send({ kind: 'social_service', requiredRoles: ['legal_representative', 'fiscal_reviewer'] })
      .expect(200);
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app.close();
  });

  it('the Owner links the reviewer by email: no password, no role, no login', async () => {
    // Sin la declaración estatutaria de la organización, no se vincula.
    await request(server)
      .post('/org/signers')
      .set(auth(owner))
      .send({ email: reviewerEmail, fullName: 'Diana Revisora', role: 'fiscal_reviewer' })
      .expect(400);
    const res = await request(server)
      .post('/org/signers')
      .set(auth(owner))
      .send({
        email: reviewerEmail,
        fullName: 'Diana Revisora',
        role: 'fiscal_reviewer',
        statutoryDeclaration: true,
      })
      .expect(201);
    expect(res.body).toMatchObject({ role: 'fiscal_reviewer', status: 'active' });
    const user = await admin.user.findFirstOrThrow({
      where: { organizationId: owner.orgId, email: reviewerEmail },
    });
    expect(await admin.authCredential.findUnique({ where: { userId: user.id } })).toBeNull();
    expect(await admin.userRole.count({ where: { userId: user.id } })).toBe(0);
    // La declaración queda registrada con quién, cuándo y qué versión del texto aceptó.
    const declared = await admin.auditLog.findFirstOrThrow({
      where: { organizationId: owner.orgId, action: 'signer.designated', entityId: res.body.id },
    });
    expect(declared.actorUserId).toBe(owner.userId);
    expect(declared.metadata).toMatchObject({
      declarationVersion: SIGNER_DECLARATION_VERSION,
      declarationText: SIGNER_DECLARATION_TEXT,
    });
  });

  it('first request: sees the draft, registers the signature with consent, and the document is issued', async () => {
    const report = (await generate(daysAgo(20))).body;
    expect(report.status).toBe('pending_signatures');
    const token = lastLinkFor(reviewerEmail);
    expect(notifications.sent.at(-1)?.body).toContain('primera vez');

    const preview = await request(server)
      .post('/public/signature-requests/preview')
      .send({ token })
      .expect(200);
    expect(preview.body).toMatchObject({
      needsSignature: true,
      role: 'fiscal_reviewer',
      signerName: 'Diana Revisora',
      report: { code: report.code },
    });
    const pdf = await request(server)
      .post('/public/signature-requests/pdf')
      .send({ token })
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');

    // Sin consentimiento no se aprueba.
    await request(server)
      .post('/public/signature-requests/decision')
      .send({ token, decision: 'approved', documentNumber: '79.000.111' })
      .expect(400);

    const done = await request(server)
      .post('/public/signature-requests/decision')
      .set('User-Agent', 'jest-firma')
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

    // Un solo uso.
    await request(server).post('/public/signature-requests/preview').send({ token }).expect(400);

    const audit = await admin.auditLog.findFirstOrThrow({
      where: {
        organizationId: owner.orgId,
        action: 'report.approved',
        entityId: report.id,
        metadata: { path: ['channel'], equals: 'email_link' },
      },
    });
    expect(audit.metadata).toMatchObject({
      signerRole: 'fiscal_reviewer',
      consentVersion: expect.any(String),
      userAgent: 'jest-firma',
      contentHash: report.contentHash,
    });
  });

  it('next requests: approves with the document number only; a wrong number is refused', async () => {
    const report = (await generate(daysAgo(10))).body;
    const token = lastLinkFor(reviewerEmail);
    const preview = await request(server)
      .post('/public/signature-requests/preview')
      .send({ token })
      .expect(200);
    expect(preview.body.needsSignature).toBe(false);
    await request(server)
      .post('/public/signature-requests/decision')
      .send({ token, decision: 'approved', consent: true, documentNumber: '123' })
      .expect(400);
    const done = await request(server)
      .post('/public/signature-requests/decision')
      .send({ token, decision: 'approved', consent: true, documentNumber: '79000111' })
      .expect(200);
    expect(done.body.status).toBe('issued');
    const pub = await request(server).get(`/public/reports/${report.code}`).expect(200);
    expect(pub.body.status).toBe('issued');
  });

  it('changing the reviewer revokes the previous one: their pending link stops working; the new one gets theirs', async () => {
    await generate(daysAgo(5));
    const oldToken = lastLinkFor(reviewerEmail);
    const newEmail = `rev2-${randomUUID()}@test.local`;
    lastLinkedEmail = newEmail;
    await request(server)
      .post('/org/signers')
      .set(auth(owner))
      .send({
        email: newEmail,
        fullName: 'Nuevo Revisor',
        role: 'fiscal_reviewer',
        statutoryDeclaration: true,
      })
      .expect(201);
    await request(server)
      .post('/public/signature-requests/preview')
      .send({ token: oldToken })
      .expect(400);
    // Un documento nuevo va al revisor nuevo.
    await generate(daysAgo(3));
    const fresh = await request(server)
      .post('/public/signature-requests/preview')
      .send({ token: lastLinkFor(newEmail) })
      .expect(200);
    expect(fresh.body).toMatchObject({ needsSignature: true, signerName: 'Nuevo Revisor' });
  });

  it('resending gives a fresh link and kills the previous one', async () => {
    const report = (await generate(daysAgo(6))).body;
    const first = lastLinkFor(lastLinkedEmail);
    const res = await request(server)
      .post(`/org/reports/${report.id}/signature-requests`)
      .set(auth(owner))
      .expect(200);
    expect(res.body).toEqual({ sent: 1 });
    const second = lastLinkFor(lastLinkedEmail);
    expect(second).not.toBe(first);
    await request(server)
      .post('/public/signature-requests/preview')
      .send({ token: first })
      .expect(400);
    await request(server)
      .post('/public/signature-requests/preview')
      .send({ token: second })
      .expect(200);
  });

  it('an expired link no longer works', async () => {
    await generate(daysAgo(2));
    const token = lastLinkFor(lastLinkedEmail);
    await admin.orgSignatureRequest.update({
      where: { tokenHash: createHash('sha256').update(token).digest('hex') },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    await request(server).post('/public/signature-requests/preview').send({ token }).expect(400);
    await request(server)
      .post('/public/signature-requests/decision')
      .send({ token, decision: 'approved', consent: true, documentNumber: '79000111' })
      .expect(400);
  });

  it('a signature stays in the organization that received it: another org never sees or reuses it', async () => {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: 'Refugio Otro',
        displayName: 'Owner Otro',
        email: `other-${randomUUID()}@test.local`,
        password: 'password-1234',
      })
      .expect(201);
    const other = {
      token: res.body.tokens.accessToken,
      userId: res.body.user.id,
      orgId: res.body.user.organizationId,
    };
    orgIds.push(other.orgId);
    await admin.organizationProfile.upsert({
      where: { organizationId: other.orgId },
      create: { organizationId: other.orgId, formalizationState: 'formalizada' },
      update: { formalizationState: 'formalizada' },
    });
    await registerOwnSignature(server, other, 'legal_representative', 'Rep Otro').expect(201);
    await request(server)
      .put('/org/reports/policy')
      .set(auth(other))
      .send({ kind: 'social_service', requiredRoles: ['legal_representative', 'fiscal_reviewer'] })
      .expect(200);

    // La misma revisora (mismo correo) que ya firmó en la primera organización.
    const linked = await request(server)
      .post('/org/signers')
      .set(auth(other))
      .send({
        email: reviewerEmail,
        fullName: 'Diana Revisora',
        role: 'fiscal_reviewer',
        statutoryDeclaration: true,
      })
      .expect(201);
    await request(server)
      .post('/org/reports')
      .set(auth(other))
      .send({ kind: 'social_service', periodStart: daysAgo(4), periodEnd: today })
      .expect(201);
    const preview = await request(server)
      .post('/public/signature-requests/preview')
      .send({ token: lastLinkFor(reviewerEmail) })
      .expect(200);
    // Su firma de la otra organización no se reutiliza: aquí debe registrarla y consentir de nuevo.
    expect(preview.body).toMatchObject({ needsSignature: true, organizationName: 'Refugio Otro' });

    // Son perfiles distintos, uno por organización, y la firma guardada vive solo en la primera.
    const profiles = await admin.user.findMany({ where: { email: reviewerEmail } });
    expect(new Set(profiles.map((u) => u.organizationId))).toEqual(
      new Set([owner.orgId, other.orgId]),
    );
    const signatures = await admin.legalRepresentative.findMany({
      where: { memberId: { in: profiles.map((u) => u.id) } },
    });
    expect(signatures.map((s) => s.organizationId)).toEqual([owner.orgId]);

    // Aquí registra su firma con una FOTO de su firma en papel. Un archivo
    // falso con tipo "image/png" se rechaza; uno demasiado grande, también.
    const firstTime = (signatureBase64: string) =>
      request(server)
        .post('/public/signature-requests/decision')
        .send({
          token: lastLinkFor(reviewerEmail),
          decision: 'approved',
          consent: true,
          documentNumber: '79000111',
          signature: {
            fullName: 'Diana Revisora',
            documentType: 'cedula_ciudadania',
            position: 'Revisora fiscal',
            signatureBase64,
            signatureContentType: 'image/png',
            method: 'photo',
          },
        });
    const fake = await firstTime(Buffer.from('<svg onload="x()"></svg>').toString('base64'));
    expect(fake.status).toBe(400);
    expect(fake.body.message).toMatch(/PNG o JPG/);
    await firstTime('A'.repeat(1_500_000)).expect(413);
    const photo = await sharp(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">' +
          '<rect width="640" height="480" fill="#ecece6"/>' +
          '<path d="M120 300 C 220 160, 320 400, 420 250 S 520 220, 560 320" stroke="#20202a" stroke-width="9" fill="none"/>' +
          '</svg>',
      ),
    )
      .jpeg({ quality: 80 })
      .withExif({ IFD0: { Artist: 'no-debe-guardarse' } })
      .toBuffer();
    const signed = await firstTime(photo.toString('base64')).expect(200);
    expect(signed.body.status).toBe('issued');
    const otherReport = await admin.orgReport.findFirstOrThrow({
      where: { organizationId: other.orgId },
    });
    const evidence = await admin.auditLog.findFirstOrThrow({
      where: { organizationId: other.orgId, action: 'report.approved', entityId: otherReport.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(evidence.metadata).toMatchObject({ channel: 'email_link', signatureMethod: 'photo' });

    // Cada organización guarda SU copia; ninguna ve la de la otra.
    const perOrg = await admin.legalRepresentative.findMany({
      where: { memberId: { in: profiles.map((u) => u.id) } },
      select: { organizationId: true, signatureFileRef: true },
    });
    expect(new Set(perOrg.map((s) => s.organizationId))).toEqual(
      new Set([owner.orgId, other.orgId]),
    );
    expect(new Set(perOrg.map((s) => s.signatureFileRef)).size).toBe(2);
    const seenByOther = await request(server)
      .get('/org/legal-representative')
      .set(auth(other))
      .expect(200);
    expect(JSON.stringify(seenByOther.body)).not.toContain('Rep Enlace');

    // Un documento nuevo, pendiente, para probar la revocación.
    await request(server)
      .post('/org/reports')
      .set(auth(other))
      .send({ kind: 'social_service', periodStart: daysAgo(3), periodEnd: today })
      .expect(201);

    // Revocar a la firmante deja sin efecto su enlace pendiente en esa organización.
    const pendingToken = lastLinkFor(reviewerEmail);
    await request(server).delete(`/org/signers/${linked.body.id}`).set(auth(other)).expect(204);
    await request(server)
      .post('/public/signature-requests/decision')
      .send({
        token: pendingToken,
        decision: 'approved',
        consent: true,
        documentNumber: '79000111',
      })
      .expect(400);
  });

  it('a garbage token gets the same single answer', async () => {
    await request(server)
      .post('/public/signature-requests/preview')
      .send({ token: 'x'.repeat(43) })
      .expect(400);
  });
});
