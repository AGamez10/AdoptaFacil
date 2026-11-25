import { ShareCardCache } from './share-card-cache';

const png = (tag: string) => Buffer.from(tag);

describe('ShareCardCache (re-auditoría PR 166: card.png pública)', () => {
  it('genera una vez por publicación y foto; las peticiones simultáneas esperan la misma', async () => {
    const cache = new ShareCardCache();
    const render = jest.fn().mockResolvedValue(png('a'));
    const results = await Promise.all(
      Array.from({ length: 20 }, () => cache.get('post:foto', render)),
    );
    expect(render).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.toString() === 'a')).toBe(true);
    await cache.get('post:foto', render);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('vuelve a generar al vencer y nunca guarda más de maxEntries', async () => {
    let t = 0;
    const cache = new ShareCardCache({ ttlMs: 1000, maxEntries: 2, now: () => t });
    const render = jest.fn().mockImplementation(async () => png(String(t)));
    await cache.get('a', render);
    t = 2000;
    await cache.get('a', render);
    expect(render).toHaveBeenCalledTimes(2);
    await cache.get('b', render);
    await cache.get('c', render); // saca a la más antigua ('a')
    await cache.get('a', render);
    expect(render).toHaveBeenCalledTimes(5);
  });

  it('nunca genera más de maxConcurrent tarjetas a la vez', async () => {
    const cache = new ShareCardCache({ maxConcurrent: 2 });
    let running = 0;
    let peak = 0;
    const render = async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return png('x');
    };
    await Promise.all(Array.from({ length: 10 }, (_, i) => cache.get(`post-${i}`, render)));
    expect(peak).toBe(2);
  });

  it('un error no queda guardado: el siguiente intento vuelve a generar', async () => {
    const cache = new ShareCardCache();
    const render = jest.fn().mockRejectedValueOnce(new Error('falló')).mockResolvedValue(png('ok'));
    await expect(cache.get('k', render)).rejects.toThrow('falló');
    expect((await cache.get('k', render)).toString()).toBe('ok');
  });
});
