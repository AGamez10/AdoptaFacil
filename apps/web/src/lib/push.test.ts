import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPushSupported, urlBase64ToUint8Array } from './push';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('push: utilidades', () => {
  it('convierte la clave VAPID base64url a bytes', () => {
    // "AQID" = bytes 1,2,3 en base64; "-_8" = 0xfb 0xff (base64url de 2 bytes).
    expect(Array.from(urlBase64ToUint8Array('AQID'))).toEqual([1, 2, 3]);
    expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([0xfb, 0xff]);
  });

  it('sin service worker ni PushManager, el push no está soportado', () => {
    expect(isPushSupported()).toBe(false);
  });
});
