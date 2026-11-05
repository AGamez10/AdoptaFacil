import { lazy, Suspense } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AppProviders } from './app-providers';
import { AppRoutes } from './router/routes';
import { ScrollToTop } from './router/scroll-to-top';

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

const AUTH_MODE: 'mock' | 'http' = import.meta.env.VITE_AUTH_MODE === 'mock' ? 'mock' : 'http';

/**
 * Application shell entry point: providers + router + routes. Mounted by main.tsx.
 * The provider tree is router-agnostic; tests mount <AppProviders> + <AppRoutes>
 * under a <MemoryRouter> instead of <BrowserRouter>.
 */
export function Shell() {
  return (
    <AppProviders session={{ mode: AUTH_MODE }}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ScrollToTop />
        <AppRoutes />
        {/* Ola 3 (R3-8): ayuda fija por página, sin IA (D14). */}
        <Suspense fallback={null}>
          <GuideAssistant />
        </Suspense>
      </BrowserRouter>
    </AppProviders>
  );
}
