import {
  assertContractDataComplete,
  detectSignatureImageType,
  mergeContractData,
  resolveMinimumSignerAge,
} from './adoption-contract-rules';

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

describe('datos obligatorios del contrato (punto 13)', () => {
  const complete = {
    followUpMonths: 12,
    organizationName: 'Refugio',
    organizationNit: '900000000-1',
    organizationAddress: 'Calle 1',
    animalSex: 'male',
    weightKg: 10,
    healthStatusAtDelivery: 'Sano',
    adopterDocumentNumber: '1000000000',
    adopterAddress: 'Calle 2',
    signatureCity: 'Bogotá',
  };

  it('acepta un contrato completo y nombra en lenguaje llano lo que falta', () => {
    expect(() => assertContractDataComplete(complete)).not.toThrow();
    try {
      assertContractDataComplete({ ...complete, weightKg: undefined, signatureCity: '  ' });
      throw new Error('debió fallar');
    } catch (error) {
      const body = (
        error as { getResponse(): { message: string; missing: string[] } }
      ).getResponse();
      expect(body.message).toBe(
        'Faltan datos obligatorios del contrato: Peso (kg), Ciudad de firma.',
      );
      expect(body.missing).toEqual(['weightKg', 'signatureCity']);
    }
  });

  it('no exige NIT a un grupo sin personería, pero sí el número si hay microchip o placa', () => {
    expect(() =>
      assertContractDataComplete({
        ...complete,
        organizationNit: undefined,
        organizationFormalization: 'informal',
      }),
    ).not.toThrow();
    expect(() =>
      assertContractDataComplete({ ...complete, animalIdentificationType: 'microchip' }),
    ).toThrow();
  });

  it('null borra el dato al guardar y los meses de seguimiento nunca quedan vacíos', () => {
    const next = mergeContractData(complete, {
      weightKg: null,
      followUpMonths: null,
      animalBreed: 'Criollo',
    });
    expect(next.weightKg).toBeUndefined();
    expect(next.followUpMonths).toBe(12);
    expect(next.animalBreed).toBe('Criollo');
    expect(next.organizationName).toBe('Refugio');
  });
});
