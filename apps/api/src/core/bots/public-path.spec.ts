import { isPublicPath, normalizeRoutePath } from './public-api-throttler.guard';
import { isPublicReadPath } from '../rate-limit/scale-rate-limit.guard';

/** Auditoría run-4 F3: Express no distingue mayúsculas y acepta la barra final. */
describe('public path predicates (audit run-4 F3)', () => {
  it('normalizes case, trailing slashes, duplicate slashes and the query string', () => {
    expect(normalizeRoutePath('/PUBLIC/Animals/')).toBe('/public/animals');
    expect(normalizeRoutePath('//public//animals?x=1')).toBe('/public/animals');
    expect(normalizeRoutePath('/')).toBe('/');
  });

  it.each(['/public/animals', '/PUBLIC/animals', '/Public/animals/', '/public', '/PUBLIC/'])(
    'isPublicPath(%s) is true',
    (path) => expect(isPublicPath(path)).toBe(true),
  );

  it.each(['/publicity', '/org/animals', '/auth/login'])('isPublicPath(%s) is false', (path) =>
    expect(isPublicPath(path)).toBe(false),
  );

  it.each([
    '/public/animals',
    '/PUBLIC/animals',
    '/storage/public',
    '/STORAGE/public',
    '/storage/public/',
  ])('isPublicReadPath(%s) is true', (path) => expect(isPublicReadPath(path)).toBe(true));
});
