import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import type { Role } from '@adoptafacil/contracts';
import { ErrorScreen } from '../errors/error-screen';
import { useSession } from './session-context';

export interface RequireRolesProps {
  /**
   * Roles that may see the wrapped surface. Copied verbatim from the backend
   * `@Roles` of the endpoint that feeds it, so the route demands the SAME roles
   * as its API (deny-by-default; the API is still the real authority).
   */
  roles: readonly Role[];
  /** Title of the denied state (defaults to the shell's standard copy). */
  title?: string;
  /** One-line explanation shown in the denied state. */
  description?: string;
  /** Explicit children; defaults to an <Outlet /> for nested routes. */
  children?: ReactNode;
}

/**
 * Role guard for protected surfaces — the SECOND barrier of the shell's
 * double-barrier UX (the first is hiding the menu entry, see the sidebar). It
 * assumes an already-authenticated session (nest it under <RequireAuth />): by
 * the time roles resolve, `status` is 'authenticated' and roles are either
 * 'ready' or 'degraded' ([]), so `hasAnyRole` never flickers.
 *
 * Deny-by-default: if the roles fetch failed (roles: []) or the user simply
 * lacks the role, `hasAnyRole` returns false and we render the denied state
 * instead of the page — so a direct URL hit can never mount a surface the user
 * has no authority for.
 */
export function RequireRoles({
  roles,
  title = 'Sin acceso',
  description = 'No tienes los permisos necesarios para ver esta sección.',
  children,
}: RequireRolesProps) {
  const { hasAnyRole } = useSession();

  if (!hasAnyRole(...roles)) {
    return (
      <ErrorScreen
        kind="forbidden"
        compact
        title={title}
        message={description}
        actions={[{ label: 'Ir a mi inicio', to: '/inicio' }]}
      />
    );
  }

  return <>{children ?? <Outlet />}</>;
}
