import { describe, expect, it } from 'vitest';
import { isNativeApp } from './native-app';

describe('isNativeApp', () => {
  it('is false in a normal browser', () => {
    expect(isNativeApp({})).toBe(false);
    expect(isNativeApp(undefined)).toBe(false);
  });

  it('is true inside the Capacitor app', () => {
    expect(isNativeApp({ Capacitor: { isNativePlatform: () => true } })).toBe(true);
  });

  it('is false when Capacitor runs as plain web', () => {
    expect(isNativeApp({ Capacitor: { isNativePlatform: () => false } })).toBe(false);
  });
});
