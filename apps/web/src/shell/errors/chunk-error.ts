/**
 * ¿El error viene de un archivo JS/CSS que ya no existe en el servidor? Pasa
 * cuando se publica una versión nueva mientras alguien navega: la pestaña
 * vieja pide pantallas con nombres que el despliegue nuevo ya no tiene. La
 * única salida es recargar para traer la versión nueva.
 */
const CHUNK_ERROR =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError|Loading chunk [\w-]+ failed/i;

export function isChunkLoadError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  return name === 'ChunkLoadError' || (typeof message === 'string' && CHUNK_ERROR.test(message));
}

/** Sin conexión según el navegador (si no lo sabe, se asume que hay). */
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}
