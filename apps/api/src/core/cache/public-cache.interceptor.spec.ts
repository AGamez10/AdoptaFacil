import { publicCacheKey } from './public-cache.interceptor';

describe('publicCacheKey (plan de escala, B5)', () => {
  it('shares one entry whatever the query param order', () => {
    expect(publicCacheKey('/public/animals?species=dog&page=2')).toBe(
      publicCacheKey('/public/animals?page=2&species=dog'),
    );
  });

  it('separates different paths and different filters', () => {
    expect(publicCacheKey('/public/animals?species=dog')).not.toBe(
      publicCacheKey('/public/animals?species=cat'),
    );
    expect(publicCacheKey('/public/campaigns')).not.toBe(publicCacheKey('/public/animals'));
  });

  it('never puts the raw URL in the key', () => {
    expect(publicCacheKey('/public/organizations/refugio-x')).toMatch(/^pc:v1:[0-9a-f]{64}$/);
  });
});
