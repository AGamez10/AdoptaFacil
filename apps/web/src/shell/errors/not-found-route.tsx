import { useSession } from '../auth/session-context';
import { AppLayout } from '../layout/app-layout';
import { FullPageLoading } from '../layout/layout-states';
import { ErrorScreen } from './error-screen';
import { PublicNotFoundPage } from './public-error-page';

/** 404 dentro del panel (con menú lateral), para quien tiene sesión. */
export function ShellNotFoundContent() {
  return (
    <ErrorScreen
      kind="not-found"
      compact
      message="La sección que buscas no existe, cambió de lugar o aún no está disponible para tu cuenta."
      actions={[
        { label: 'Ir a mi inicio', to: '/inicio' },
        { label: 'Volver atrás', onClick: () => window.history.back(), variant: 'secondary' },
      ]}
    />
  );
}

/**
 * Ruta comodín (`*`) de toda la aplicación. Antes vivía solo dentro del panel
 * protegido, así que un visitante sin sesión que escribía mal una dirección
 * terminaba en "Iniciar sesión" en vez de una 404. Ahora:
 *
 *   - sesión resolviéndose → carga
 *   - con sesión           → 404 dentro del panel (menú lateral intacto)
 *   - sin sesión           → 404 pública (navbar, atajos, pie)
 */
export function NotFoundRoute() {
  const { status } = useSession();
  if (status === 'loading') return <FullPageLoading label="Cargando…" />;
  if (status === 'authenticated') {
    return (
      <AppLayout>
        <ShellNotFoundContent />
      </AppLayout>
    );
  }
  return <PublicNotFoundPage />;
}
