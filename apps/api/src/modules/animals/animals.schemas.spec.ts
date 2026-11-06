import { createAnimalSchema, createBreedSchema, updateAnimalSchema } from './animals.schemas';

describe('animal attribute validation (RF07)', () => {
  const valid = {
    name: 'Firulais',
    species: 'dog',
    sex: 'male',
    size: 'medium',
    birthDate: '2024-07-23T00:00:00.000Z',
  };
  const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString();

  it('accepts a minimal valid animal', () => {
    expect(createAnimalSchema.safeParse(valid).success).toBe(true);
  });

  it('requires the age: a birth date or an approximate age', () => {
    const { birthDate: _omit, ...noAge } = valid;
    expect(createAnimalSchema.safeParse(noAge).success).toBe(false);
    expect(createAnimalSchema.safeParse({ ...noAge, approximateAgeMonths: 18 }).success).toBe(true);
    expect(createAnimalSchema.safeParse({ ...noAge, approximateAgeMonths: 0 }).success).toBe(true);
  });

  it('rejects a future birth date on create and update', () => {
    expect(createAnimalSchema.safeParse({ ...valid, birthDate: tomorrow }).success).toBe(false);
    expect(updateAnimalSchema.safeParse({ birthDate: tomorrow }).success).toBe(false);
  });

  it('update can clear the birth date (switch to an approximate age)', () => {
    expect(
      updateAnimalSchema.safeParse({ birthDate: null, approximateAgeMonths: 12 }).success,
    ).toBe(true);
  });

  it('requires a name', () => {
    expect(createAnimalSchema.safeParse({ ...valid, name: '' }).success).toBe(false);
  });

  it('rejects an unknown species', () => {
    expect(createAnimalSchema.safeParse({ ...valid, species: 'dragon' }).success).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    expect(createAnimalSchema.safeParse({ ...valid, isActive: false }).success).toBe(false);
  });

  it('rejects a negative approximate age', () => {
    expect(createAnimalSchema.safeParse({ ...valid, approximateAgeMonths: -1 }).success).toBe(
      false,
    );
  });

  it('accepts an optional set of photos', () => {
    const parsed = createAnimalSchema.safeParse({
      ...valid,
      photos: [{ filename: 'a.jpg' }, { filename: 'b.jpg', order: 1 }],
    });
    expect(parsed.success).toBe(true);
  });

  it('update requires at least one field', () => {
    expect(updateAnimalSchema.safeParse({}).success).toBe(false);
    expect(updateAnimalSchema.safeParse({ status: 'adopted' }).success).toBe(true);
  });

  it('validates a breed', () => {
    expect(createBreedSchema.safeParse({ species: 'cat', name: 'Criollo' }).success).toBe(true);
    expect(createBreedSchema.safeParse({ species: 'cat', name: '' }).success).toBe(false);
  });

  it('accepts personality tags on create and update (S2-04A)', () => {
    expect(createAnimalSchema.safeParse({ ...valid, tags: ['Juguetón', 'Cariñoso'] }).success).toBe(
      true,
    );
    expect(updateAnimalSchema.safeParse({ tags: ['Tímido'] }).success).toBe(true);
  });

  it('rejects more than 10 tags', () => {
    const tooMany = Array.from({ length: 11 }, (_, i) => `tag-${i}`);
    expect(createAnimalSchema.safeParse({ ...valid, tags: tooMany }).success).toBe(false);
  });

  it('rejects an empty-string tag', () => {
    expect(createAnimalSchema.safeParse({ ...valid, tags: [''] }).success).toBe(false);
  });
});
