import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COFFEE_CODE_PATTERN, coffeeQrScanUrl } from '@adoptafacil/contracts';
import { renderShell } from '../../test-utils';
import caddyfile from '../../../../../deploy/Caddyfile?raw';
import { shareLink } from '../../features/community/lib/share';
import { SHARE_LINK_PATTERN, UUID_PATTERN } from './short-link-patterns';

/**
 * Un dueño por prefijo de enlace corto. Antes, compartir una publicación de la
 * comunidad daba `/c/<uuid>` y la web lo abría como café: "Código no
 * encontrado (no corresponde a ningún café de AdoptaFácil)". Y en producción
 * Caddy mandaba todo `/c/*` a la API, así que el QR de la bolsa habría caído
 * en el puente de la comunidad.
 */
const POST_ID = '11111111-1111-4111-8111-111111111111';
const COFFEE_CODE = 'abcd2345';

/** Matchers de Caddy que mandan una ruta a la API (no a la web). */
function caddyApiMatchers(): RegExp[] {
  return [...caddyfile.matchAll(/^\s*@\w+\s+path_regexp\s+(\S+)\s*$/gm)].map(
    (m) => new RegExp(m[1]),
  );
}

describe('enlaces cortos: un dueño por prefijo', () => {
  it('el QR del café y el enlace compartido usan prefijos distintos', () => {
    const coffee = new URL(coffeeQrScanUrl('adoptafacil.org', COFFEE_CODE)).pathname;
    const share = new URL(shareLink(POST_ID, 'whatsapp', 'https://adoptafacil.org')).pathname;
    expect(coffee).toBe(`/c/${COFFEE_CODE}`);
    expect(share.startsWith('/c/')).toBe(false);
  });

  it('un código de café nunca parece un UUID (y al revés)', () => {
    expect(UUID_PATTERN.test(COFFEE_CODE)).toBe(false);
    expect(COFFEE_CODE_PATTERN.test(POST_ID)).toBe(false);
  });

  it('Caddy solo manda UUIDs al puente: el QR del café lo sirve la web', () => {
    expect(caddyfile).not.toMatch(/handle\s+\/c\/\*/);
    const matchers = caddyApiMatchers();
    expect(matchers.length).toBeGreaterThan(0);
    const toApi = (path: string) => matchers.some((re) => re.test(path));
    expect(toApi(`/p/${POST_ID}`)).toBe(true);
    expect(toApi(`/c/${POST_ID}`)).toBe(true);
    for (const path of [`/c/${COFFEE_CODE}`, '/q/abcd2345', '/cafe/pedido/x', '/plataforma']) {
      expect(toApi(path), path).toBe(false);
    }
  });

  it('el proxy de desarrollo reparte igual que Caddy', () => {
    const re = new RegExp(SHARE_LINK_PATTERN);
    expect(re.test(`/p/${POST_ID}?s=x`)).toBe(true);
    expect(re.test(`/c/${POST_ID}`)).toBe(true);
    expect(re.test(`/c/${COFFEE_CODE}?o=qr`)).toBe(false);
    expect(re.test('/portal')).toBe(false);
    expect(re.test('/perfil')).toBe(false);
  });
});

describe('enlaces cortos en la web', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch() {
    const fn = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/public/community/posts/')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            id: POST_ID,
            authorDisplayName: 'Laura',
            isOrganization: false,
            type: 'general',
            title: 'Un año con Toby',
            body: 'Hoy cumple un año.',
            images: [],
            commentCount: 0,
            likeCount: 0,
            createdAt: '2026-10-01T00:00:00.000Z',
          }),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        headers: { get: () => null },
        json: async () => ({}),
      });
    });
    vi.stubGlobal('fetch', fn);
    return fn;
  }

  const guest = { session: { initialStatus: 'unauthenticated' as const } };

  it.each([`/p/${POST_ID}?s=whatsapp`, `/c/${POST_ID}?s=whatsapp`])(
    '%s abre la publicación, no el café',
    async (route) => {
      const fetchMock = stubFetch();
      renderShell({ route, ...guest });
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Un año con Toby' }),
      ).toBeInTheDocument();
      expect(screen.queryByText('Código no encontrado')).toBeNull();
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/public/coffee/'))).toBe(false);
    },
  );

  it('el QR del café sigue abriendo el café', async () => {
    const fetchMock = stubFetch();
    renderShell({ route: `/c/${COFFEE_CODE}?o=qr`, ...guest });
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([u]) =>
          String(u).includes(`/public/coffee/${COFFEE_CODE}?o=qr`),
        ),
      ).toBe(true),
    );
  });
});
