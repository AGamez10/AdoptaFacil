import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchEarlyOr,
  portalProfileUrl,
  portalThemeUrl,
  publicAnimalUrl,
  startEarlyPortalFetches,
  takeEarlyFetch,
} from './early-fetch';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function stubFetch() {
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(new Response(JSON.stringify({ url }), { status: 200 })),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('peticiones tempranas del portal', () => {
  it('pide perfil y tema de un portal, y cada pantalla recibe su copia sin repetir la petición', async () => {
    const fetchMock = stubFetch();
    startEarlyPortalFetches('/o/patitas');
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      portalProfileUrl('patitas'),
      portalThemeUrl('patitas'),
    ]);
    const first = await fetchEarlyOr(portalProfileUrl('patitas'));
    const second = await fetchEarlyOr(portalProfileUrl('patitas'));
    expect(await first.json()).toEqual({ url: portalProfileUrl('patitas') });
    expect(await second.json()).toEqual({ url: portalProfileUrl('patitas') });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('en una ficha pide el animal por su código público y el perfil', () => {
    const fetchMock = stubFetch();
    startEarlyPortalFetches('/o/patitas/animales/luna-k7m2qp8x');
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      publicAnimalUrl('patitas', 'k7m2qp8x'),
      portalProfileUrl('patitas'),
    ]);
  });

  it('no pide nada fuera de un portal ni con una URL que no es de ficha', () => {
    const fetchMock = stubFetch();
    for (const path of ['/', '/adoptar/perros', '/o/Patitas', '/o/patitas/animales/luna']) {
      startEarlyPortalFetches(path);
    }
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([portalProfileUrl('patitas')]);
  });

  it('una respuesta vieja no se reutiliza: se pide de nuevo', () => {
    vi.useFakeTimers();
    stubFetch();
    startEarlyPortalFetches('/o/huellas');
    vi.advanceTimersByTime(16_000);
    expect(takeEarlyFetch(portalThemeUrl('huellas'))).toBeUndefined();
  });
});
