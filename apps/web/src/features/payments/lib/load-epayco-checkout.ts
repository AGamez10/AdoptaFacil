/**
 * Carga perezosa del script público de ePayco checkout v2 (ADR-PAG-002).
 * Solo se inyecta cuando un donante ya creó su donación y hay una sesión de
 * checkout que abrir — nunca al cargar la app ni en los tests (que mockean
 * este módulo).
 */
export const EPAYCO_CHECKOUT_SRC = 'https://checkout.epayco.co/checkout-v2.js';
const SCRIPT_ID = 'epayco-checkout-v2';

export interface EpaycoCheckoutConfig {
  sessionId: string;
  type: 'onpage' | 'standard';
  test: boolean;
}

export interface EpaycoCheckoutHandler {
  open: () => void;
}

export interface EpaycoGlobal {
  checkout: {
    configure: (config: EpaycoCheckoutConfig) => EpaycoCheckoutHandler;
  };
}

declare global {
  interface Window {
    ePayco?: EpaycoGlobal;
  }
}

let pending: Promise<EpaycoGlobal> | null = null;

function readGlobal(): EpaycoGlobal | null {
  const ePayco = window.ePayco;
  return ePayco && typeof ePayco.checkout?.configure === 'function' ? ePayco : null;
}

/** Inyecta el script UNA vez y resuelve con `window.ePayco`. Si falla, el
 *  siguiente intento vuelve a intentarlo (no queda una promesa rechazada en caché). */
export function loadEpaycoCheckout(): Promise<EpaycoGlobal> {
  const ready = readGlobal();
  if (ready) return Promise.resolve(ready);
  if (pending) return pending;

  pending = new Promise<EpaycoGlobal>((resolve, reject) => {
    document.getElementById(SCRIPT_ID)?.remove();
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = EPAYCO_CHECKOUT_SRC;
    script.async = true;
    script.onload = () => {
      const loaded = readGlobal();
      if (loaded) resolve(loaded);
      else reject(new Error('El script de ePayco cargó, pero no expuso el checkout.'));
    };
    script.onerror = () => reject(new Error('No se pudo cargar el script de ePayco.'));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    pending = null;
    document.getElementById(SCRIPT_ID)?.remove();
    throw error;
  });
  return pending;
}

/** Solo para tests: olvida el script/promesa en caché. */
export function resetEpaycoCheckoutLoaderForTests(): void {
  pending = null;
  document.getElementById(SCRIPT_ID)?.remove();
}
