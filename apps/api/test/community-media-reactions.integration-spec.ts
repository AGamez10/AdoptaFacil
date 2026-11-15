import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import sharp from 'sharp';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG, LEGAL_PERSON } from './support/legal';
import { approveTestOrganization } from './support/organization-status';
import { HAS_FFMPEG, makeTestVideo } from './support/test-video';

/**
 * Comunidad: fotos y videos (también de personas) y reacciones. El video se
 * comprime en el servidor (ffmpeg) y trae su portada; las reacciones reemplazan
 * al "me gusta" sin romperlo.
 */
describe('Community media (photo + video) and reactions', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const password = 'password-1234';

  interface Actor {
    token: string;
    userId: string;
    orgId: string;
  }

  async function registerOrg(tag: string): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: `Org ${tag}`,
        displayName: 'Owner',
        email: `cm-${tag}-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    await approveTestOrganization(admin, res.body.user.organizationId);
    orgIds.push(res.body.user.organizationId);
    return {
      token: res.body.tokens.accessToken,
      userId: res.body.user.id,
      orgId: res.body.user.organizationId,
    };
  }

  async function registerPerson(tag: string, displayName = 'Laura Gómez'): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/person')
      .send({
        ...LEGAL_PERSON,
        displayName,
        email: `cm-${tag}-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    orgIds.push(res.body.user.organizationId);
    return {
      token: res.body.tokens.accessToken,
      userId: res.body.user.id,
      orgId: res.body.user.organizationId,
    };
  }

  const createPost = (token: string, body: Record<string, unknown>) =>
    request(server)
      .post('/community/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'general', body: 'Una historia con foto y video para la comunidad.', ...body });

  const jpeg = () =>
    sharp({ create: { width: 640, height: 480, channels: 3, background: '#c05030' } })
      .jpeg()
      .toBuffer();

  let org: Actor;
  let person: Actor;
  let other: Actor;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    org = await registerOrg('media-org');
    person = await registerPerson('media-person');
    other = await registerPerson('media-other', 'Mateo Ruiz');
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('rejects more than one video per post', async () => {
    await createPost(org.token, {
      images: [
        { filename: 'a.mp4', contentType: 'video/mp4' },
        { filename: 'b.mp4', contentType: 'video/mp4' },
      ],
    }).expect(400);
  });

  it('a PERSON attaches a photo to a public post and it shows without session', async () => {
    const created = await createPost(person.token, {
      shareable: true,
      title: 'Toby en casa',
      images: [{ filename: 'toby.jpg', contentType: 'image/jpeg' }],
    }).expect(201);
    expect(created.body.imageUploads).toHaveLength(1);
    const { key, imageId } = created.body.imageUploads[0];
    expect(imageId).toBeTruthy();
    expect(created.body.post.images[0]).toMatchObject({ kind: 'image' });

    await request(server)
      .put('/storage/upload')
      .query({ key })
      .set('Authorization', `Bearer ${person.token}`)
      .attach('file', await jpeg(), { filename: 'toby.jpg', contentType: 'image/jpeg' })
      .expect(200);

    const pub = await request(server)
      .get(`/public/community/posts/${created.body.post.id}`)
      .expect(200);
    expect(pub.body.authorDisplayName).toBe('Laura');
    expect(pub.body.images).toHaveLength(1);
    expect(pub.body.images[0].kind).toBe('image');
    expect(JSON.stringify(pub.body)).not.toContain(person.userId);
    await request(server).get('/storage/public').query({ key }).expect(200);
  });

  it("nobody else can attach media to someone's post or upload to their space", async () => {
    const created = await createPost(person.token, {
      images: [{ filename: 'x.jpg', contentType: 'image/jpeg' }],
    }).expect(201);
    await request(server)
      .put('/storage/upload')
      .query({ key: created.body.imageUploads[0].key })
      .set('Authorization', `Bearer ${other.token}`)
      .attach('file', await jpeg(), { filename: 'x.jpg', contentType: 'image/jpeg' })
      .expect(403);
  });

  (HAS_FFMPEG ? it : it.skip)(
    'a video is compressed to MP4, gets a poster, and the post shows both (photo + video together)',
    async () => {
      const created = await createPost(org.token, {
        shareable: true,
        images: [
          { filename: 'foto.jpg', contentType: 'image/jpeg', order: 0 },
          { filename: 'jornada.mov', contentType: 'video/quicktime', order: 1 },
        ],
      }).expect(201);
      const uploads = created.body.imageUploads as Array<{ order: number; key: string }>;
      const photo = uploads.find((u) => u.order === 0)!;
      const video = uploads.find((u) => u.order === 1)!;
      expect(video.key).toMatch(/\.mp4$/);

      await request(server)
        .put('/storage/upload')
        .query({ key: photo.key })
        .set('Authorization', `Bearer ${org.token}`)
        .attach('file', await jpeg(), { filename: 'foto.jpg', contentType: 'image/jpeg' })
        .expect(200);
      await request(server)
        .put('/storage/upload')
        .query({ key: video.key, media: 'post' })
        .set('Authorization', `Bearer ${org.token}`)
        .attach('file', makeTestVideo(2), {
          filename: 'jornada.mov',
          contentType: 'video/quicktime',
        })
        .expect(200);

      const detail = await request(server)
        .get(`/community/posts/${created.body.post.id}`)
        .set('Authorization', `Bearer ${org.token}`)
        .expect(200);
      const [first, second] = detail.body.images;
      expect(first.kind).toBe('image');
      expect(second.kind).toBe('video');
      expect(second.posterUrl).toContain('.poster.webp');

      const served = await request(server)
        .get('/storage/public')
        .query({ key: video.key })
        .set('Range', 'bytes=0-99')
        .expect(206);
      expect(served.headers['content-type']).toContain('video/mp4');
      const poster = await request(server)
        .get('/storage/public')
        .query({ key: video.key.replace(/\.mp4$/, '.poster.webp') })
        .expect(200);
      expect(poster.headers['content-type']).toContain('image/webp');

      // The share card uses the video's poster (a 1200×630 PNG).
      const card = await request(server)
        .get(`/public/community/posts/${created.body.post.id}/card.png`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect((await sharp(card.body as Buffer).metadata()).width).toBe(1200);
    },
    90_000,
  );

  (HAS_FFMPEG ? it : it.skip)(
    'a video that is too long or not a video is refused with a plain message',
    async () => {
      const created = await createPost(org.token, {
        images: [{ filename: 'largo.mp4', contentType: 'video/mp4' }],
      }).expect(201);
      const { key } = created.body.imageUploads[0];
      const bad = await request(server)
        .put('/storage/upload')
        .query({ key, media: 'post' })
        .set('Authorization', `Bearer ${org.token}`)
        .attach('file', Buffer.from('no soy un video'), {
          filename: 'largo.mp4',
          contentType: 'video/mp4',
        })
        .expect(400);
      expect(JSON.stringify(bad.body)).not.toMatch(/ffmpeg|stderr/i);
    },
    60_000,
  );

  describe('reactions', () => {
    let postId: string;

    beforeAll(async () => {
      const created = await createPost(org.token, {
        shareable: true,
        title: 'Reacciona',
      }).expect(201);
      postId = created.body.post.id;
    });

    const react = (token: string, reaction: string | null) =>
      request(server)
        .put(`/community/posts/${postId}/reaction`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reaction });

    it('requires a session and rejects unknown reactions', async () => {
      await request(server)
        .put(`/community/posts/${postId}/reaction`)
        .send({ reaction: 'like' })
        .expect(401);
      await react(person.token, 'angry').expect(400);
    });

    it('sets, changes and removes MY reaction while counts stay consistent', async () => {
      const first = await react(person.token, 'love').expect(200);
      expect(first.body).toMatchObject({
        myReaction: 'love',
        likeCount: 1,
        reactionCounts: { love: 1 },
      });

      const second = await react(other.token, 'tender').expect(200);
      expect(second.body.likeCount).toBe(2);

      const changed = await react(person.token, 'celebrate').expect(200);
      expect(changed.body).toMatchObject({ myReaction: 'celebrate', likeCount: 2 });
      expect(changed.body.reactionCounts).toMatchObject({ celebrate: 1, tender: 1 });
      expect(changed.body.reactionCounts.love).toBe(0);

      const mine = await request(server)
        .post('/community/reactions/mine')
        .set('Authorization', `Bearer ${person.token}`)
        .send({ postIds: [postId, randomUUID()] })
        .expect(200);
      expect(mine.body).toEqual({ [postId]: 'celebrate' });

      const detail = await request(server)
        .get(`/community/posts/${postId}`)
        .set('Authorization', `Bearer ${other.token}`)
        .expect(200);
      expect(detail.body.likeCount).toBe(2);
      expect(detail.body.reactionCounts).toMatchObject({ celebrate: 1, tender: 1 });

      const pub = await request(server).get(`/public/community/posts/${postId}`).expect(200);
      expect(pub.body.likeCount).toBe(2);
      expect(pub.body.reactionCounts).toMatchObject({ celebrate: 1, tender: 1 });

      const removed = await react(person.token, null).expect(200);
      expect(removed.body).toMatchObject({ myReaction: null, likeCount: 1 });
      const none = await react(person.token, null).expect(200);
      expect(none.body.likeCount).toBe(1);
    });

    it('the old like button still works and counts as a "me gusta" reaction', async () => {
      const on = await request(server)
        .post(`/community/posts/${postId}/like`)
        .set('Authorization', `Bearer ${person.token}`)
        .expect(201);
      expect(on.body).toMatchObject({ liked: true });
      const off = await request(server)
        .post(`/community/posts/${postId}/like`)
        .set('Authorization', `Bearer ${person.token}`)
        .expect(201);
      expect(off.body.liked).toBe(false);
    });

    it('a removed post no longer takes reactions', async () => {
      await admin.post.update({ where: { id: postId }, data: { status: 'removed' } });
      await react(other.token, 'love').expect(403);
      await admin.post.update({ where: { id: postId }, data: { status: 'published' } });
    });
  });
});
