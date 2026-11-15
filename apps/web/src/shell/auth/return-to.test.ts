import { describe, expect, it } from 'vitest';
import { accessPathWithReturn, returnPathOf, safeReturnTo } from './return-to';

describe('safeReturnTo', () => {
  it('keeps internal routes with their query and hash', () => {
    expect(safeReturnTo('/campanas/mi-campana')).toBe('/campanas/mi-campana');
    expect(safeReturnTo('/donar?organizationId=abc&x=1')).toBe('/donar?organizationId=abc&x=1');
    expect(safeReturnTo('/voluntariado#jornadas')).toBe('/voluntariado#jornadas');
  });

  it('rejects anything that is not an internal path', () => {
    expect(safeReturnTo(null)).toBeNull();
    expect(safeReturnTo(undefined)).toBeNull();
    expect(safeReturnTo('')).toBeNull();
    expect(safeReturnTo('campanas')).toBeNull();
    expect(safeReturnTo('https://evil.example/phish')).toBeNull();
    expect(safeReturnTo('//evil.example/phish')).toBeNull();
    expect(safeReturnTo('/\\evil.example')).toBeNull();
    expect(safeReturnTo('/ok\nSet-Cookie:x')).toBeNull();
    expect(safeReturnTo('/x'.padEnd(3000, 'a'))).toBeNull();
  });

  it('never sends the person back to an access screen (no loops)', () => {
    expect(safeReturnTo('/login')).toBeNull();
    expect(safeReturnTo('/register?returnTo=/x')).toBeNull();
    expect(safeReturnTo('/forgot')).toBeNull();
  });
});

describe('accessPathWithReturn', () => {
  it('carries a safe intention in returnTo', () => {
    expect(accessPathWithReturn('/login', '/campanas/x?vista=1')).toBe(
      '/login?returnTo=%2Fcampanas%2Fx%3Fvista%3D1',
    );
  });

  it('falls back to the bare route when there is no safe intention', () => {
    expect(accessPathWithReturn('/register', null)).toBe('/register');
    expect(accessPathWithReturn('/login', 'https://evil.example')).toBe('/login');
  });
});

describe('returnPathOf', () => {
  it('joins pathname and search', () => {
    expect(returnPathOf({ pathname: '/c/abc', search: '?utm=1' })).toBe('/c/abc?utm=1');
    expect(returnPathOf({ pathname: '/c/abc', search: '' })).toBe('/c/abc');
  });
});
