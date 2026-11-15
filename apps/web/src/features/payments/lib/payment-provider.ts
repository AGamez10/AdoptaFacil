/**
 * Pasarela activa en el navegador.
 *
 * 2026-11-06 (decisión del dueño, ADR-PAG-003): Mercado Pago es la única
 * pasarela, SIN split: cada refugio conecta SU cuenta de Mercado Pago por
 * OAuth y las donaciones llegan directo a esa cuenta.
 *
 * `VITE_PAYMENT_PROVIDER`:
 *   - vacío o `mercadopago` → Mercado Pago;
 *   - `off`, `none` o `disabled` → interruptor de apagado: la página de donar
 *     muestra un aviso tranquilo y Medios de pago no ofrece conectar nada.
 * Debe coincidir con `PAYMENT_DRIVER` de la API.
 *
 * Se lee en cada llamada (nunca cacheado a nivel de módulo) para que los tests
 * puedan cambiarlo con `vi.stubEnv` sin re-importar módulos.
 */
export type WebPaymentProvider = 'mercadopago' | 'off';

const KILL_SWITCH_VALUES = new Set(['off', 'none', 'disabled']);

export function activePaymentProvider(): WebPaymentProvider {
  const value = (import.meta.env.VITE_PAYMENT_PROVIDER ?? '').trim().toLowerCase();
  return KILL_SWITCH_VALUES.has(value) ? 'off' : 'mercadopago';
}

export function isMercadoPagoProvider(): boolean {
  return activePaymentProvider() === 'mercadopago';
}

/** Hay pago en línea. */
export function onlinePaymentsEnabled(): boolean {
  return activePaymentProvider() !== 'off';
}
