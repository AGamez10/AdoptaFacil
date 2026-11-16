import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import sharp from 'sharp';
import { AppModule } from '../src/app.module';
import { NOTIFICATION_PORT } from '../src/core/notifications/notification.port';
import {
  CAMPAIGN_BROADCAST_AUDIT_ACTION,
  MAX_CAMPAIGN_BROADCASTS_PER_DAY,
} from '../src/modules/community/community-posts.service';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_PERSON, LEGAL_ORG } from './support/legal';

/**
 * M11 (F-8, Ola 3) — comunidad: publicaciones, comentarios y likes,
 * compartidos entre organizaciones Y personas (feed cruzado por diseño).
 * Verifica RBAC (deny-by-default), el criterio de organizationId (organización
 * vs. Persona), el ciclo de vida (editar/borrar propio), comentarios/likes
 * cross-tenant, y la moderación básica de plataforma. La no-filtración
 * cross-organización vive en `rls-no-leak-community.integration-spec.ts`.
 */
describe('Community (M11, F-8: posts, comments, likes, RBAC, moderation)', () => {
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

  async function registerOrg(tag: string): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: `Org ${tag}`,
        displayName: 'Owner',
        email: `com-${tag}-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
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
        displayName: 'Vecina',
        email: `com-${tag}-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    orgIds.push(res.body.user.organizationId);
    return {
      token: res.body.tokens.accessToken,
      orgId: res.body.user.organizationId,
      userId: res.body.user.id,
    };
  }

  async function actorWithRoles(tag: string, roles: string[]): Promise<Actor> {
    const actor = await registerOrg(tag);
    await admin.userRole.deleteMany({ where: { userId: actor.userId } });
    for (const role of roles) {
      await admin.userRole.create({
        data: { organizationId: actor.orgId, userId: actor.userId, role },
      });
    }
    return actor;
  }

  const createPost = (token: string, body: Record<string, unknown> = {}) =>
    request(server)
      .post('/community/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'general',
        body: 'Esta es mi publicación en la comunidad de AdoptaFácil.',
        ...body,
      });

  let org: Actor;
  let person: Actor;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    org = await registerOrg('org');
    person = await registerPerson('person');
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('RBAC: no token → 401', async () => {
    await request(server).post('/community/posts').send({}).expect(401);
  });

  it('rejects a body shorter than 10 characters', async () => {
    await createPost(org.token, { body: 'corto' }).expect(400);
  });

  let orgPostId = '';

  it('an ORGANIZATION publishes — organizationId is its own org', async () => {
    const res = await createPost(org.token).expect(201);
    orgPostId = res.body.post.id;
    expect(res.body.post).toMatchObject({
      organizationId: org.orgId,
      authorUserId: org.userId,
      status: 'published',
      commentCount: 0,
      likeCount: 0,
    });
    expect(res.body.imageUploads).toEqual([]);
  });

  it('publishing with a photo returns a real upload target, and the bytes become publicly servable', async () => {
    const res = await createPost(org.token, {
      images: [{ filename: 'evento.jpg', contentType: 'image/jpeg' }],
    }).expect(201);
    expect(res.body.post.images).toHaveLength(1);
    expect(res.body.imageUploads).toHaveLength(1);
    const { imageId, key, url } = res.body.imageUploads[0];
    expect(imageId).toBe(res.body.post.images[0].id);
    expect(url).toBeTruthy();

    await request(server)
      .put('/storage/upload')
      .query({ key })
      .set('Authorization', `Bearer ${org.token}`)
      .attach(
        'file',
        await sharp({
          create: { width: 64, height: 48, channels: 3, background: { r: 30, g: 120, b: 90 } },
        })
          .jpeg()
          .toBuffer(),
        {
          filename: 'evento.jpg',
          contentType: 'image/jpeg',
        },
      )
      .expect(200);
    await request(server).get('/storage/public').query({ key }).expect(200);
  });

  let personPostId = '';

  it('a PERSONA publishes — organizationId is ABSENT (platform-wide)', async () => {
    const res = await createPost(person.token, {
      type: 'event',
      title: 'Jornada de adopción',
    }).expect(201);
    personPostId = res.body.post.id;
    expect(res.body.post.organizationId).toBeUndefined();
    expect(res.body.post).toMatchObject({ authorUserId: person.userId, type: 'event' });
  });

  it('a campaign-type org post does not fail even with zero past donors', async () => {
    await createPost(org.token, { type: 'campaign', title: 'Nueva campaña' }).expect(201);
  });

  /**
   * Security remediation `community-campaign-post-donor-broadcast-no-role-check`:
   * a campaign post e-mails the donors under the organization's name, so only
   * Owner/Administrator publish one; a removed member publishes nothing; and the
   * donors are e-mailed at most MAX_CAMPAIGN_BROADCASTS_PER_DAY times a day.
   */
  describe('donor broadcast (security remediation)', () => {
    let send: jest.SpyInstance;
    // One organization for the whole block (sign-ups are rate limited); its
    // registrant's roles are swapped per case.
    let member: Actor;
    beforeAll(async () => {
      member = await actorWithRoles('broadcast', []);
      await admin.donation.create({
        data: {
          organizationId: member.orgId,
          conceptKind: 'organization',
          conceptId: member.orgId,
          intendedAmount: 10000,
          amountCharged: 10400,
          breakdown: {},
          collectionId: `col-${randomUUID()}`,
          idempotencyKey: randomUUID(),
          status: 'approved',
          payer: { email: `donante-${randomUUID()}@test.local`, fullName: 'Donante' },
        },
      });
    });
    beforeEach(() => {
      send = jest.spyOn(app.get(NOTIFICATION_PORT), 'send');
    });
    afterEach(() => send.mockRestore());

    async function setRoles(roles: string[]): Promise<void> {
      await admin.userRole.deleteMany({ where: { userId: member.userId } });
      for (const role of roles) {
        await admin.userRole.create({
          data: { organizationId: member.orgId, userId: member.userId, role },
        });
      }
    }
    const campaignSends = () =>
      send.mock.calls.filter(([n]) => n?.template?.event === 'community.campaign_update').length;
    const campaign = { type: 'campaign', title: 'Urgente', body: 'Confirma tu donación aquí ya.' };
    const campaignPosts = () =>
      admin.post.count({ where: { organizationId: member.orgId, type: 'campaign' } });

    it.each(['read_only_auditor', 'volunteer', 'temporary_collaborator', 'operator'])(
      '%s cannot publish a campaign post (403) and nothing is queued',
      async (role) => {
        await setRoles([role]);
        await createPost(member.token, campaign).expect(403);
        expect(campaignSends()).toBe(0);
        expect(await campaignPosts()).toBe(0);
        // A regular post keeps working for every member.
        await createPost(member.token).expect(201);
      },
    );

    // Run-2 R-04: refused by the auth guard (401) before the service's own
    // role check (which stays as defense in depth).
    it('a member left without roles cannot publish at all (401, former member)', async () => {
      await setRoles([]);
      const res = await createPost(member.token).expect(401);
      expect(res.body.code).toBe('MEMBERSHIP_REVOKED');
      await createPost(member.token, campaign).expect(401);
      expect(campaignSends()).toBe(0);
    });

    it('Owner and Administrator broadcast to donors, capped per day', async () => {
      await setRoles(['administrator']);
      await createPost(member.token, campaign).expect(201);
      expect(campaignSends()).toBe(1);

      await setRoles(['owner']);
      for (let i = 1; i < MAX_CAMPAIGN_BROADCASTS_PER_DAY; i++) {
        await createPost(member.token, campaign).expect(201);
      }
      expect(campaignSends()).toBe(MAX_CAMPAIGN_BROADCASTS_PER_DAY);
      // Over the cap: published on the wall, donors not e-mailed again.
      send.mockClear();
      await createPost(member.token, campaign).expect(201);
      expect(campaignSends()).toBe(0);
      expect(await campaignPosts()).toBe(MAX_CAMPAIGN_BROADCASTS_PER_DAY + 1);
    });

    // Run-2 F-02: the cap used to count posts, so deleting them reset it.
    it('deleting the campaign posts does not reset the cap (counted from the audit log)', async () => {
      await setRoles(['owner']);
      const ids = (
        await admin.post.findMany({
          where: { organizationId: member.orgId, type: 'campaign' },
          select: { id: true },
        })
      ).map((p) => p.id);
      for (const id of ids) {
        await request(server)
          .delete(`/community/posts/${id}`)
          .set('Authorization', `Bearer ${member.token}`)
          .expect(204);
      }
      expect(await campaignPosts()).toBe(0);
      send.mockClear();
      await createPost(member.token, campaign).expect(201);
      expect(campaignSends()).toBe(0);
    });
  });

  // Run-2 S-01: concurrent campaign posts used to all read the same count and
  // all broadcast; the advisory lock serialises the decision per organization.
  it('concurrent campaign posts never broadcast more than the daily cap', async () => {
    const broadcasts = () =>
      admin.auditLog.count({
        where: { organizationId: org.orgId, action: CAMPAIGN_BROADCAST_AUDIT_ACTION },
      });
    expect(await broadcasts()).toBeLessThan(MAX_CAMPAIGN_BROADCASTS_PER_DAY);
    const results = await Promise.all(
      Array.from({ length: 8 }, () => createPost(org.token, { type: 'campaign', title: 'Ya' })),
    );
    expect(results.map((r) => r.status)).toEqual(Array(8).fill(201));
    expect(await broadcasts()).toBe(MAX_CAMPAIGN_BROADCASTS_PER_DAY);
  });

  it('the feed shows BOTH the org post and the platform-wide post', async () => {
    const feed = await request(server)
      .get('/community/posts')
      .set('Authorization', `Bearer ${org.token}`)
      .expect(200);
    const ids = feed.body.items.map((p: { id: string }) => p.id);
    expect(ids).toContain(orgPostId);
    expect(ids).toContain(personPostId);
  });

  it('the feed filters by type', async () => {
    const feed = await request(server)
      .get('/community/posts?type=event')
      .set('Authorization', `Bearer ${org.token}`)
      .expect(200);
    expect(feed.body.items.every((p: { type: string }) => p.type === 'event')).toBe(true);
    expect(feed.body.items.some((p: { id: string }) => p.id === personPostId)).toBe(true);
  });

  it('"mis publicaciones" returns only the actor\'s own posts', async () => {
    const mine = await request(server)
      .get('/community/posts/mine')
      .set('Authorization', `Bearer ${person.token}`)
      .expect(200);
    expect(
      mine.body.items.every((p: { authorUserId: string }) => p.authorUserId === person.userId),
    ).toBe(true);
    expect(mine.body.items.some((p: { id: string }) => p.id === personPostId)).toBe(true);
  });

  it('gets one post by id (permalink)', async () => {
    const res = await request(server)
      .get(`/community/posts/${personPostId}`)
      .set('Authorization', `Bearer ${org.token}`)
      .expect(200);
    expect(res.body).toMatchObject({ id: personPostId });
  });

  it("editing someone else's post is forbidden (403)", async () => {
    await request(server)
      .patch(`/community/posts/${personPostId}`)
      .set('Authorization', `Bearer ${org.token}`)
      .send({ body: 'x'.repeat(20) })
      .expect(403);
  });

  it('the author edits their own post', async () => {
    const res = await request(server)
      .patch(`/community/posts/${personPostId}`)
      .set('Authorization', `Bearer ${person.token}`)
      .send({ title: 'Jornada de adopción (actualizada)' })
      .expect(200);
    expect(res.body.title).toBe('Jornada de adopción (actualizada)');
  });

  let commentId = '';

  it('ANY authenticated user (cross-tenant) can comment on a post', async () => {
    const res = await request(server)
      .post(`/community/posts/${orgPostId}/comments`)
      .set('Authorization', `Bearer ${person.token}`)
      .send({ body: '¡Qué buena publicación!' })
      .expect(201);
    commentId = res.body.id;
    expect(res.body).toMatchObject({ postId: orgPostId, authorUserId: person.userId });
  });

  it('the comment count on the post increments', async () => {
    const res = await request(server)
      .get(`/community/posts/${orgPostId}`)
      .set('Authorization', `Bearer ${org.token}`)
      .expect(200);
    expect(res.body.commentCount).toBe(1);
  });

  it('lists comments for a post, oldest first', async () => {
    const res = await request(server)
      .get(`/community/posts/${orgPostId}/comments`)
      .set('Authorization', `Bearer ${org.token}`)
      .expect(200);
    expect(res.body.items.some((c: { id: string }) => c.id === commentId)).toBe(true);
  });

  it("deleting someone else's comment is forbidden (403)", async () => {
    await request(server)
      .delete(`/community/comments/${commentId}`)
      .set('Authorization', `Bearer ${org.token}`)
      .expect(403);
  });

  it('the author deletes their own comment, and the count decrements', async () => {
    await request(server)
      .delete(`/community/comments/${commentId}`)
      .set('Authorization', `Bearer ${person.token}`)
      .expect(204);
    const res = await request(server)
      .get(`/community/posts/${orgPostId}`)
      .set('Authorization', `Bearer ${org.token}`)
      .expect(200);
    expect(res.body.commentCount).toBe(0);
  });

  it('toggling a like increments, toggling again decrements', async () => {
    const liked = await request(server)
      .post(`/community/posts/${orgPostId}/like`)
      .set('Authorization', `Bearer ${person.token}`)
      .expect(201);
    expect(liked.body).toMatchObject({ liked: true, likeCount: 1 });

    const unliked = await request(server)
      .post(`/community/posts/${orgPostId}/like`)
      .set('Authorization', `Bearer ${person.token}`)
      .expect(201);
    expect(unliked.body).toMatchObject({ liked: false, likeCount: 0 });
  });

  it('RBAC: an org role (not platform) is denied moderation (403)', async () => {
    await request(server)
      .get('/platform/community/posts')
      .set('Authorization', `Bearer ${org.token}`)
      .expect(403);
  });

  it('platform moderation: remove requires a reason (400 without one)', async () => {
    const platformAdmin = await actorWithRoles('mod', ['platform_admin']);
    await request(server)
      .patch(`/platform/community/posts/${orgPostId}/moderate`)
      .set('Authorization', `Bearer ${platformAdmin.token}`)
      .send({ decision: 'remove' })
      .expect(400);
  });

  it('platform moderation: removes a post, which then disappears from the feed', async () => {
    const platformAdmin = await actorWithRoles('mod2', ['platform_super_admin']);
    const removed = await request(server)
      .patch(`/platform/community/posts/${orgPostId}/moderate`)
      .set('Authorization', `Bearer ${platformAdmin.token}`)
      .send({ decision: 'remove', reason: 'Contenido duplicado' })
      .expect(200);
    expect(removed.body).toMatchObject({
      status: 'removed',
      moderationReason: 'Contenido duplicado',
    });

    const feed = await request(server)
      .get('/community/posts')
      .set('Authorization', `Bearer ${org.token}`)
      .expect(200);
    expect(feed.body.items.some((p: { id: string }) => p.id === orgPostId)).toBe(false);
  });

  it('a removed post can no longer be commented, liked, or edited', async () => {
    await request(server)
      .post(`/community/posts/${orgPostId}/comments`)
      .set('Authorization', `Bearer ${person.token}`)
      .send({ body: 'Intento tardío' })
      .expect(403);
    await request(server)
      .post(`/community/posts/${orgPostId}/like`)
      .set('Authorization', `Bearer ${person.token}`)
      .expect(403);
    await request(server)
      .patch(`/community/posts/${orgPostId}`)
      .set('Authorization', `Bearer ${org.token}`)
      .send({ body: 'x'.repeat(20) })
      .expect(403);
  });

  it('the moderation queue shows the removed post (any status)', async () => {
    const platformAdmin = await actorWithRoles('mod3', ['platform_admin']);
    const queue = await request(server)
      .get('/platform/community/posts?status=removed')
      .set('Authorization', `Bearer ${platformAdmin.token}`)
      .expect(200);
    expect(queue.body.items.some((p: { id: string }) => p.id === orgPostId)).toBe(true);
  });

  it('platform moderation: restores the post', async () => {
    const platformAdmin = await actorWithRoles('mod4', ['platform_admin']);
    const restored = await request(server)
      .patch(`/platform/community/posts/${orgPostId}/moderate`)
      .set('Authorization', `Bearer ${platformAdmin.token}`)
      .send({ decision: 'restore' })
      .expect(200);
    expect(restored.body).toMatchObject({ status: 'published' });
  });

  it("the author deletes their own post; a stranger's delete attempt on another post is forbidden", async () => {
    await request(server)
      .delete(`/community/posts/${personPostId}`)
      .set('Authorization', `Bearer ${org.token}`)
      .expect(403);
    await request(server)
      .delete(`/community/posts/${personPostId}`)
      .set('Authorization', `Bearer ${person.token}`)
      .expect(204);
    await request(server)
      .get(`/community/posts/${personPostId}`)
      .set('Authorization', `Bearer ${org.token}`)
      .expect(404);
  });
});
