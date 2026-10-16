import { describe, expect, it } from 'vitest';
import {
  buildOrganizationDonateUrl,
  epaycoStatusFromCode,
  GATEWAY_CATALOG,
  parseEpaycoAmount,
} from '../src';

describe('buildOrganizationDonateUrl', () => {
  const env = { appOrigin: 'https://adoptafacil.org/', portalBaseDomain: 'adoptafacil.org' };

  it('uses the real subdomain when the base domain is configured', () => {
    expect(buildOrganizationDonateUrl({ subdomain: 'Patitas', slug: 'patitas-cali' }, env)).toBe(
      'https://patitas.adoptafacil.org/donar',
    );
  });

  it('falls back to the slug route on the main origin', () => {
    expect(
      buildOrganizationDonateUrl(
        { subdomain: 'patitas', slug: 'patitas-cali' },
        { appOrigin: 'https://adoptafacil.org/' },
      ),
    ).toBe('https://adoptafacil.org/o/patitas-cali/donar');
    expect(buildOrganizationDonateUrl({ slug: 'patitas-cali' }, env)).toBe(
      'https://adoptafacil.org/o/patitas-cali/donar',
    );
  });

  it('returns null without a usable subdomain or slug', () => {
    expect(buildOrganizationDonateUrl({}, env)).toBeNull();
    expect(buildOrganizationDonateUrl({ slug: '../x', subdomain: 'a b' }, env)).toBeNull();
  });
});

describe('epaycoStatusFromCode', () => {
  it.each([
    ['1', 'approved'],
    [1, 'approved'],
    ['2', 'declined'],
    ['3', 'pending'],
    ['4', 'error'],
    ['6', 'voided'],
    ['7', 'pending'],
    ['10', 'declined'],
    ['99', 'pending'],
    [undefined, 'pending'],
  ] as const)('%s → %s', (code, status) => {
    expect(epaycoStatusFromCode(code)).toBe(status);
  });
});

describe('parseEpaycoAmount', () => {
  it('accepts whole pesos with or without zero decimals', () => {
    expect(parseEpaycoAmount('50000')).toBe(50000);
    expect(parseEpaycoAmount('50000.00')).toBe(50000);
    expect(parseEpaycoAmount(25000)).toBe(25000);
  });

  it('refuses fractions, signs and junk instead of rounding', () => {
    expect(parseEpaycoAmount('50000.50')).toBeNull();
    expect(parseEpaycoAmount('-1')).toBeNull();
    expect(parseEpaycoAmount('1e5')).toBeNull();
    expect(parseEpaycoAmount('')).toBeNull();
    expect(parseEpaycoAmount(null)).toBeNull();
  });
});

describe('GATEWAY_CATALOG · ePayco', () => {
  it('lists direct collection with the org keys and keeps split behind written confirmation', () => {
    const epayco = GATEWAY_CATALOG.filter((c) => c.provider === 'epayco');
    expect(epayco.find((c) => c.mode === 'direct_to_org')).toMatchObject({
      credentialKind: 'merchant_keys',
      platformFeeAtSource: false,
      status: 'documented',
    });
    expect(epayco.find((c) => c.mode === 'platform_split')?.status).toBe(
      'requires_written_confirmation',
    );
  });
});
