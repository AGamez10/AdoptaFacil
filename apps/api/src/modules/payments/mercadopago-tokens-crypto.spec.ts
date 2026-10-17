import { randomBytes } from 'node:crypto';
import {
  isSealedMercadoPagoToken,
  openMercadoPagoToken,
  sealMercadoPagoToken,
} from './mercadopago-tokens-crypto';

describe('Mercado Pago token encryption at rest', () => {
  const key = randomBytes(32);

  it('round-trips a token and never stores it in clear', () => {
    const token = 'APP_USR-1234567890-abcdef';
    const sealed = sealMercadoPagoToken(token, key);
    expect(isSealedMercadoPagoToken(sealed)).toBe(true);
    expect(sealed).not.toContain(token);
    expect(openMercadoPagoToken(sealed, key)).toBe(token);
  });

  it('reads legacy clear values as they are', () => {
    expect(openMercadoPagoToken('APP_USR-legacy', key)).toBe('APP_USR-legacy');
  });

  it('keeps an empty token empty', () => {
    expect(sealMercadoPagoToken('', key)).toBe('');
  });

  it('refuses a wrong key', () => {
    const sealed = sealMercadoPagoToken('APP_USR-x', key);
    expect(() => openMercadoPagoToken(sealed, randomBytes(32))).toThrow();
  });
});
