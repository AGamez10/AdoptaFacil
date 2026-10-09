import { detectSignatureImageType, resolveMinimumSignerAge } from './adoption-contract-rules';

describe('detectSignatureImageType', () => {
  it('reconoce PNG y JPEG por sus bytes, no por lo que diga el cliente', () => {
    expect(
      detectSignatureImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])),
    ).toBe('png');
    expect(detectSignatureImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(detectSignatureImageType(Buffer.from('<svg onload=x>'))).toBeNull();
    expect(detectSignatureImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe('resolveMinimumSignerAge', () => {
  const org = '11111111-2222-4333-8444-555555555555';
  it('18 por defecto', () => {
    expect(resolveMinimumSignerAge(org, {})).toBe(18);
  });
  it('lee la edad de la organización del piloto', () => {
    expect(
      resolveMinimumSignerAge(org, {
        ADOPTION_MIN_SIGNER_AGE_BY_ORG: `99999999-2222-4333-8444-555555555555:21, ${org}:25`,
      }),
    ).toBe(25);
  });
  it('ignora valores fuera de 18–30 o mal formados', () => {
    expect(resolveMinimumSignerAge(org, { ADOPTION_MIN_SIGNER_AGE_BY_ORG: `${org}:40` })).toBe(18);
    expect(resolveMinimumSignerAge(org, { ADOPTION_MIN_SIGNER_AGE_BY_ORG: `${org}:veinte` })).toBe(
      18,
    );
    expect(resolveMinimumSignerAge(org, { ADOPTION_MIN_SIGNER_AGE_BY_ORG: 'basura::,,' })).toBe(18);
  });
});
