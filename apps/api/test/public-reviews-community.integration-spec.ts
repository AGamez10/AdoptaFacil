import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * Reseñas del portal con nombre opcional y sello "Miembro de la comunidad"
 * (2026-11-05), contra las funciones SECURITY DEFINER reales y con el rol de
 * runtime (sin superusuario), igual que la API.
 */
const APP_DATABASE_URL =
  process.env.DATABASE_URL_APP ??
  'postgresql://adoptafacil_app:adoptafacil_app@localhost:5433/adoptafacil?schema=public';

interface ReviewRow {
  id: string;
  author_user_id: string | null;
  author_display_name: string | null;
  is_anonymous: boolean;
  origin: string;
  status: string;
}

interface PublicItem {
  id: string;
  authorName: string | null;
  isCommunityMember: boolean;
}

describe('Reseñas del portal: nombre opcional + sello de comunidad', () => {
  const app = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const org = randomUUID();
  const personalOrg = randomUUID();
  const member = randomUUID();
  const staff = randomUUID();

  const create = (
    author: string | null,
    name: string | null,
    isAnonymous: boolean | null,
    rating = 5,
  ) =>
    app.$queryRaw<ReviewRow[]>`SELECT * FROM create_public_review(
      ${org}::uuid, ${rating}::int, ${'Comentario'}, ${author}::uuid, ${name}, ${isAnonymous}::boolean
    )`;

  const publicItems = async (): Promise<PublicItem[]> => {
    const rows = await app.$queryRaw<Array<{ data: { items: PublicItem[] } }>>`
      SELECT public_approved_reviews(${org}::uuid, 50, 0) AS data`;
    return rows[0].data.items;
  };

  beforeAll(async () => {
    await admin.organization.createMany({
      data: [
        { id: org, name: 'Refugio Patitas' },
        { id: personalOrg, name: 'Personal' },
      ],
    });
    await admin.user.createMany({
      data: [
        {
          id: member,
          organizationId: personalOrg,
          accountType: 'person',
          email: `m-${member}@test.local`,
          displayName: 'Ana Pérez',
        },
        {
          id: staff,
          organizationId: org,
          accountType: 'organization',
          email: `s-${staff}@test.local`,
          displayName: 'Dueña del refugio',
        },
      ],
    });
  });

  afterAll(async () => {
    await app.$disconnect();
    await purgeOrganizations(admin, [org, personalOrg]);
    await admin.$disconnect();
  });

  it('a visitor review keeps the typed name and shows no badge', async () => {
    const [row] = await create(null, '  Laura   Gómez ', null);
    expect(row).toMatchObject({
      author_user_id: null,
      author_display_name: 'Laura Gómez',
      is_anonymous: false,
      origin: 'portal',
      status: 'approved',
    });
    const item = (await publicItems()).find((i) => i.id === row.id);
    expect(item).toMatchObject({ authorName: 'Laura Gómez', isCommunityMember: false });
  });

  it('a visitor cannot sign as the reviewed organization', async () => {
    await expect(create(null, 'refugio patitas', null)).rejects.toThrow(/display name not allowed/);
  });

  it('a member is anonymous by default but keeps the badge; a second review is refused', async () => {
    const [row] = await create(member, null, null);
    expect(row).toMatchObject({ author_user_id: member, is_anonymous: true, origin: 'portal' });
    const item = (await publicItems()).find((i) => i.id === row.id);
    expect(item).toMatchObject({ authorName: null, isCommunityMember: true });

    await expect(create(member, null, false)).rejects.toThrow(/23505|already exists|unique/i);
  });

  it('a member cannot type a free name', async () => {
    await expect(create(staff, 'Otra Persona', false)).rejects.toThrow(/free display name/);
  });

  it('nobody reviews their own organization from the portal', async () => {
    await expect(create(staff, null, false)).rejects.toThrow(/own organization/);
  });

  it('the Owner can mark a MEMBER portal review as spam, and it never reaches the platform queue', async () => {
    const [row] = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM reviews WHERE organization_id = ${org}::uuid AND author_user_id = ${member}::uuid`;

    const queue = await app.$queryRaw<Array<{ data: Array<{ id: string }> }>>`
      SELECT platform_review_queue() AS data`;
    expect(queue[0].data.some((q) => q.id === row.id)).toBe(false);

    const spam = await app.$queryRaw<Array<{ data: Record<string, unknown> }>>`
      SELECT owner_mark_review_spam(${row.id}::uuid, ${org}::uuid, ${staff}::uuid) AS data`;
    expect(spam[0].data).toMatchObject({ status: 'hidden' });
    expect(spam[0].data).not.toHaveProperty('authorUserId');
    expect((await publicItems()).some((i) => i.id === row.id)).toBe(false);
  });

  it('the name and origin are immutable after submission', async () => {
    const [row] = await create(null, 'Carlos Ruiz', null);
    await expect(
      admin.$executeRaw`UPDATE reviews SET author_display_name = 'Otro' WHERE id = ${row.id}::uuid`,
    ).rejects.toThrow(/immutable/);
    await expect(
      admin.$executeRaw`UPDATE reviews SET origin = 'verified' WHERE id = ${row.id}::uuid`,
    ).rejects.toThrow(/immutable/);
  });
});
