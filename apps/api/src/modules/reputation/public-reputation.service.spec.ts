import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { RequestUser } from '../../core/auth/auth.types';
import type { PrismaService } from '../../prisma/prisma.service';
import { PublicReputationService, toSummary } from './public-reputation.service';

describe('toSummary (RF23 — averageRating/approvedReviewsCount calculation)', () => {
  it('defaults to 0/0 when there are no approved reviews (AVG() is NULL)', () => {
    expect(toSummary('org-1', { average_rating: null, approved_review_count: 0 })).toEqual({
      organizationId: 'org-1',
      averageRating: 0,
      approvedReviewsCount: 0,
    });
  });

  it('parses the NUMERIC string Postgres returns into a real number', () => {
    expect(toSummary('org-1', { average_rating: '4.33', approved_review_count: 3 })).toEqual({
      organizationId: 'org-1',
      averageRating: 4.33,
      approvedReviewsCount: 3,
    });
  });

  it('handles an undefined row (defensive) the same as zero reviews', () => {
    expect(toSummary('org-1', undefined)).toEqual({
      organizationId: 'org-1',
      averageRating: 0,
      approvedReviewsCount: 0,
    });
  });
});

function makeService(): { service: PublicReputationService; queryRaw: jest.Mock } {
  const queryRaw = jest.fn();
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  return { service: new PublicReputationService(prisma), queryRaw };
}

describe('PublicReputationService.createPublicReview (S7-b — portal público, sin sesión)', () => {
  it('creates an anonymous review, already approved, with no authorUserId', async () => {
    const h = makeService();
    h.queryRaw
      .mockResolvedValueOnce([{ data: { id: 'org-1' } }]) // resolveOrgId
      .mockResolvedValueOnce([
        {
          id: 'rev-public-1',
          organization_id: 'org-1',
          author_user_id: null,
          rating: 5,
          comment: 'Excelente refugio',
          is_anonymous: true,
          status: 'approved',
          created_at: new Date('2026-09-29T00:00:00.000Z'),
        },
      ]);

    const result = await h.service.createPublicReview('org-slug', {
      rating: 5,
      comment: 'Excelente refugio',
    });

    expect(result).toMatchObject({
      id: 'rev-public-1',
      organizationId: 'org-1',
      authorUserId: undefined,
      status: 'approved',
      isAnonymous: true,
    });
  });

  it('throws NotFound when the slug does not resolve to an organization', async () => {
    const h = makeService();
    h.queryRaw.mockResolvedValueOnce([{ data: null }]);

    await expect(
      h.service.createPublicReview('missing-slug', { rating: 4 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  const member = { id: 'user-1', organizationId: 'org-personal', email: 'm@x.co' } as RequestUser;

  function sqlValues(call: unknown[]): unknown[] {
    return (call[0] as { values: unknown[] }).values;
  }

  function stubCreated(h: ReturnType<typeof makeService>, row: Record<string, unknown>) {
    h.queryRaw.mockResolvedValueOnce([{ data: { id: 'org-1' } }]).mockResolvedValueOnce([
      {
        id: 'rev-1',
        organization_id: 'org-1',
        author_user_id: null,
        rating: 5,
        comment: null,
        is_anonymous: true,
        status: 'approved',
        created_at: new Date('2026-11-05T00:00:00.000Z'),
        ...row,
      },
    ]);
  }

  it('a visitor can sign with an optional name — no author account is sent', async () => {
    const h = makeService();
    stubCreated(h, { is_anonymous: false });

    await h.service.createPublicReview('org-slug', { rating: 5, authorName: 'Laura Gómez' });

    // org, rating, comment, author, name, isAnonymous
    expect(sqlValues(h.queryRaw.mock.calls[1])).toEqual([
      'org-1',
      5,
      null,
      null,
      'Laura Gómez',
      null,
    ]);
  });

  it('a signed-in member is linked by the token (never the body) and is anonymous by default', async () => {
    const h = makeService();
    stubCreated(h, { author_user_id: 'user-1' });

    const result = await h.service.createPublicReview('org-slug', { rating: 4 }, member);

    expect(sqlValues(h.queryRaw.mock.calls[1])).toEqual(['org-1', 4, null, 'user-1', null, true]);
    expect(result.authorUserId).toBe('user-1');
  });

  it('a member may opt in to showing their account name', async () => {
    const h = makeService();
    stubCreated(h, { author_user_id: 'user-1', is_anonymous: false });

    await h.service.createPublicReview('org-slug', { rating: 4, isAnonymous: false }, member);

    expect(sqlValues(h.queryRaw.mock.calls[1])).toEqual(['org-1', 4, null, 'user-1', null, false]);
  });

  it("a member cannot type a free name (would let a badge carry someone else's name)", async () => {
    const h = makeService();
    await expect(
      h.service.createPublicReview('org-slug', { rating: 4, authorName: 'Otra Persona' }, member),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.queryRaw).not.toHaveBeenCalled();
  });

  it('a visitor cannot send isAnonymous (anonymity is "no name")', async () => {
    const h = makeService();
    await expect(
      h.service.createPublicReview('org-slug', { rating: 4, isAnonymous: false }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    [
      'Key (organization_id, author_user_id)=(a, b) already exists.',
      'Ya reseñaste esta organización.',
    ],
    [
      'create_public_review: cannot review your own organization',
      'No puedes reseñar tu propia organización.',
    ],
    ['create_public_review: display name not allowed', 'Ese nombre no está permitido.'],
  ])('maps the DB guard "%s" to a 400', async (dbMessage, userMessage) => {
    const h = makeService();
    h.queryRaw
      .mockResolvedValueOnce([{ data: { id: 'org-1' } }])
      .mockRejectedValueOnce(new Error(dbMessage));

    await expect(h.service.createPublicReview('org-slug', { rating: 4 }, member)).rejects.toThrow(
      userMessage,
    );
  });
});

describe('PublicReputationService.listApprovedByOrgSlug (nombre + sello)', () => {
  it('passes through authorName and the community badge, normalizing a missing badge to false', async () => {
    const h = makeService();
    h.queryRaw.mockResolvedValueOnce([{ data: { id: 'org-1' } }]).mockResolvedValueOnce([
      {
        data: {
          items: [
            {
              id: 'r1',
              rating: 5,
              comment: null,
              authorName: null,
              isCommunityMember: true,
              createdAt: 'x',
            },
            { id: 'r2', rating: 4, comment: 'Hola', authorName: 'Laura', createdAt: 'y' },
          ],
          total: 2,
        },
      },
    ]);

    const page = await h.service.listApprovedByOrgSlug('org-slug', 10, 0);

    expect(page?.items).toEqual([
      {
        id: 'r1',
        rating: 5,
        comment: undefined,
        authorName: undefined,
        isCommunityMember: true,
        createdAt: 'x',
      },
      {
        id: 'r2',
        rating: 4,
        comment: 'Hola',
        authorName: 'Laura',
        isCommunityMember: false,
        createdAt: 'y',
      },
    ]);
  });
});
