import { lazy, Suspense } from 'react';
import { AppProviders } from './app-providers';
import { RootErrorBoundary, RouteErrorBoundary, SilentErrorBoundary } from './errors';
import { AppRoutes, ROUTE_PRELOADS } from './router/routes';
import { IntentPreloader } from './router/intent-preloader';
import { ScrollToTop } from './router/scroll-to-top';
import { ViewTransitionRouter } from './router/view-transition-router';
import { CookieConsentBanner } from './consent';
import { InstallAppBanner } from './install';

/**
 * Auth transport for the real app: 'http' talks to the backend `/auth/*`
 * endpoints (T-024). Set `VITE_AUTH_MODE=mock` to fall back to the in-memory
 * service (e.g. a backend-less demo). Tests never mount <Shell>, so they keep
 * the API layer's mock default.
 */
/** La ayuda flotante (con todo su contenido por pantalla) llega en su propio
 *  chunk: no es necesaria para pintar la página y pesaba ~6 KB en la primera carga. */
const GuideAssistant = lazy(() =>
  import('../features/guide/components/guide-assistant').then((m) => ({
    default: m.GuideAssistant,
  })),
);

// El modo `mock` (sesión simulada en memoria, sin API) solo existe en el
// servidor de desarrollo: un build de producción siempre usa la API real,
// aunque alguien deje VITE_AUTH_MODE=mock (además vite.config.ts falla el build).
const AUTH_MODE: 'mock' | 'http' =
  import.meta.env.MODE !== 'production' && import.meta.env.VITE_AUTH_MODE === 'mock'
    ? 'mock'
    : 'http';

/**
 * Application shell entry point: providers + router + routes. Mounted by main.tsx.
 * The provider tree is router-agnostic; tests mount <AppProviders> + <AppRoutes>
 * under a <MemoryRouter> instead of <ViewTransitionRouter>.
 */
export function Shell() {
  return (
    // Errores de render: la 500 con marca en vez de una pantalla en blanco.
    <RootErrorBoundary>
      <AppProviders session={{ mode: AUTH_MODE }}>
        {/* <BrowserRouter> con transiciones de vista entre pantallas. */}
        <ViewTransitionRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ScrollToTop />
          <IntentPreloader table={ROUTE_PRELOADS} />
          <RouteErrorBoundary>
            <AppRoutes />
          </RouteErrorBoundary>
          {/* Ola 3 (R3-8): ayuda fija por página, sin IA (D14). Si su archivo
            no carga, simplemente no aparece: no tumba la página. */}
          <SilentErrorBoundary>
            <Suspense fallback={null}>
              <GuideAssistant />
            </Suspense>
          </SilentErrorBoundary>
          {/* Aviso de cookies (Ley 1581): sale hasta que el visitante decide; sin
            permiso no se carga nada de estadística ni de marketing. */}
          <CookieConsentBanner />
          {/* Invitación a instalar la app: sale después del aviso de cookies. */}
          <InstallAppBanner />
        </ViewTransitionRouter>
      </AppProviders>
    </RootErrorBoundary>
  );
}
