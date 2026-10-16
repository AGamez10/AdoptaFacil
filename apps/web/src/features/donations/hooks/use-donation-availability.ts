import { useEffect, useState } from 'react';
import { checkOrganizationDonationAvailability } from '../api/donations-api';

/**
 * - `checking`: aún consultando.
 * - `available`: la organización puede recibir donaciones en línea.
 * - `unavailable`: la API dijo explícitamente que NO (`canReceiveDonations: false`).
 * - `unknown`: no se pudo saber (red, 5xx, respuesta rara).
 */
export type DonationAvailability = 'checking' | 'available' | 'unavailable' | 'unknown';

/**
 * Disponibilidad PÚBLICA de donaciones de una organización para los botones
 * "Donar" del portal. Falla abierta: solo `unavailable` cambia el botón por el
 * mensaje "activando sus donaciones"; ante la duda el botón sigue y la página
 * de donación (que vuelve a consultar) decide. Así una falla de red nunca
 * esconde la forma de ayudar.
 */
export function useDonationAvailability(
  organizationId: string | undefined,
  enabled = true,
): DonationAvailability {
  const [state, setState] = useState<DonationAvailability>('checking');

  useEffect(() => {
    if (!enabled || !organizationId) return;
    let active = true;
    setState('checking');
    void checkOrganizationDonationAvailability(organizationId).then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, [organizationId, enabled]);

  return state;
}
