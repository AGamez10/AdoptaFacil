import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import request from 'supertest';
import { addDaysToDay, todayInColombia } from '@adoptafacil/contracts';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';
import { completeTestProfile } from './support/profile';
import { LEGAL_ORG, LEGAL_PERSON } from './support/legal';
import { approveTestOrganization } from './support/organization-status';

/**
 * Voluntariado — pedido del cliente (2026-11-13):
 *  1. Una jornada publicada no se borra: se CANCELA con motivo (sus
 *     inscripciones abiertas se cierran y se avisa) o se REPROGRAMA (cambian
 *     fechas/días y se avisa), sin dejar por fuera horas ya registradas.
 *  2. El certificado se puede comprobar: código público + verificación sin
 *     sesión, y dos plantillas de PDF con anexos (bitácora y fotos).
 */
describe('Voluntariado: cancelar/reprogramar jornadas y certificado verificable', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const password = 'password-1234';

  interface Actor {
    token: string;
    orgId: string;
    userId: string;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const binaryParser = (res: any, cb: (err: Error | null, body: Buffer) => void): void => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  };
  const auth = (a: Actor) => ({ Authorization: `Bearer ${a.token}` });
  const today = todayInColombia();
  const day = (offset: number) => addDaysToDay(today, offset);
  const iso = (d: string) => `${d}T00:00:00.000Z`;

  async function registerOrg(name: string): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: name,
        displayName: 'Owner',
        email: `vcc-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    await approveTestOrganization(admin, res.body.user.organizationId);
    orgIds.push(res.body.user.organizationId);
    return {
      token: res.body.tokens.accessToken,
      orgId: res.body.user.organizationId,
      userId: res.body.user.id,
    };
  }

  async function registerPerson(tag: string): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/person')
      .send({
        ...LEGAL_PERSON,
        displayName: `Andrés Felipe ${tag}`,
        email: `vcc-p-${tag}-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    orgIds.push(res.body.user.organizationId);
    await completeTestProfile(admin, res.body.user.id);
    return {
      token: res.body.tokens.accessToken,
      orgId: res.body.user.organizationId,
      userId: res.body.user.id,
    };
  }

  async function publish(org: Actor, sessionDates: string[], start = -20, end = 10) {
    const res = await request(server)
      .post('/volunteer-opportunities')
      .set(auth(org))
      .send({
        title: 'Baño de los gordos',
        category: 'care',
        startDate: iso(day(start)),
        endDate: iso(day(end)),
        location: 'Refugio',
        sessionDates,
      })
      .expect(201);
    return res.body.id as string;
  }

  async function enrollAccepted(org: Actor, volunteer: Actor, opportunityId: string) {
    const enrolled = await request(server)
      .post('/volunteer-enrollments')
      .set(auth(volunteer))
      .send({ opportunityId })
      .expect(201);
    await request(server)
      .post(`/volunteer-enrollments/${enrolled.body.id}/decision`)
      .set(auth(org))
      .send({ decision: 'accept' })
      .expect(200);
    return enrolled.body.id as string;
  }

  let org: Actor;
  let otherOrg: Actor;
  let volunteer: Actor;
  let second: Actor;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    org = await registerOrg('Refugio Patitas Felices');
    otherOrg = await registerOrg('Otro Refugio');
    volunteer = await registerPerson('a');
    second = await registerPerson('b');
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('reprogramar mueve la jornada al otro fin de semana y avisa a los inscritos', async () => {
    const opportunityId = await publish(org, [day(3), day(4)], 1, 5);
    await enrollAccepted(org, volunteer, opportunityId);
    await request(server)
      .post('/volunteer-enrollments')
      .set(auth(second))
      .send({ opportunityId })
      .expect(201);

    const moved = await request(server)
      .patch(`/volunteer-opportunities/${opportunityId}`)
      .set(auth(org))
      .send({
        startDate: iso(day(8)),
        endDate: iso(day(12)),
        sessionDates: [day(10), day(11)],
        rescheduleReason: 'Pronóstico de lluvia fuerte',
      })
      .expect(200);
    expect(moved.body.sessionDates).toEqual([day(10), day(11)]);
    expect(moved.body.notifiedVolunteers).toBe(2);

    // Cambiar solo el título no es reprogramar: nadie recibe aviso.
    const renamed = await request(server)
      .patch(`/volunteer-opportunities/${opportunityId}`)
      .set(auth(org))
      .send({ title: 'Baño de los gordos (nueva fecha)' })
      .expect(200);
    expect(renamed.body.notifiedVolunteers).toBe(0);

    const audit = await admin.auditLog.findFirst({
      where: { entityId: opportunityId, action: 'volunteering.opportunity_rescheduled' },
    });
    expect(audit).not.toBeNull();
  });

  it('no deja por fuera horas ya registradas al reprogramar, y entonces no se puede cancelar', async () => {
    const opportunityId = await publish(org, [day(-5), day(3)]);
    const enrollmentId = await enrollAccepted(org, volunteer, opportunityId);
    await request(server)
      .post('/service-hours')
      .set(auth(volunteer))
      .send({ enrollmentId, date: iso(day(-5)), hours: 3, description: 'Baños' })
      .expect(201);

    const blocked = await request(server)
      .patch(`/volunteer-opportunities/${opportunityId}`)
      .set(auth(org))
      .send({ sessionDates: [day(3)] })
      .expect(409);
    expect(blocked.body.message).toContain('Ya hay horas registradas');
    // Mover solo el día futuro sí se puede.
    await request(server)
      .patch(`/volunteer-opportunities/${opportunityId}`)
      .set(auth(org))
      .send({ sessionDates: [day(-5), day(6)] })
      .expect(200);

    const noCancel = await request(server)
      .post(`/volunteer-opportunities/${opportunityId}/cancel`)
      .set(auth(org))
      .send({ reason: 'Ya no tenemos transporte' })
      .expect(409);
    expect(noCancel.body.message).toContain('no se puede cancelar');
  });

  it('cancelar exige motivo, cierra las inscripciones abiertas, la saca del listado público y no se edita más', async () => {
    const opportunityId = await publish(org, [day(3)], 1, 5);
    const enrollmentId = await enrollAccepted(org, volunteer, opportunityId);

    await request(server)
      .post(`/volunteer-opportunities/${opportunityId}/cancel`)
      .set(auth(org))
      .send({})
      .expect(400);
    // Otra organización no puede cancelarla, ni el voluntario.
    await request(server)
      .post(`/volunteer-opportunities/${opportunityId}/cancel`)
      .set(auth(otherOrg))
      .send({ reason: 'Intento ajeno' })
      .expect(404);
    await request(server)
      .post(`/volunteer-opportunities/${opportunityId}/cancel`)
      .set(auth(volunteer))
      .send({ reason: 'Intento ajeno' })
      .expect(403);
    // Ni por PATCH con estado "cancelled".
    await request(server)
      .patch(`/volunteer-opportunities/${opportunityId}`)
      .set(auth(org))
      .send({ status: 'cancelled' })
      .expect(400);

    const cancelled = await request(server)
      .post(`/volunteer-opportunities/${opportunityId}/cancel`)
      .set(auth(org))
      .send({ reason: 'No conseguimos el transporte' })
      .expect(200);
    expect(cancelled.body.notifiedVolunteers).toBe(1);
    expect(cancelled.body.opportunity).toMatchObject({
      status: 'cancelled',
      cancellationReason: 'No conseguimos el transporte',
    });

    const mine = await request(server).get('/volunteer-enrollments/mine').set(auth(volunteer));
    const item = mine.body.find((e: { id: string }) => e.id === enrollmentId);
    expect(item.status).toBe('cancelled');
    expect(item.rejectionReason).toContain('No conseguimos el transporte');

    const feed = await request(server).get('/public/volunteer-opportunities?limit=100').expect(200);
    expect(feed.body.items.some((o: { id: string }) => o.id === opportunityId)).toBe(false);

    await request(server)
      .patch(`/volunteer-opportunities/${opportunityId}`)
      .set(auth(org))
      .send({ title: 'Otra vez' })
      .expect(409);
    await request(server)
      .post(`/volunteer-opportunities/${opportunityId}/cancel`)
      .set(auth(org))
      .send({ reason: 'Otra vez cancelada' })
      .expect(409);
  });

  it('el certificado lleva código público verificable sin sesión y se descarga en las dos plantillas', async () => {
    const opportunityId = await publish(org, [day(-10), day(-5)]);
    const enrollmentId = await enrollAccepted(org, volunteer, opportunityId);
    const first = await request(server)
      .post('/service-hours')
      .set(auth(volunteer))
      .send({
        enrollmentId,
        date: iso(day(-10)),
        hours: 4,
        description: 'Baño y cepillado de 12 perritos',
      })
      .expect(201);
    await request(server)
      .post('/service-hours')
      .set(auth(volunteer))
      .send({ enrollmentId, date: iso(day(-5)), hours: 2.5, description: 'Paseo por el parque' })
      .expect(201);
    const photo = await sharp({
      create: { width: 1200, height: 900, channels: 3, background: '#2a9d8f' },
    })
      .jpeg()
      .toBuffer();
    await request(server)
      .post(`/service-hours/${first.body.id}/photos`)
      .set(auth(volunteer))
      .attach('file', photo, 'jornada.jpg')
      .expect(201);
    const list = await request(server)
      .get(`/service-hours?enrollmentId=${enrollmentId}`)
      .set(auth(org))
      .expect(200);
    for (const h of list.body.items) {
      await request(server)
        .post(`/service-hours/${h.id}/decision`)
        .set(auth(org))
        .send({ decision: 'approve' })
        .expect(200);
    }
    const signature = await sharp({
      create: { width: 300, height: 120, channels: 4, background: '#00000000' },
    })
      .composite([
        {
          input: Buffer.from(
            '<svg width="300" height="120"><path d="M20 80 C 80 10, 160 110, 280 40" ' +
              'stroke="#000" stroke-width="6" fill="none"/></svg>',
          ),
        },
      ])
      .png()
      .toBuffer();
    await request(server)
      .post('/org/legal-representative')
      .set(auth(org))
      .send({
        role: 'legal_representative',
        fullName: 'Camila Rojas',
        documentType: 'cedula_ciudadania',
        documentNumber: '52000111',
        position: 'Representante legal',
        signatureBase64: signature.toString('base64'),
        signatureContentType: 'image/png',
      })
      .expect(201);

    const cert = await request(server)
      .post(`/volunteer-certificates/${enrollmentId}`)
      .set(auth(org))
      .send()
      .expect(201);
    const code: string = cert.body.verificationCode;
    expect(code).toMatch(/^VOL-[0-9A-F]{8}-[0-9A-F]{8}$/);

    const mine = await request(server).get('/volunteer-certificates/mine').set(auth(volunteer));
    expect(mine.body.find((c: { id: string }) => c.id === cert.body.id).verificationCode).toBe(
      code,
    );

    // Verificación pública: sin sesión, solo lo impreso (sin correo ni ids).
    const verified = await request(server)
      .get(`/public/volunteer-certificates/${code.toLowerCase()}`)
      .expect(200);
    expect(verified.body).toMatchObject({
      verificationCode: code,
      organizationName: 'Refugio Patitas Felices',
      totalApprovedHours: 6.5,
      sessions: 2,
      signerFullName: 'Camila Rojas',
    });
    expect(JSON.stringify(verified.body)).not.toMatch(/@test\.local|enrollment|organizationId/);
    await request(server).get('/public/volunteer-certificates/VOL-00000000-00000000').expect(404);
    await request(server).get('/public/volunteer-certificates/no-es-un-codigo').expect(404);

    for (const plantilla of ['huellitas', 'clasica']) {
      const pdf = await request(server)
        .get(`/volunteer-certificates/${cert.body.id}/pdf?plantilla=${plantilla}`)
        .set(auth(volunteer))
        .buffer(true)
        .parse(binaryParser)
        .expect(200);
      expect(pdf.headers['content-disposition']).toContain(plantilla);
      const doc = await PDFDocument.load(pdf.body as Buffer);
      // Certificado + bitácora + registro fotográfico.
      expect(doc.getPageCount()).toBe(3);
      expect(doc.getSubject()).toContain(code);
      if (process.env.CERT_PDF_OUT) {
        writeFileSync(
          `${process.env.CERT_PDF_OUT}/certificado-${plantilla}.pdf`,
          pdf.body as Buffer,
        );
      }
    }
  });
});
