/**
 * Interruptor de pagos en línea en el navegador. Hoy no hay ninguna pasarela
 * conectada: la API decide si una organización puede recibir donaciones
 * (`canReceiveDonations`), y este interruptor solo permite apagar el pago en
 * línea desde la web.
 *
 * `VITE_PAYMENT_PROVIDER` con `off`, `none` o `disabled` esconde el pago en
 * línea (la página de donar muestra un aviso tranquilo). Cualquier otro valor
 * —o sin definir— deja que la API decida.
 *
 * Se lee en cada llamada (nunca cacheado a nivel de módulo) para que los tests
 * puedan cambiarlo con `vi.stubEnv` sin re-importar módulos.
 */
const KILL_SWITCH_VALUES = new Set(['off', 'none', 'disabled']);

export function onlinePaymentsEnabled(): boolean {
  const value = (import.meta.env.VITE_PAYMENT_PROVIDER ?? '').trim().toLowerCase();
  return !KILL_SWITCH_VALUES.has(value);
}
