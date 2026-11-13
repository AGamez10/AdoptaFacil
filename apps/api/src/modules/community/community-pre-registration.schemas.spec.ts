import { communityPreRegistrationSchema } from './community-pre-registration.schemas';

const valid = {
  kind: 'commerce',
  businessName: 'Peluquería Patitas',
  category: 'grooming',
  city: 'Medellín',
  contactName: 'Ana Pérez',
  contactEmail: 'ANA@example.com',
  contactPhone: '+57 300 123 4567',
  message: 'Atiendo perros y gatos.',
  consent: true,
};

describe('communityPreRegistrationSchema', () => {
  it('accepts a complete pre-registration and normalizes the email', () => {
    const parsed = communityPreRegistrationSchema.parse(valid);
    expect(parsed.contactEmail).toBe('ana@example.com');
  });

  it('accepts the minimum data (no phone, no message, "other" category)', () => {
    const parsed = communityPreRegistrationSchema.parse({
      ...valid,
      kind: 'professional',
      category: 'other',
      contactPhone: undefined,
      message: undefined,
    });
    expect(parsed.category).toBe('other');
  });

  it('requires the data-treatment consent to be explicitly true', () => {
    expect(() => communityPreRegistrationSchema.parse({ ...valid, consent: false })).toThrow();
    const { consent: _omitted, ...withoutConsent } = valid;
    expect(() => communityPreRegistrationSchema.parse(withoutConsent)).toThrow();
  });

  it('rejects unknown kinds, categories and extra keys', () => {
    expect(() => communityPreRegistrationSchema.parse({ ...valid, kind: 'influencer' })).toThrow();
    expect(() => communityPreRegistrationSchema.parse({ ...valid, category: 'casino' })).toThrow();
    expect(() => communityPreRegistrationSchema.parse({ ...valid, status: 'approved' })).toThrow();
  });

  it('rejects an invalid email and an invalid phone', () => {
    expect(() =>
      communityPreRegistrationSchema.parse({ ...valid, contactEmail: 'no-es-correo' }),
    ).toThrow();
    expect(() =>
      communityPreRegistrationSchema.parse({ ...valid, contactPhone: 'llámame' }),
    ).toThrow();
  });
});
