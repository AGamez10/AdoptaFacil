import { afterEach, describe, expect, it } from 'vitest';
import {
  EPAYCO_CHECKOUT_SRC,
  loadEpaycoCheckout,
  resetEpaycoCheckoutLoaderForTests,
} from './load-epayco-checkout';

/** jsdom never downloads <script src>: the load/error events are fired by hand,
 *  so no real ePayco script is ever fetched or executed here. */
function injectedScript(): HTMLScriptElement | null {
  return document.querySelector(`script[src="${EPAYCO_CHECKOUT_SRC}"]`);
}

afterEach(() => {
  resetEpaycoCheckoutLoaderForTests();
  delete window.ePayco;
});

describe('loadEpaycoCheckout', () => {
  it('injects the checkout-v2 script once and resolves with window.ePayco', async () => {
    const first = loadEpaycoCheckout();
    const second = loadEpaycoCheckout();
    expect(document.querySelectorAll(`script[src="${EPAYCO_CHECKOUT_SRC}"]`)).toHaveLength(1);

    const fake = { checkout: { configure: () => ({ open: () => undefined }) } };
    window.ePayco = fake;
    injectedScript()?.dispatchEvent(new Event('load'));

    await expect(first).resolves.toBe(fake);
    await expect(second).resolves.toBe(fake);
  });

  it('rejects on a load error and lets the next call try again', async () => {
    const attempt = loadEpaycoCheckout();
    injectedScript()?.dispatchEvent(new Event('error'));
    await expect(attempt).rejects.toThrow('No se pudo cargar el script de ePayco.');
    expect(injectedScript()).toBeNull();

    loadEpaycoCheckout().catch(() => undefined);
    expect(injectedScript()).not.toBeNull();
  });
});
