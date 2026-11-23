import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { from, lastValueFrom, of, throwError } from 'rxjs';
import type { PublicCacheService } from './public-cache.service';
import { PublicCacheInterceptor, publicCacheKey } from './public-cache.interceptor';

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

describe('PublicCacheInterceptor single-flight (prueba de carga 2026-11-23)', () => {
  function setup() {
    const store = new Map<string, string>();
    const cache = {
      enabled: true,
      ttlSeconds: 30,
      get: jest.fn(async (key: string) => store.get(key) ?? null),
      set: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
    } as unknown as PublicCacheService;
    const interceptor = new PublicCacheInterceptor(cache);
    const context = (url: string) => {
      const headers: Record<string, string> = {};
      const res = { setHeader: (k: string, v: string) => (headers[k] = v) };
      const ctx = {
        switchToHttp: () => ({
          getRequest: () => ({ method: 'GET', originalUrl: url }),
          getResponse: () => res,
        }),
      } as unknown as ExecutionContext;
      return { ctx, headers };
    };
    return { interceptor, cache, context };
  }

  it('runs the handler once for concurrent misses of the same URL', async () => {
    const { interceptor, context } = setup();
    let release!: (value: unknown) => void;
    const gate = new Promise((resolve) => (release = resolve));
    let calls = 0;
    const handler: CallHandler = {
      handle: () => {
        calls += 1;
        return from(gate.then(() => ({ data: [1, 2, 3] })));
      },
    };
    const requests = Array.from({ length: 10 }, () => context('/public/animals?page=1'));
    const results = requests.map(({ ctx }) => lastValueFrom(interceptor.intercept(ctx, handler)));
    await new Promise((resolve) => setImmediate(resolve));
    release(undefined);
    const bodies = await Promise.all(results);

    expect(calls).toBe(1);
    expect(bodies).toEqual(Array(10).fill({ data: [1, 2, 3] }));
    expect(requests.filter((r) => r.headers['X-Cache'] === 'MISS')).toHaveLength(1);
    expect(requests.filter((r) => r.headers['X-Cache'] === 'COALESCED')).toHaveLength(9);
  });

  it('shares a handler error with the waiting requests and lets the next one retry', async () => {
    const { interceptor, context } = setup();
    let calls = 0;
    const failing: CallHandler = {
      handle: () => {
        calls += 1;
        return throwError(() => new Error('db down'));
      },
    };
    const a = lastValueFrom(interceptor.intercept(context('/public/campaigns').ctx, failing));
    const b = lastValueFrom(interceptor.intercept(context('/public/campaigns').ctx, failing));
    await expect(a).rejects.toThrow('db down');
    await expect(b).rejects.toThrow('db down');

    const ok: CallHandler = { handle: () => of({ items: [] }) };
    await expect(
      lastValueFrom(interceptor.intercept(context('/public/campaigns').ctx, ok)),
    ).resolves.toEqual({ items: [] });
    expect(calls).toBeLessThanOrEqual(2);
  });

  it('keeps different URLs independent', async () => {
    const { interceptor, context } = setup();
    let calls = 0;
    const handler: CallHandler = {
      handle: () => {
        calls += 1;
        return of({ n: calls });
      },
    };
    await Promise.all([
      lastValueFrom(interceptor.intercept(context('/public/animals?species=dog').ctx, handler)),
      lastValueFrom(interceptor.intercept(context('/public/animals?species=cat').ctx, handler)),
    ]);
    expect(calls).toBe(2);
  });
});
