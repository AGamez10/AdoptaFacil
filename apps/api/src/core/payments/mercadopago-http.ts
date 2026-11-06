/**
 * Upper bound for every call to Mercado Pago's API (OAuth, Checkout Pro,
 * read-backs, subscriptions). Without it a slow or hung Mercado Pago keeps a
 * donation request or a webhook handler open indefinitely (Node's fetch has
 * no default timeout); with it the call fails fast and Mercado Pago retries
 * the notification later.
 */
export const MERCADOPAGO_HTTP_TIMEOUT_MS = 10_000;

/** A fresh abort signal per call (a signal can only time out once). */
export function mercadoPagoTimeoutSignal(): AbortSignal {
  return AbortSignal.timeout(MERCADOPAGO_HTTP_TIMEOUT_MS);
}
