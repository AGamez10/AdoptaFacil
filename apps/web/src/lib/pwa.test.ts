import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { registerServiceWorker } from './pwa';

const publicDir = join(__dirname, '..', '..', 'public');

describe('registerServiceWorker', () => {
  it('does nothing outside production builds', async () => {
    const register = vi.fn();
    const nav = { serviceWorker: { register } } as unknown as Navigator;
    expect(await registerServiceWorker({ enabled: false, nav })).toBeNull();
    expect(register).not.toHaveBeenCalled();
  });

  it('does nothing when the browser has no service worker support', async () => {
    expect(await registerServiceWorker({ enabled: true, nav: {} as Navigator })).toBeNull();
  });

  it('registers /sw.js at the root scope', async () => {
    const registration = { scope: '/' };
    const register = vi.fn().mockResolvedValue(registration);
    const nav = { serviceWorker: { register } } as unknown as Navigator;
    expect(await registerServiceWorker({ enabled: true, nav })).toBe(registration);
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  it('swallows registration errors so the app keeps working', async () => {
    const register = vi.fn().mockRejectedValue(new Error('blocked'));
    const nav = { serviceWorker: { register } } as unknown as Navigator;
    expect(await registerServiceWorker({ enabled: true, nav })).toBeNull();
  });
});

describe('web app manifest', () => {
  const manifest = JSON.parse(readFileSync(join(publicDir, 'manifest.webmanifest'), 'utf8'));

  it('is installable: standalone display, start_url in scope, 192 and 512 icons', () => {
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === 'maskable')).toBe(
      true,
    );
  });

  it('points only to icons that exist', () => {
    for (const icon of manifest.icons) {
      expect(() => readFileSync(join(publicDir, icon.src))).not.toThrow();
    }
  });
});

describe('service worker', () => {
  const sw = readFileSync(join(publicDir, 'sw.js'), 'utf8');

  it('never intercepts API, non-GET or cross-origin requests', () => {
    expect(sw).toContain("request.method !== 'GET'");
    expect(sw).toContain('url.origin !== self.location.origin');
    expect(sw).toContain("url.pathname.startsWith('/api/')");
  });

  it('precaches the offline page it falls back to', () => {
    expect(sw).toContain("'/offline.html'");
    expect(() => readFileSync(join(publicDir, 'offline.html'))).not.toThrow();
  });
});
