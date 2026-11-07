import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Suspense } from 'react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderShell } from '../../test-utils';
import { lazyPage } from '../router/lazy-page';
import { isChunkLoadError } from './chunk-error';
import { ErrorScreen } from './error-screen';
import { RootErrorBoundary, RouteErrorBoundary } from './error-fallbacks';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ok' }) }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const guest = { session: { initialStatus: 'unauthenticated' as const } };
const member = { session: { initialStatus: 'authenticated' as const } };

describe('404 — rutas inexistentes', () => {
  it.each(['/ruta-inexistente', '/organizacion/no-existe', '/adoptar/perros/bogota/extra'])(
    'un visitante sin sesión ve la 404 pública en %s (no el login)',
    (route) => {
      renderShell({ route, ...guest });
      expect(
        screen.getByRole('heading', { level: 1, name: 'Página no encontrada' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Iniciar sesión' })).not.toBeInTheDocument();
      // Marco público: navbar arriba y atajos útiles.
      expect(screen.getByRole('banner')).toBeInTheDocument();
      const suggestions = screen.getByRole('navigation', { name: 'Lugares que te pueden servir' });
      for (const name of [/Adoptar/, /Campañas/, /Guías/]) {
        expect(within(suggestions).getByRole('link', { name })).toBeInTheDocument();
      }
      expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/');
    },
  );

  it('marca la 404 como noindex y mueve el foco al título', () => {
    renderShell({ route: '/no-existe', ...guest });
    const heading = screen.getByRole('heading', { level: 1, name: 'Página no encontrada' });
    expect(heading).toHaveFocus();
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, follow',
    );
  });

  it('una ruta protegida que SÍ existe sigue pidiendo iniciar sesión', () => {
    renderShell({ route: '/mis-solicitudes', ...guest });
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('con sesión, la 404 se muestra dentro del panel con su menú', async () => {
    renderShell({ route: '/organizacion/no-existe', ...member });
    expect(
      await screen.findByRole('heading', { name: 'Página no encontrada' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a mi inicio' })).toHaveAttribute('href', '/inicio');
    expect(screen.getByRole('button', { name: 'Volver atrás' })).toBeInTheDocument();
  });
});

describe('403 — sin permiso', () => {
  it('una cuenta sin el rol ve "Sin acceso" con salida a su inicio', async () => {
    renderShell({ route: '/plataforma/dashboard', ...member });
    expect(await screen.findByRole('heading', { name: 'Sin acceso' })).toBeInTheDocument();
    expect(screen.getByTestId('error-screen-forbidden')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a mi inicio' })).toBeInTheDocument();
  });
});

describe('organización inexistente o suspendida en un subdominio', () => {
  it('muestra la 404 de organización con marco público', async () => {
    vi.stubEnv('VITE_PORTAL_BASE_DOMAIN', 'adoptafacil.co');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }),
    );
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, hostname: 'fantasma.adoptafacil.co' },
    });
    try {
      renderShell({ route: '/', ...guest });
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Organización no encontrada' }),
      ).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
      vi.unstubAllEnvs();
    }
  });
});

function Boom({ error }: { error: Error }): never {
  throw error;
}

function GoTo({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(to)}>
      navegar
    </button>
  );
}

describe('500 — errores al mostrar una página', () => {
  it('muestra la 500 con marca y se limpia al navegar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <MemoryRouter initialEntries={['/rota']}>
        <GoTo to="/sana" />
        <RouteErrorBoundary>
          <Routes>
            <Route path="/rota" element={<Boom error={new Error('falló')} />} />
            <Route path="/sana" element={<p>todo bien</p>} />
          </Routes>
        </RouteErrorBoundary>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Algo salió mal' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/');

    await userEvent.click(screen.getByRole('button', { name: 'navegar' }));
    expect(screen.getByText('todo bien')).toBeInTheDocument();
  });

  it('si falta un archivo de una versión anterior, pide recargar', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <RootErrorBoundary>
        <Boom error={new TypeError('Failed to fetch dynamically imported module: /assets/x.js')} />
      </RootErrorBoundary>,
    );
    expect(
      screen.getByRole('heading', { name: 'Hay una versión nueva de AdoptaFácil' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recargar la página' })).toBeInTheDocument();
  });

  it('sin conexión, lo dice en vez de culpar al servidor', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(
      <RootErrorBoundary>
        <Boom error={new Error('network')} />
      </RootErrorBoundary>,
    );
    expect(screen.getByRole('heading', { name: 'No hay conexión a internet' })).toBeInTheDocument();
  });

  it('una pantalla diferida que no carga termina en la pantalla de error, no en carga eterna', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const Broken = lazyPage(
      () => Promise.reject(new TypeError('Failed to fetch dynamically imported module')),
      'Nada' as never,
    ) as unknown as () => null;
    render(
      <RootErrorBoundary>
        <Suspense fallback={<p>cargando</p>}>
          <Broken />
        </Suspense>
      </RootErrorBoundary>,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(
      await screen.findByRole('heading', { name: 'Hay una versión nueva de AdoptaFácil' }),
    ).toBeInTheDocument();
  });
});

describe('ErrorScreen', () => {
  it('usa h2 en modo compacto y no roba el foco si se pide', () => {
    render(<ErrorScreen kind="server" compact autoFocus={false} />);
    const heading = screen.getByRole('heading', { level: 2, name: 'Algo salió mal' });
    expect(heading).not.toHaveFocus();
  });
});

describe('isChunkLoadError', () => {
  it.each([
    [new TypeError('Failed to fetch dynamically imported module: /a.js'), true],
    [new TypeError('Importing a module script failed.'), true],
    [new Error('error loading dynamically imported module'), true],
    [Object.assign(new Error('x'), { name: 'ChunkLoadError' }), true],
    [new Error('Cannot read properties of undefined'), false],
    [null, false],
    ['texto', false],
  ])('%s → %s', (error, expected) => {
    expect(isChunkLoadError(error)).toBe(expected);
  });
});
