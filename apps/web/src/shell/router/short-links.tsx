import type { ReactNode } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { UUID_PATTERN } from './short-link-patterns';

/**
 * Enlaces cortos públicos. Cada prefijo pertenece a UN solo dueño, y el mismo
 * reparto vive en `deploy/Caddyfile` (`@share_link`) y en `vite.config.ts`:
 *
 *   /c/<código>  QR impreso en las bolsas de café (8 caracteres; no cambia nunca)
 *   /p/<uuid>    publicación de la comunidad compartida en redes (puente con
 *                Open Graph en la API; la web solo lo ve si el puente no está)
 *   /c/<uuid>    formato viejo de lo mismo: enlaces que ya están en redes
 *   /q/<código>  QR fijo de cada organización
 *
 * Antes la comunidad compartía con `/c/<uuid>` y la web lo abría como café:
 * "Código no encontrado". `short-links.test.tsx` comprueba que ningún prefijo
 * se pise con otro.
 */

/** Página pública de una publicación, conservando `?utm_*`/`?s=` del enlace. */
function SharedPostRedirect({ id }: { id: string }) {
  const { search } = useLocation();
  return <Navigate to={`/comunidad/publicacion/${encodeURIComponent(id)}${search}`} replace />;
}

/** `/p/:id` sin el puente delante (p. ej. desarrollo sin proxy). */
export function SharedPostLink() {
  const { id = '' } = useParams<{ id: string }>();
  if (!UUID_PATTERN.test(id)) return <Navigate to="/" replace />;
  return <SharedPostRedirect id={id} />;
}

/** `/c/:code`: el QR del café, salvo un UUID (enlace viejo de la comunidad). */
export function CoffeeOrLegacyShareLink({ coffee }: { coffee: ReactNode }) {
  const { code = '' } = useParams<{ code: string }>();
  if (UUID_PATTERN.test(code)) return <SharedPostRedirect id={code} />;
  return <>{coffee}</>;
}
