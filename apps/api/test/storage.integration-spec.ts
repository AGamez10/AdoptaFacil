import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import sharp from 'sharp';
import { Role } from '@adoptafacil/contracts';
import { AppModule } from '../src/app.module';
import { PasswordService } from '../src/core/auth/password.service';
import { TokenService } from '../src/core/auth/token.service';
import { HAS_FFMPEG, makeTestVideo } from './support/test-video';
import type { Env } from '../src/config/env.validation';
import { DiskStorageAdapter } from '../src/core/storage/disk-storage.adapter';
import { STORAGE_PORT } from '../src/core/storage/storage.port';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG } from './support/legal';

/**
 * T-108 storage endpoints with the REAL disk adapter (bytes persisted to a temp
 * root). Private legal documents: only the owning org's Owner or a platform admin
 * download them (others 403, no session 401); public animal photos: anyone. Plus
 * path-traversal and content-type rejection on upload.
 */
describe('Storage (T-108: disk adapter, private vs public serving)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];
  const password = 'password-1234';
  const storageRoot = mkdtempSync(join(tmpdir(), 'adoptafacil-it-'));

  interface Actor {
    token: string;
    orgId: string;
    userId: string;
  }

  async function registerOrg(): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: 'Refugio',
        displayName: 'Owner',
        email: `t108-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    createdOrgIds.push(res.body.user.organizationId);
    return {
      token: res.body.tokens.accessToken,
      orgId: res.body.user.organizationId,
      userId: res.body.user.id,
    };
  }

  let ownerA: Actor;
  let ownerB: Actor;
  let platformAdmin: Actor;
  let docKey = '';
  let photoKey = '';
  const docBytes = Buffer.from('%PDF-1.4 fake legal document bytes');
  // Las fotos se recomprimen a WebP, así que la prueba usa una imagen real.
  let photoBytes: Buffer = Buffer.alloc(0);

  const upload = (
    token: string,
    key: string,
    bytes: Buffer,
    filename: string,
    contentType: string,
  ) =>
    request(server)
      .put(`/storage/upload?key=${encodeURIComponent(key)}`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', bytes, { filename, contentType });

  // supertest does not parse binary bodies by default — collect the raw bytes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const binaryParser = (res: any, cb: (err: Error | null, body: Buffer) => void): void => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  };

  beforeAll(async () => {
    photoBytes = await sharp({
      create: { width: 64, height: 48, channels: 3, background: { r: 200, g: 40, b: 40 } },
    })
      .png()
      .toBuffer();
    const diskConfig = {
      get: (key: string) =>
        (
          ({
            STORAGE_DISK_ROOT: storageRoot,
            STORAGE_MAX_FILE_MB: 15,
            STORAGE_PUBLIC_BASE_URL: 'http://localhost:3000',
          }) as Record<string, unknown>
        )[key],
    } as unknown as ConfigService<Env, true>;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STORAGE_PORT)
      .useValue(new DiskStorageAdapter(diskConfig))
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    ownerA = await registerOrg();
    ownerB = await registerOrg();
    platformAdmin = await registerOrg();
    await admin.userRole.create({
      data: {
        organizationId: platformAdmin.orgId,
        userId: platformAdmin.userId,
        role: 'platform_admin',
      },
    });

    // Reserve a PRIVATE legal document for org A (Owner/Administrator).
    const doc = await request(server)
      .post('/org/documents')
      .set('Authorization', `Bearer ${ownerA.token}`)
      .send({ type: 'rut', filename: 'demanda.pdf' })
      .expect(201);
    docKey = doc.body.upload.key;
    expect(docKey.startsWith(`private/${ownerA.orgId}/`)).toBe(true);

    // Reserve a PUBLIC animal photo for org A.
    const animal = await request(server)
      .post('/animals')
      .set('Authorization', `Bearer ${ownerA.token}`)
      .send({
        approximateAgeMonths: 12,
        name: 'Firu',
        species: 'dog',
        sex: 'male',
        size: 'medium',
        photos: [{ filename: 'firu.png' }],
      })
      .expect(201);
    photoKey = animal.body.photoRecords[0].storageRef;
    expect(photoKey.startsWith(`public/${ownerA.orgId}/`)).toBe(true);
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
    rmSync(storageRoot, { recursive: true, force: true });
  });

  it('persists real bytes and serves an identical private document to its Owner', async () => {
    await upload(ownerA.token, docKey, docBytes, 'demanda.pdf', 'application/pdf').expect(200);

    const res = await request(server)
      .get(`/storage/private?key=${encodeURIComponent(docKey)}`)
      .set('Authorization', `Bearer ${ownerA.token}`)
      .buffer()
      .parse(binaryParser)
      .expect(200);
    expect((res.body as Buffer).equals(docBytes)).toBe(true);
    expect(res.headers['content-type']).toContain('application/pdf');
    // Se ve en el navegador (no se fuerza la descarga), aislado y sin caché.
    expect(res.headers['content-disposition']).toBe('inline; filename="demanda.pdf"');
    expect(res.headers['content-security-policy']).toContain('sandbox');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it('never replaces the bytes of a private document already uploaded (409)', async () => {
    await upload(
      ownerA.token,
      docKey,
      Buffer.from('%PDF-1.4 otro contenido'),
      'demanda.pdf',
      'application/pdf',
    ).expect(409);
  });

  it('decides the type by content: HTML or an executable named .pdf is rejected', async () => {
    const fresh = await request(server)
      .post('/org/documents')
      .set('Authorization', `Bearer ${ownerA.token}`)
      .send({ type: 'other', filename: 'acta.pdf' })
      .expect(201);
    const key: string = fresh.body.upload.key;
    await upload(
      ownerA.token,
      key,
      Buffer.from('<html><script>alert(1)</script></html>'),
      'acta.pdf',
      'application/pdf',
    ).expect(400);
    await upload(
      ownerA.token,
      key,
      Buffer.from('MZ\x90\0', 'latin1'),
      'acta.pdf',
      'application/pdf',
    ).expect(400);
  });

  it('lets a PlatformAdmin download the private document, but blocks another org (403) and anonymous (401)', async () => {
    await request(server)
      .get(`/storage/private?key=${encodeURIComponent(docKey)}`)
      .set('Authorization', `Bearer ${platformAdmin.token}`)
      .expect(200);
    await request(server)
      .get(`/storage/private?key=${encodeURIComponent(docKey)}`)
      .set('Authorization', `Bearer ${ownerB.token}`)
      .expect(403);
    await request(server)
      .get(`/storage/private?key=${encodeURIComponent(docKey)}`)
      .expect(401);
  });

  it('audits private-document downloads (UTC), without content', async () => {
    const events = await admin.auditLog.findMany({
      where: { organizationId: ownerA.orgId, action: 'storage.document_downloaded' },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(events[0].metadata)).not.toContain('PDF');
  });

  it('serves a public animal photo to anyone (no session)', async () => {
    await upload(ownerA.token, photoKey, photoBytes, 'firu.png', 'image/png').expect(200);
    const res = await request(server)
      .get(`/storage/public?key=${encodeURIComponent(photoKey)}`)
      .buffer()
      .parse(binaryParser)
      .expect(200);
    const body = res.body as Buffer;
    expect(res.headers['content-type']).toMatch(/^image\//);
    // Plan de escala (B2): la CDN puede guardarla; la clave no cambia de contenido.
    expect(res.headers['cache-control']).toBe('public, max-age=2592000, immutable');
    expect((await sharp(body).metadata()).width).toBe(64);
  });

  it('does not serve a private document through the public endpoint (404)', async () => {
    await request(server)
      .get(`/storage/public?key=${encodeURIComponent(docKey)}`)
      .expect(404);
  });

  it('rejects path traversal, foreign-org upload and disallowed content types', async () => {
    // Path traversal key → invalid key.
    await request(server)
      .put(`/storage/upload?key=${encodeURIComponent('../../etc/passwd')}`)
      .set('Authorization', `Bearer ${ownerA.token}`)
      .attach('file', docBytes, { filename: 'x', contentType: 'application/pdf' })
      .expect(400);
    // Uploading to another org's key → forbidden.
    await upload(ownerB.token, docKey, docBytes, 'demanda.pdf', 'application/pdf').expect(403);
    // Disallowed content type → rejected.
    await upload(ownerA.token, photoKey, Buffer.from('hi'), 'note.txt', 'text/plain').expect(400);
    // Bytes declared as an image that are not one → rejected (la foto no se puede procesar).
    await upload(
      ownerA.token,
      photoKey,
      Buffer.from('not an image'),
      'fake.png',
      'image/png',
    ).expect(400);
  });

  it('accepts a public video (Historias cover), serves byte ranges, and never a video to a private key', async () => {
    const video = await request(server)
      .post('/org/profile/uploads')
      .set('Authorization', `Bearer ${ownerA.token}`)
      .send({ filename: 'portada.mp4', contentType: 'video/mp4' })
      .expect(201);
    const videoKey: string = video.body.key;
    // Cabecera `ftyp` real: el tipo se decide por los bytes.
    const videoBytes = Buffer.concat([
      Buffer.from('\0\0\0\x18ftypisom', 'latin1'),
      Buffer.from(Array.from({ length: 88 }, (_, i) => i)),
    ]);
    await upload(ownerA.token, videoKey, videoBytes, 'portada.mp4', 'video/mp4').expect(200);

    const full = await request(server)
      .get(`/storage/public?key=${encodeURIComponent(videoKey)}`)
      .buffer()
      .parse(binaryParser)
      .expect(200);
    expect(full.headers['accept-ranges']).toBe('bytes');
    expect(full.headers['content-type']).toContain('video/mp4');

    const part = await request(server)
      .get(`/storage/public?key=${encodeURIComponent(videoKey)}`)
      .set('Range', 'bytes=10-19')
      .buffer()
      .parse(binaryParser)
      .expect(206);
    expect(part.headers['content-range']).toBe(`bytes 10-19/${videoBytes.length}`);
    expect((part.body as Buffer).equals(videoBytes.subarray(10, 20))).toBe(true);

    await request(server)
      .get(`/storage/public?key=${encodeURIComponent(videoKey)}`)
      .set('Range', 'bytes=500-')
      .expect(416);

    // A video never goes into a private (legal document) key.
    await upload(ownerA.token, docKey, videoBytes, 'x.mp4', 'video/mp4').expect(400);
  });
  /**
   * Security remediation `storage-upload-public-key-overwrite-no-rbac` and
   * `tenant-membership-not-revalidated:jwt-org-from-auth-credential`: no role
   * may replace the bytes behind a published key (evidence, logo, photo), a
   * ReadOnlyAuditor writes nothing and a removed member (no role left, access
   * token still alive) is refused.
   */
  describe('write-once keys and the uploader role (security remediation)', () => {
    async function memberOf(orgId: string, role: Role): Promise<Actor> {
      const userId = randomUUID();
      const email = `t108-member-${randomUUID()}@test.local`;
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
        data: {
          userId,
          organizationId: orgId,
          accountType: 'organization',
          email,
          passwordHash: await new PasswordService().hash(password),
        },
      });
      await admin.userRole.create({ data: { organizationId: orgId, userId, role } });
      const tokens = await app
        .get(TokenService)
        .issueTokens({ userId, organizationId: orgId, accountType: 'organization', email });
      return { token: tokens.accessToken, userId, orgId };
    }

    const publicKey = (orgId: string, name: string) => `public/${orgId}/${randomUUID()}-${name}`;
    const otherPhoto = () =>
      sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 0, g: 0, b: 255 } } })
        .png()
        .toBuffer();
    const servedWidth = async (key: string): Promise<number | undefined> => {
      const res = await request(server)
        .get(`/storage/public?key=${encodeURIComponent(key)}`)
        .buffer()
        .parse(binaryParser)
        .expect(200);
      return (await sharp(res.body as Buffer).metadata()).width;
    };

    it('never replaces a published public file, whoever asks (409, bytes unchanged)', async () => {
      const key = publicKey(ownerA.orgId, 'evidencia.png');
      await upload(ownerA.token, key, photoBytes, 'evidencia.png', 'image/png').expect(200);
      const volunteer = await memberOf(ownerA.orgId, Role.Volunteer);
      const swap = await otherPhoto();
      await upload(volunteer.token, key, swap, 'evidencia.png', 'image/png').expect(409);
      await upload(ownerA.token, key, swap, 'evidencia.png', 'image/png').expect(409);
      expect(await servedWidth(key)).toBe(64);
    });

    it('still lets operational roles upload a NEW key', async () => {
      for (const role of [Role.Volunteer, Role.Operator, Role.TemporaryCollaborator]) {
        const member = await memberOf(ownerA.orgId, role);
        const key = publicKey(ownerA.orgId, `foto-${role}.png`);
        await upload(member.token, key, photoBytes, 'foto.png', 'image/png').expect(200);
      }
    });

    it('refuses a ReadOnlyAuditor (403), nothing stored', async () => {
      const auditor = await memberOf(ownerA.orgId, Role.ReadOnlyAuditor);
      const key = publicKey(ownerA.orgId, 'auditor.png');
      await upload(auditor.token, key, photoBytes, 'auditor.png', 'image/png').expect(403);
      await request(server)
        .get(`/storage/public?key=${encodeURIComponent(key)}`)
        .expect(404);
    });

    // Security remediation run-2 F-01 (`storage-upload-video-poster-derived-key-overwrite`):
    // a `…-video.mov` upload derived the poster of the published `…-video.mp4`
    // and overwrote it. Now a video key must be `.mp4` and the derived poster
    // is write-once too.
    (HAS_FFMPEG ? it : it.skip)(
      'never replaces the poster of a published video through a sibling key',
      async () => {
        const video = makeTestVideo(1, '320x240');
        const base = `public/${ownerA.orgId}/${randomUUID()}-video`;
        const send = (token: string, key: string) =>
          request(server)
            .put(`/storage/upload?key=${encodeURIComponent(key)}&media=post`)
            .set('Authorization', `Bearer ${token}`)
            .attach('file', video, { filename: 'clip.mov', contentType: 'video/quicktime' });
        await send(ownerA.token, `${base}.mp4`).expect(200);
        const poster = `${base}.poster.webp`;
        const before = await request(server)
          .get(`/storage/public?key=${encodeURIComponent(poster)}`)
          .buffer()
          .parse(binaryParser)
          .expect(200);

        const volunteer = await memberOf(ownerA.orgId, Role.Volunteer);
        await send(volunteer.token, `${base}.mov`).expect(400);
        await send(volunteer.token, `${base}.webm`).expect(400);
        // Even through a `.mp4` key whose poster already exists: 409.
        await upload(ownerA.token, poster, photoBytes, 'p.png', 'image/png').expect(409);

        const after = await request(server)
          .get(`/storage/public?key=${encodeURIComponent(poster)}`)
          .buffer()
          .parse(binaryParser)
          .expect(200);
        expect((after.body as Buffer).equals(before.body as Buffer)).toBe(true);
      },
      60_000,
    );

    it('two concurrent uploads to the same new key: exactly one wins (atomic write-once)', async () => {
      const key = publicKey(ownerA.orgId, 'carrera.png');
      const other = await otherPhoto();
      const results = await Promise.all([
        upload(ownerA.token, key, photoBytes, 'a.png', 'image/png'),
        upload(ownerA.token, key, other, 'b.png', 'image/png'),
        upload(ownerA.token, key, photoBytes, 'c.png', 'image/png'),
      ]);
      const codes = results.map((r) => r.status).sort();
      expect(codes).toEqual([200, 409, 409]);
    });

    it('refuses a removed member whose access token is still valid (403)', async () => {
      const operator = await memberOf(ownerA.orgId, Role.Operator);
      await request(server)
        .delete(`/org/members/${operator.userId}`)
        .set('Authorization', `Bearer ${ownerA.token}`)
        .expect(204);
      const key = publicKey(ownerA.orgId, 'exmiembro.png');
      await upload(operator.token, key, photoBytes, 'x.png', 'image/png').expect(403);
      await request(server)
        .get(`/storage/public?key=${encodeURIComponent(key)}`)
        .expect(404);
    });
  });
});
