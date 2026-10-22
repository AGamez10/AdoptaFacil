/**
 * Pasarela activa en el navegador (ADR-PAG-002). ePayco es la ÚNICA pasarela
 * desde que Mercado Pago se retiró del producto (2026-10-17, decisión del
 * dueño): la UI nunca muestra Mercado Pago.
 *
 * `VITE_PAYMENT_PROVIDER` queda solo como interruptor de apagado: `off`,
 * `none` o `disabled` esconden el pago en línea (la página de donar muestra
 * un aviso tranquilo y Medios de pago no ofrece conectar nada). Cualquier
 * otro valor —vacío, `epayco` o un valor viejo como `mercadopago`— usa ePayco.
 *
 * Se lee en cada llamada (nunca cacheado a nivel de módulo) para que los tests
 * puedan cambiarlo con `vi.stubEnv` sin re-importar módulos.
 */
export type WebPaymentProvider = 'epayco' | 'off';

const KILL_SWITCH_VALUES = new Set(['off', 'none', 'disabled']);

export function activePaymentProvider(): WebPaymentProvider {
  const value = (import.meta.env.VITE_PAYMENT_PROVIDER ?? '').trim().toLowerCase();
  return KILL_SWITCH_VALUES.has(value) ? 'off' : 'epayco';
}

export function isEpaycoProvider(): boolean {
  return activePaymentProvider() === 'epayco';
}
