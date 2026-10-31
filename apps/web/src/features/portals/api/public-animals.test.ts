import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnimalSummary } from '@adoptafacil/contracts';
import { fetchAllPublicAnimals } from './public-animals';

const animal = (i: number, organizationId = 'org-1'): AnimalSummary =>
  ({ id: `a${i}`, organizationId, name: `A${i}` }) as AnimalSummary;

afterEach(() => vi.unstubAllGlobals());

describe('fetchAllPublicAnimals', () => {
  it('pide página por página hasta el último animal y descarta los de otra organización', async () => {
    const all = Array.from({ length: 112 }, (_, i) => animal(i));
    all[5] = animal(5, 'otra');
    const fetchMock = vi.fn(async (url: string) => {
      const params = new URL(url).searchParams;
      const limit = Number(params.get('limit'));
      const offset = Number(params.get('offset'));
      return new Response(
        JSON.stringify({
          items: all.slice(offset, offset + limit),
          total: all.length,
          limit,
          offset,
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const items = await fetchAllPublicAnimals({ slug: 'mi-org', organizationId: 'org-1' });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(items).toHaveLength(111);
    expect(items.some((a) => a.organizationId === 'otra')).toBe(false);
  });
});
