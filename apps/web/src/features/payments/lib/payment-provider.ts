/**
 * Pasarela activa en el navegador (ADR-PAG-002). `VITE_PAYMENT_PROVIDER=epayco`
 * enciende la conexión de la cuenta ePayco de la organización y el checkout
 * de ePayco; cualquier otro valor (o sin definir) deja el flujo de Mercado
 * Pago exactamente como estaba.
 *
 * Se lee en cada llamada (nunca cacheado a nivel de módulo) para que los tests
 * puedan cambiarlo con `vi.stubEnv` sin re-importar módulos.
 */
export type WebPaymentProvider = 'epayco' | 'mercadopago';

export function activePaymentProvider(): WebPaymentProvider {
  const value = (import.meta.env.VITE_PAYMENT_PROVIDER ?? '').trim().toLowerCase();
  return value === 'epayco' ? 'epayco' : 'mercadopago';
}

export function isEpaycoProvider(): boolean {
  return activePaymentProvider() === 'epayco';
}
