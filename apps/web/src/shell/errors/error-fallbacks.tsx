import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Logo } from '@adoptafacil/ui';
import { LayoutErrorBoundary } from '../layout/error-boundary';
import { isChunkLoadError, isOffline } from './chunk-error';
import { ErrorScreen, type ErrorAction, type ErrorScreenProps } from './error-screen';
import styles from './error-screen.module.scss';

function reloadPage() {
  window.location.reload();
}

/**
 * Traduce un error de render a la pantalla correcta:
 *   - archivo de una versión anterior → "Hay una versión nueva" + Recargar
 *   - sin conexión                    → "No hay conexión" + Reintentar
 *   - cualquier otro                  → 500 en el cliente + Reintentar
 * `home` es la salida segura (enlace de navegación completa, sin router).
 */
export function errorScreenFor(
  error: unknown,
  reset: () => void,
  home: { label: string; href: string },
): Pick<ErrorScreenProps, 'kind' | 'actions'> {
  const homeAction: ErrorAction = { ...home, variant: 'secondary' };
  if (isChunkLoadError(error)) {
    return {
      kind: 'update',
      actions: [{ label: 'Recargar la página', onClick: reloadPage }, homeAction],
    };
  }
  return {
    kind: isOffline() ? 'offline' : 'server',
    actions: [{ label: 'Reintentar', onClick: reset }, homeAction],
  };
}

/** Marco mínimo (logo + contenido): no depende de router, sesión ni módulos. */
function BareErrorFrame({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.bare__header}>
        <a href="/" aria-label="Ir al inicio" className="inline-flex">
          <Logo variant="mark" tone="light" size="sm" withWordmark />
        </a>
      </header>
      <main className={styles.page__main}>{children}</main>
    </div>
  );
}

/** Pantalla de error de página completa (fuera del panel). */
export function AppErrorFallback({ error, reset }: { error: unknown; reset: () => void }) {
  return (
    <BareErrorFrame>
      <ErrorScreen {...errorScreenFor(error, reset, { label: 'Volver al inicio', href: '/' })} />
    </BareErrorFrame>
  );
}

/** Error dentro del área de contenido del panel: el menú lateral sigue vivo. */
export function ShellContentErrorFallback({ error, reset }: { error: unknown; reset: () => void }) {
  return (
    <ErrorScreen
      compact
      {...errorScreenFor(error, reset, { label: 'Ir a mi inicio', href: '/inicio' })}
    />
  );
}

/**
 * Red de seguridad de toda la app, DENTRO del router: un error en cualquier
 * página pública (portal, campañas, fichas) muestra la 500 con marca en vez
 * de una pantalla en blanco, y se limpia sola al navegar (atrás/adelante).
 */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <LayoutErrorBoundary
      resetKeys={[pathname]}
      fallback={(error, reset) => <AppErrorFallback error={error} reset={reset} />}
    >
      {children}
    </LayoutErrorBoundary>
  );
}

/** Último recurso, FUERA de router y contextos: si algo falla al arrancar. */
export function RootErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <LayoutErrorBoundary
      fallback={(error, reset) => <AppErrorFallback error={error} reset={reset} />}
    >
      {children}
    </LayoutErrorBoundary>
  );
}

/** Para piezas opcionales (p. ej. la ayuda flotante): si fallan, no se muestran. */
export function SilentErrorBoundary({ children }: { children: ReactNode }) {
  return <LayoutErrorBoundary fallback={() => null}>{children}</LayoutErrorBoundary>;
}
