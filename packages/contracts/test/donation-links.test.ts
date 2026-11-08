import { describe, expect, it } from 'vitest';
import { buildOrganizationDonateUrl } from '../src';

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
