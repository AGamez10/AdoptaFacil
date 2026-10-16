import { loadEpaycoCheckout } from './load-epayco-checkout';

export interface OpenEpaycoCheckoutInput {
  /** `Donation.checkoutSessionId` devuelto por `POST /donations`. */
  sessionId: string;
  /** `Donation.checkoutTest`: sesión del sandbox de ePayco. */
  test?: boolean;
}

/**
 * Abre el checkout de ePayco (modo `onpage`, sobre nuestra propia página) con
 * la sesión que creó la API usando las llaves de la organización: el dinero
 * va directo a la cuenta ePayco de la organización. Los medios de pago que se
 * muestran (tarjeta, PSE, Nequi, Daviplata, efectivo…) son los que esa cuenta
 * tenga habilitados en ePayco. Rechaza si el script no carga.
 */
export async function openEpaycoCheckout({
  sessionId,
  test,
}: OpenEpaycoCheckoutInput): Promise<void> {
  const ePayco = await loadEpaycoCheckout();
  const handler = ePayco.checkout.configure({ sessionId, type: 'onpage', test: test === true });
  handler.open();
}
