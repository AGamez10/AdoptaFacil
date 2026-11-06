import { createVolunteerOpportunitySchema } from './volunteer-opportunities.schemas';

/** Días relativos a hoy: el fin de una convocatoria nueva no puede estar en el pasado. */
const day = (offset: number) =>
  `${new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)}T00:00:00.000Z`;

const BASE = {
  title: 'Jornada de esterilización',
  category: 'sterilizations',
  startDate: day(10),
  endDate: day(11),
  location: 'Refugio Patitas',
};

describe('createVolunteerOpportunitySchema (RF18)', () => {
  it('accepts a valid opportunity with all optional fields', () => {
    expect(
      createVolunteerOpportunitySchema.safeParse({
        ...BASE,
        description: 'Ayuda con la jornada',
        capacity: 10,
        requirements: 'Mayor de edad',
        appliesToStudentService: true,
      }).success,
    ).toBe(true);
  });

  it('accepts the minimal required fields', () => {
    expect(createVolunteerOpportunitySchema.safeParse(BASE).success).toBe(true);
  });

  it('rejects a new opportunity that already ended, or nonexistent dates', () => {
    const ended = createVolunteerOpportunitySchema.safeParse({
      ...BASE,
      startDate: day(-10),
      endDate: day(-5),
    });
    expect(ended.success).toBe(false);
    expect(ended.error?.issues[0]?.message).toBe('La fecha de fin no puede ser anterior a hoy.');
    expect(
      createVolunteerOpportunitySchema.safeParse({ ...BASE, endDate: '2030-02-30T00:00:00.000Z' })
        .success,
    ).toBe(false);
  });

  it('rejects endDate before or equal to startDate', () => {
    expect(
      createVolunteerOpportunitySchema.safeParse({
        ...BASE,
        startDate: day(11),
        endDate: day(10),
      }).success,
    ).toBe(false);
    expect(
      createVolunteerOpportunitySchema.safeParse({ ...BASE, endDate: BASE.startDate }).success,
    ).toBe(false);
  });

  it('rejects a non-positive capacity', () => {
    expect(createVolunteerOpportunitySchema.safeParse({ ...BASE, capacity: 0 }).success).toBe(
      false,
    );
    expect(createVolunteerOpportunitySchema.safeParse({ ...BASE, capacity: -3 }).success).toBe(
      false,
    );
  });

  it('rejects unknown keys (strict)', () => {
    expect(createVolunteerOpportunitySchema.safeParse({ ...BASE, sneaky: 1 }).success).toBe(false);
  });
});
