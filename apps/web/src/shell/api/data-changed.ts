/**
 * Ola 3: aviso global de que algo cambió en el servidor. El cliente HTTP lo
 * emite tras cada escritura exitosa (POST/PUT/PATCH/DELETE) para que vistas
 * de resumen, como la campana de pendientes, se refresquen sin recargar.
 */
export const DATA_CHANGED_EVENT = 'adoptafacil:data-changed';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function notifyDataChanged(method: string | undefined): void {
  if (typeof window === 'undefined') return;
  if (!MUTATING.has((method ?? 'GET').toUpperCase())) return;
  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT));
}
