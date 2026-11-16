import { useEffect, useState } from 'react';
import type { PublicCoffeeFeatured } from '@adoptafacil/contracts';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/** Una sola petición por carga de página, compartida por el aviso y la sección. */
let pending: Promise<string | null> | null = null;

function loadFeaturedCode(): Promise<string | null> {
  pending ??= fetch(`${API_BASE}/public/coffee/destacado`)
    .then((response) => (response.ok ? (response.json() as Promise<PublicCoffeeFeatured>) : null))
    .then((body) => (typeof body?.code === 'string' ? body.code : null))
    .catch(() => null);
  return pending;
}

/** Solo para pruebas: olvida la respuesta guardada. */
export function resetFeaturedCoffeeForTests(): void {
  pending = null;
}

/**
 * Dónde se compra el café hoy: `/c/<código>`, la misma página del QR de la
 * bolsa (precio, bolsas disponibles, campaña y pago). `null` mientras carga o
 * cuando no hay ningún lote a la venta; entonces nadie ofrece "Comprar".
 */
export function useFeaturedCoffeeHref(enabled = true): string | null {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    loadFeaturedCode().then((code) => {
      if (active && code) setHref(`/c/${encodeURIComponent(code)}`);
    });
    return () => {
      active = false;
    };
  }, [enabled]);
  return href;
}
