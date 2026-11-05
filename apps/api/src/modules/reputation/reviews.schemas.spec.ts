import {
  createPublicReviewSchema,
  createReviewSchema,
  decideReviewSchema,
  hideReviewSchema,
} from './reviews.schemas';

describe('createReviewSchema', () => {
  const base = { organizationId: '11111111-1111-1111-1111-111111111111', rating: 5 };

  it('accepts a minimal valid review', () => {
    expect(createReviewSchema.safeParse(base).success).toBe(true);
  });

  it('accepts a full review with comment and isAnonymous', () => {
    const result = createReviewSchema.safeParse({
      ...base,
      comment: 'Excelente organización',
      isAnonymous: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a rating below 1', () => {
    expect(createReviewSchema.safeParse({ ...base, rating: 0 }).success).toBe(false);
  });

  it('rejects a rating above 5', () => {
    expect(createReviewSchema.safeParse({ ...base, rating: 6 }).success).toBe(false);
  });

  it('rejects a non-integer rating', () => {
    expect(createReviewSchema.safeParse({ ...base, rating: 3.5 }).success).toBe(false);
  });

  it('rejects an unknown field (.strict())', () => {
    expect(createReviewSchema.safeParse({ ...base, extra: 'x' }).success).toBe(false);
  });
});

describe('decideReviewSchema', () => {
  it('accepts approve without a reason', () => {
    expect(decideReviewSchema.safeParse({ decision: 'approve' }).success).toBe(true);
  });

  it('rejects reject without a reason', () => {
    expect(decideReviewSchema.safeParse({ decision: 'reject' }).success).toBe(false);
  });

  it('accepts reject with a reason', () => {
    expect(
      decideReviewSchema.safeParse({ decision: 'reject', reason: 'Contenido ofensivo' }).success,
    ).toBe(true);
  });
});

describe('hideReviewSchema', () => {
  it('requires a non-empty reason', () => {
    expect(hideReviewSchema.safeParse({ reason: '' }).success).toBe(false);
    expect(hideReviewSchema.safeParse({ reason: 'Reportada por la organización' }).success).toBe(
      true,
    );
  });
});

describe('createPublicReviewSchema (nombre opcional del visitante, 2026-11-05)', () => {
  const parse = (input: Record<string, unknown>) =>
    createPublicReviewSchema.safeParse({ rating: 5, ...input });

  it('accepts a review with no name at all (stays anonymous)', () => {
    const result = parse({});
    expect(result.success && result.data.authorName).toBeUndefined();
  });

  it('accepts a real name with accents, apostrophes and hyphens, collapsing spaces', () => {
    const result = parse({ authorName: "  María   José O'Neil-Peña " });
    expect(result.success && result.data.authorName).toBe("María José O'Neil-Peña");
  });

  it('treats a blank name as no name', () => {
    const result = parse({ authorName: '   ' });
    expect(result.success && result.data.authorName).toBeUndefined();
  });

  it.each([
    ['a phone number', 'Ana 3001234567'],
    ['an email', 'ana@correo.com'],
    ['a link', 'www.spam.co'],
    ['a bare domain', 'Visita spam.co'],
    ['a one-letter name', 'A'],
    ['a name over 60 characters', 'A'.repeat(61)],
  ])('rejects %s', (_label, authorName) => {
    expect(parse({ authorName }).success).toBe(false);
  });

  it.each(['AdoptaFácil', 'Equipo Adopta Facil', 'Soporte', 'Administrador del refugio', 'Admin'])(
    'rejects a name that impersonates the platform or staff: %s',
    (authorName) => {
      expect(parse({ authorName }).success).toBe(false);
    },
  );

  it('keeps initials such as "J.R. Martínez"', () => {
    expect(parse({ authorName: 'J.R. Martínez' }).success).toBe(true);
  });

  it('does not flag surnames that merely contain a reserved word', () => {
    expect(parse({ authorName: 'Ana Dminguez Oficialdegui' }).success).toBe(true);
  });

  it('accepts isAnonymous (members) and still rejects unknown keys', () => {
    expect(parse({ isAnonymous: false }).success).toBe(true);
    expect(parse({ authorUserId: 'x' }).success).toBe(false);
  });
});
