import { useEffect, useSyncExternalStore } from 'react';

/**
 * Contexto que una página le pasa al asistente de guía cuando la ruta sola no
 * basta. El asistente vive fuera de las rutas (en el shell), así que no ve los
 * datos que cada página ya cargó; este pequeño almacén se los acerca sin una
 * llamada extra a la red.
 *
 * - `portal`: la persona está DENTRO del portal público de una organización
 *   (`/o/:slug`, su ficha de animal o su subdominio). La ayuda se vuelve
 *   discreta y el contacto es el de esa organización, no el de AdoptaFácil.
 * - `template-demo`: vista de ejemplo de una plantilla (`/plantillas/:id`).
 */
export interface GuideOrganization {
  name: string;
  /** WhatsApp público tal cual lo guardó la organización (se sanea al usarlo). */
  whatsapp?: string;
  contactEmail?: string;
}

export type GuideContext =
  | {
      kind: 'portal';
      organization: GuideOrganization;
      /** Nombre del animal cuando la persona está en su ficha. */
      animalName?: string;
      /** Vista previa privada del equipo de la organización (portal aún no público). */
      ownerPreview?: boolean;
    }
  | { kind: 'template-demo'; templateName: string };

let current: GuideContext | null = null;
const listeners = new Set<() => void>();

function setGuideContext(next: GuideContext | null) {
  current = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => current;

/** Lo que lee el asistente. */
export function useCurrentGuideContext(): GuideContext | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Lo llama la página mientras está montada. `null` (por ejemplo, mientras
 * carga) no registra nada. Al desmontarse, la página retira su contexto.
 */
export function useGuideContext(context: GuideContext | null) {
  // La clave evita re-registrar en cada render por un objeto nuevo con lo mismo.
  const key = context ? JSON.stringify(context) : null;
  useEffect(() => {
    if (!key) return;
    const value = JSON.parse(key) as GuideContext;
    setGuideContext(value);
    return () => {
      if (current && JSON.stringify(current) === key) setGuideContext(null);
    };
  }, [key]);
}
