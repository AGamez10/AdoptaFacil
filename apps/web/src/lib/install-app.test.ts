import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DISMISS_DAYS, isIosSafari, recentlyDismissed, rememberDismissed } from './install-app';

function fakeWindow(userAgent: string, touch = false): Window {
  return {
    navigator: { userAgent },
    document: touch ? { ...document, ontouchend: null } : document,
  } as unknown as Window;
}

describe('install-app: detección', () => {
  it('reconoce Safari en iPhone y descarta Chrome en iOS', () => {
    expect(
      isIosSafari(
        fakeWindow('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1'),
      ),
    ).toBe(true);
    expect(
      isIosSafari(fakeWindow('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) CriOS/120.0 Mobile/15E148')),
    ).toBe(false);
  });

  it('en Android no es iOS', () => {
    expect(
      isIosSafari(
        fakeWindow('Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/130 Mobile Safari/537.36'),
      ),
    ).toBe(false);
  });
});

describe('install-app: "Ahora no"', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it('recuerda el descarte y vuelve a salir pasado el plazo', () => {
    const now = new Date('2026-11-16T12:00:00.000Z');
    expect(recentlyDismissed(now)).toBe(false);
    rememberDismissed(now);
    expect(recentlyDismissed(new Date('2026-11-17T12:00:00.000Z'))).toBe(true);
    const later = new Date(now.getTime() + (DISMISS_DAYS + 1) * 24 * 60 * 60 * 1000);
    expect(recentlyDismissed(later)).toBe(false);
  });
});
