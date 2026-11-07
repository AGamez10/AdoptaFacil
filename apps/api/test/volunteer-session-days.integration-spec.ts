import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { PDFDocument, PDFName, PDFDict, PDFRawStream } from 'pdf-lib';
import sharp from 'sharp';
import request from 'supertest';
import { todayInColombia, addDaysToDay } from '@adoptafacil/contracts';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';
import { completeTestProfile } from './support/profile';
import { LEGAL_PERSON, LEGAL_ORG } from './support/legal';
import { approveTestOrganization } from './support/organization-status';

/**
 * Voluntariado — lo que pidió el cliente (2026-11-06):
 *  1. La organización habilita los DÍAS de jornada; el voluntario solo registra
 *     horas esos días (nunca otro día de la convocatoria, ni futuro). En el
 *     servidor, no solo en la pantalla.
 *  2. Fotos de la jornada en cada sesión: solo el dueño las sube, solo la
 *     organización las ve, y entran al reporte.
 *  3. El reporte incluye a toda persona que anexó horas (también pendientes).
 *  4. El certificado lleva la firma registrada del representante legal,
 *     también si la subió como foto JPG.
 */
describe('Voluntariado: días de jornada, fotos, reporte y firma del certificado', () => {
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
        email: `vsd-${randomUUID()}@test.local`,
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
        displayName: `Voluntaria ${tag}`,
        email: `vsd-p-${tag}-${randomUUID()}@test.local`,
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

  const logHours = (a: Actor, enrollmentId: string, date: string, hours = 3) =>
    request(server)
      .post('/service-hours')
      .set(auth(a))
      .send({ enrollmentId, date: iso(date), hours, description: 'Baños y paseos' });

  let org: Actor;
  let otherOrg: Actor;
  let volunteer: Actor;
  let intruder: Actor;
  let opportunityId: string;
  let enrollmentId: string;
  let hoursId: string;
  const enabled = [day(-10), day(-5), day(3)];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    org = await registerOrg('Refugio Jornadas');
    otherOrg = await registerOrg('Otro Refugio Jornadas');
    volunteer = await registerPerson('a');
    intruder = await registerPerson('b');
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('la organización solo puede habilitar días dentro de las fechas de la convocatoria', async () => {
    const base = {
      title: 'Jornada de baños',
      category: 'care',
      startDate: iso(day(-20)),
      endDate: iso(day(10)),
      location: 'Refugio',
    };
    const outside = await request(server)
      .post('/volunteer-opportunities')
      .set(auth(org))
      .send({ ...base, sessionDates: [day(-25)] })
      .expect(400);
    expect(outside.body.message).toContain('fuera de las fechas');

    const created = await request(server)
      .post('/volunteer-opportunities')
      .set(auth(org))
      .send({ ...base, sessionDates: [day(3), day(-10), day(-5), day(-5)] })
      .expect(201);
    expect(created.body.sessionDates).toEqual(enabled);
    opportunityId = created.body.id;

    // Mover el inicio dejaría un día habilitado por fuera: se rechaza.
    await request(server)
      .patch(`/volunteer-opportunities/${opportunityId}`)
      .set(auth(org))
      .send({ startDate: iso(day(-7)) })
      .expect(400);

    // El listado público expone los días de jornada.
    const feed = await request(server).get('/public/volunteer-opportunities').expect(200);
    const listed = feed.body.items.find((o: { id: string }) => o.id === opportunityId);
    expect(listed?.sessionDates).toEqual(enabled);
  });

  it('el voluntario solo registra horas en días habilitados que ya ocurrieron (regla en el servidor)', async () => {
    const enrolled = await request(server)
      .post('/volunteer-enrollments')
      .set(auth(volunteer))
      .send({ opportunityId })
      .expect(201);
    enrollmentId = enrolled.body.id;
    await request(server)
      .post(`/volunteer-enrollments/${enrollmentId}/decision`)
      .set(auth(org))
      .send({ decision: 'accept' })
      .expect(200);

    // "Mis inscripciones" trae las fechas y los días habilitados.
    const mine = await request(server).get('/volunteer-enrollments/mine').set(auth(volunteer));
    const item = mine.body.find((e: { id: string }) => e.id === enrollmentId);
    expect(item.sessionDates).toEqual(enabled);
    expect(item.opportunityStartDate.slice(0, 10)).toBe(day(-20));

    // Hoy y hace pocos días están dentro de la convocatoria, pero NO son jornada.
    for (const notEnabled of [day(0), day(-1), day(-4), day(-7)]) {
      const res = await logHours(volunteer, enrollmentId, notEnabled).expect(400);
      expect(res.body.message).toContain('no es una jornada habilitada');
    }
    // Día habilitado pero futuro.
    await logHours(volunteer, enrollmentId, day(3)).expect(400);
    // Días habilitados que ya pasaron.
    const ok = await logHours(volunteer, enrollmentId, day(-5)).expect(201);
    hoursId = ok.body.id;
    await logHours(volunteer, enrollmentId, day(-10), 2).expect(201);

    // Ni siquiera llamando la función de la base de datos directamente.
    await expect(
      admin.$queryRawUnsafe(
        `SELECT * FROM create_service_hours($1::uuid, $2::uuid, $3::timestamp, 2, 'x')`,
        enrollmentId,
        volunteer.userId,
        day(-4),
      ),
    ).rejects.toThrow(/not an enabled session day/);
  });

  it('fotos de la jornada: solo el dueño las sube, se normalizan a JPEG y solo la organización las ve', async () => {
    const png = await sharp({
      create: { width: 2400, height: 1800, channels: 3, background: '#e76f51' },
    })
      .png()
      .toBuffer();

    const added = await request(server)
      .post(`/service-hours/${hoursId}/photos`)
      .set(auth(volunteer))
      .attach('file', png, 'jornada.png')
      .expect(201);
    expect(added.body).toMatchObject({ serviceHoursId: hoursId, contentType: 'image/jpeg' });

    // Otra persona no puede adjuntar fotos a una sesión ajena.
    await request(server)
      .post(`/service-hours/${hoursId}/photos`)
      .set(auth(intruder))
      .attach('file', png, 'x.png')
      .expect(404);
    // Un archivo que no es foto se rechaza.
    await request(server)
      .post(`/service-hours/${hoursId}/photos`)
      .set(auth(volunteer))
      .attach('file', Buffer.from('%PDF-1.4 hola'), 'x.pdf')
      .expect(400);
    // Tope de 4 fotos por sesión.
    for (let i = 0; i < 3; i += 1) {
      await request(server)
        .post(`/service-hours/${hoursId}/photos`)
        .set(auth(volunteer))
        .attach('file', png, `j${i}.png`)
        .expect(201);
    }
    const fifth = await request(server)
      .post(`/service-hours/${hoursId}/photos`)
      .set(auth(volunteer))
      .attach('file', png, 'j5.png')
      .expect(400);
    expect(fifth.body.message).toContain('hasta 4 fotos');

    // El voluntario ve cuántas fotos tiene cada sesión.
    const mine = await request(server).get('/service-hours/mine').set(auth(volunteer)).expect(200);
    expect(mine.body.find((h: { id: string }) => h.id === hoursId).photos).toHaveLength(4);

    // La organización las ve en la sesión y descarga el archivo (JPEG reducido).
    const list = await request(server)
      .get(`/service-hours?enrollmentId=${enrollmentId}`)
      .set(auth(org))
      .expect(200);
    const session = list.body.items.find((h: { id: string }) => h.id === hoursId);
    expect(session.photos).toHaveLength(4);
    const file = await request(server)
      .get(`/service-hours/${hoursId}/photos/${added.body.id}/file`)
      .set(auth(org))
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    const meta = await sharp(file.body as Buffer).metadata();
    expect(meta.format).toBe('jpeg');
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1280);

    // Otra organización: 404. La persona voluntaria no descarga por esta vía (rol de org).
    await request(server)
      .get(`/service-hours/${hoursId}/photos/${added.body.id}/file`)
      .set(auth(otherOrg))
      .expect(404);
    await request(server)
      .get(`/service-hours/${hoursId}/photos/${added.body.id}/file`)
      .set(auth(volunteer))
      .expect(403);
  });

  it('el reporte de voluntariado incluye a quien anexó horas aún sin aprobar, con sus fotos', async () => {
    // La voluntaria autoriza que la organización la identifique en sus reportes.
    const consents = await request(server).get('/me/consents').set(auth(volunteer)).expect(200);
    const text = consents.body.texts[0];
    await request(server)
      .post('/me/consents')
      .set(auth(volunteer))
      .send({ organizationId: org.orgId, purpose: text.purpose, version: text.version })
      .expect(201);

    const report = await request(server)
      .post('/org/reports')
      .set(auth(org))
      .send({ kind: 'social_service', periodStart: day(-30), periodEnd: today })
      .expect(201);
    expect(report.body.summary).toMatchObject({ rowCount: 1, volunteers: 1 });
    const stored = await admin.orgReport.findUniqueOrThrow({ where: { id: report.body.id } });
    const payload = stored.payload as {
      rows: Array<{
        volunteerName: string;
        pendingHoursInPeriod: number;
        sessionsInPeriod: number;
        photos?: Array<{ id: string }>;
      }>;
    };
    expect(payload.rows[0]).toMatchObject({
      volunteerName: expect.stringContaining('Voluntaria a'),
      pendingHoursInPeriod: 5,
      sessionsInPeriod: 2,
    });
    expect(payload.rows[0].photos).toHaveLength(4);

    const pdf = await request(server)
      .get(`/org/reports/${report.body.id}/pdf`)
      .set(auth(org))
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    expect(await countImages(pdf.body as Buffer)).toBeGreaterThanOrEqual(4);
  });

  it('el certificado lleva la firma registrada del representante legal, también si es una foto JPG', async () => {
    // Aprobar las horas y emitir.
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
    const cert = await request(server)
      .post(`/volunteer-certificates/${enrollmentId}`)
      .set(auth(org))
      .send()
      .expect(201);

    const download = async () =>
      (
        await request(server)
          .get(`/volunteer-certificates/${cert.body.id}/pdf`)
          .set(auth(volunteer))
          .buffer(true)
          .parse(binaryParser)
          .expect(200)
      ).body as Buffer;

    // Sin firma registrada: no se inventa ninguna imagen.
    expect(await countImages(await download())).toBe(0);

    // Firma registrada por el flujo real, subida como FOTO (JPEG). Antes se
    // descartaba en silencio porque solo se intentaba PNG.
    const jpeg = await sharp({
      create: { width: 300, height: 120, channels: 3, background: '#ffffff' },
    })
      .jpeg()
      .toBuffer();
    await request(server)
      .post('/org/legal-representative')
      .set(auth(org))
      .send({
        role: 'legal_representative',
        fullName: 'Laura Representante',
        documentType: 'cedula_ciudadania',
        documentNumber: '52000111',
        position: 'Representante legal',
        signatureBase64: jpeg.toString('base64'),
        signatureContentType: 'image/jpeg',
      })
      .expect(201);
    const signed = await download();
    expect(await countImages(signed)).toBe(1);
    const text = signed.toString('latin1');
    expect(text).toContain('/DCTDecode'); // la imagen JPEG de la firma

    // También una firma dibujada (PNG).
    const pngSig = await sharp({
      create: { width: 300, height: 120, channels: 4, background: '#00000000' },
    })
      .png()
      .toBuffer();
    await request(server)
      .post('/org/legal-representative')
      .set(auth(org))
      .send({
        role: 'legal_representative',
        fullName: 'Laura Representante',
        documentType: 'cedula_ciudadania',
        documentNumber: '52000111',
        position: 'Representante legal',
        signatureBase64: pngSig.toString('base64'),
        signatureContentType: 'image/png',
      })
      .expect(201);
    // PNG con transparencia: imagen + su máscara alfa.
    expect(await countImages(await download())).toBeGreaterThanOrEqual(1);
  });
});

/** Imágenes incrustadas en un PDF (XObjects de tipo Image). */
async function countImages(bytes: Buffer): Promise<number> {
  const pdf = await PDFDocument.load(bytes);
  let count = 0;
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    const dict = obj instanceof PDFRawStream ? obj.dict : obj instanceof PDFDict ? obj : null;
    if (dict?.get(PDFName.of('Subtype')) === PDFName.of('Image')) count += 1;
  }
  return count;
}
