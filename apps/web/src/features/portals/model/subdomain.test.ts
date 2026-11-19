import { describe, expect, it } from 'vitest';
import { isCustomPortalHost, resolveOrgSubdomain } from './subdomain';

describe('resolveOrgSubdomain', () => {
  it('returns null when no base domain is configured', () => {
    expect(resolveOrgSubdomain('patitas.adoptafacil.org', undefined)).toBeNull();
  });

  it('returns null for the bare base domain (general portal, not an org subdomain)', () => {
    expect(resolveOrgSubdomain('adoptafacil.org', 'adoptafacil.org')).toBeNull();
  });

  it('returns the label for a real organization subdomain', () => {
    expect(resolveOrgSubdomain('patitas.adoptafacil.org', 'adoptafacil.org')).toBe('patitas');
  });

  it('is case-insensitive on both the hostname and the configured base domain', () => {
    expect(resolveOrgSubdomain('Patitas.AdoptaFacil.ORG', 'ADOPTAFACIL.org')).toBe('patitas');
  });

  for (const reserved of ['www', 'app', 'api', 'admin', 'staging']) {
    it(`treats the reserved label "${reserved}" as NOT an organization subdomain`, () => {
      expect(resolveOrgSubdomain(`${reserved}.adoptafacil.org`, 'adoptafacil.org')).toBeNull();
    });
  }

  it('returns null for a nested subdomain (unsupported shape, never guesses)', () => {
    expect(resolveOrgSubdomain('sub.patitas.adoptafacil.org', 'adoptafacil.org')).toBeNull();
  });

  it('returns null for a completely unrelated host (localhost)', () => {
    expect(resolveOrgSubdomain('localhost', 'adoptafacil.org')).toBeNull();
  });

  it('returns null for a host on a different domain entirely (e.g. a staging preview URL)', () => {
    expect(resolveOrgSubdomain('adoptafacil-web-preview.vercel.app', 'adoptafacil.org')).toBeNull();
  });

  it('returns null for an empty hostname', () => {
    expect(resolveOrgSubdomain('', 'adoptafacil.org')).toBeNull();
  });
});

describe('isCustomPortalHost (dominio propio de una organización Pro)', () => {
  it('sin el dominio de AdoptaFácil configurado nunca trata un host como propio', () => {
    expect(isCustomPortalHost('www.turefugio.org', undefined)).toBe(false);
  });
  it('un dominio ajeno es el dominio propio de una organización', () => {
    expect(isCustomPortalHost('www.turefugio.org', 'adoptafacil.org')).toBe(true);
    expect(isCustomPortalHost('TuRefugio.com.co', 'adoptafacil.org')).toBe(true);
  });
  it('AdoptaFácil, sus subdominios, localhost e IPs no lo son', () => {
    for (const host of [
      'adoptafacil.org',
      'www.adoptafacil.org',
      'patitas.adoptafacil.org',
      'localhost',
      '127.0.0.1',
      'app.localhost',
    ]) {
      expect(isCustomPortalHost(host, 'adoptafacil.org')).toBe(false);
    }
  });
});
