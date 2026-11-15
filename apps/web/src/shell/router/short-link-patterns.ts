/**
 * Patrones de los enlaces cortos, sin React ni Vite: los usan la web
 * (`short-links.tsx`) y el proxy de desarrollo (`vite.config.ts`). Caddy
 * repite el mismo reparto en `deploy/Caddyfile` (`@share_link`).
 */
const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

export const UUID_PATTERN = new RegExp(`^${UUID}$`);

/** `^/p/<uuid>` o `^/c/<uuid>` (enlace compartido de la comunidad), con o sin
 *  `?…`. En Vite, una clave de `proxy` que empieza por `^` es una RegExp. */
export const SHARE_LINK_PATTERN = `^/[pc]/${UUID}(\\?|$)`;
