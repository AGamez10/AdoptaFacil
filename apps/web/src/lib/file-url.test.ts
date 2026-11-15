import { describe, expect, it, vi } from 'vitest';
import {
  installDevFileUrlRebase,
  isLoopbackHost,
  publicUrlFromUploadTarget,
  reachableFileUrl,
  rebaseFileUrls,
} from './file-url';

const TUNNEL = 'https://demo.ngrok-free.app/campanas/abc';
const SUPPORT = 'http://localhost:3000/storage/public?key=public%2Forg%2Fsoporte.pdf';

describe('reachableFileUrl', () => {
  it('moves a localhost support link onto the API the tunnel reaches', () => {
    expect(reachableFileUrl(SUPPORT, '/api', TUNNEL)).toBe(
      'https://demo.ngrok-free.app/api/storage/public?key=public%2Forg%2Fsoporte.pdf',
    );
  });

  it('works with an absolute API base and private files too', () => {
    expect(
      reachableFileUrl(
        'http://127.0.0.1:3000/storage/private?key=k',
        'https://api.example.org',
        'https://web.example.org/',
      ),
    ).toBe('https://api.example.org/storage/private?key=k');
  });

  it('adds the missing /api prefix on the same origin', () => {
    expect(
      reachableFileUrl(
        'https://adoptafacil.org/storage/public?key=logo.png',
        '/api',
        'https://adoptafacil.org/o/patitas',
      ),
    ).toBe('https://adoptafacil.org/api/storage/public?key=logo.png');
  });

  it('leaves correct, foreign and non-file URLs alone', () => {
    const here = 'https://adoptafacil.org/';
    for (const url of [
      'https://adoptafacil.org/api/storage/public?key=a',
      'https://img.adoptafacil.org/api/storage/public?key=a',
      'https://maps.google.com/?q=1',
      'http://localhost:3000/public/campaigns',
      'no es una url',
      '',
    ]) {
      expect(reachableFileUrl(url, '/api', here)).toBe(url);
    }
  });

  it('changes nothing in plain local development', () => {
    expect(reachableFileUrl(SUPPORT, 'http://localhost:3000', 'http://localhost:5173/')).toBe(
      SUPPORT,
    );
    expect(reachableFileUrl(SUPPORT, '/api', 'http://localhost:5173/')).toBe(SUPPORT);
  });
});

describe('rebaseFileUrls', () => {
  it('rewrites every file URL inside a JSON payload and keeps the rest', () => {
    const payload = {
      title: 'Campaña',
      amount: 1000,
      evidences: [{ url: SUPPORT, concept: 'Factura' }],
      org: { logoUrl: SUPPORT, website: 'https://patitas.org' },
      empty: null,
    };
    expect(rebaseFileUrls(payload, '/api', TUNNEL)).toEqual({
      ...payload,
      evidences: [
        {
          url: 'https://demo.ngrok-free.app/api/storage/public?key=public%2Forg%2Fsoporte.pdf',
          concept: 'Factura',
        },
      ],
      org: {
        logoUrl: 'https://demo.ngrok-free.app/api/storage/public?key=public%2Forg%2Fsoporte.pdf',
        website: 'https://patitas.org',
      },
    });
  });
});

describe('publicUrlFromUploadTarget', () => {
  it('keeps the /api prefix of the production base', () => {
    expect(
      publicUrlFromUploadTarget(
        'https://adoptafacil.org/api/storage/upload?key=public%2Fx.png',
        'public/x.png',
      ),
    ).toBe('https://adoptafacil.org/api/storage/public?key=public%2Fx.png');
  });

  it('works with a base without prefix', () => {
    expect(
      publicUrlFromUploadTarget('http://localhost:3000/storage/upload?key=k', 'public/x.png'),
    ).toBe('http://localhost:3000/storage/public?key=public%2Fx.png');
  });
});

describe('isLoopbackHost', () => {
  it('recognises localhost names only', () => {
    expect(['localhost', '127.0.0.1', '[::1]', 'demo.localhost'].every(isLoopbackHost)).toBe(true);
    expect(['adoptafacil.org', 'localhost.example.com'].some(isLoopbackHost)).toBe(false);
  });
});

describe('installDevFileUrlRebase', () => {
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

  it('is not installed when the API is on localhost', () => {
    const win = { fetch: vi.fn(), location: { href: 'http://localhost:5173/' } };
    expect(installDevFileUrlRebase('/api', win as never)).toBe(false);
  });

  it('rewrites API JSON responses seen through a tunnel', async () => {
    const inner = vi.fn(async (_input: RequestInfo | URL) => json({ url: SUPPORT }));
    const win: { fetch: typeof fetch; location: { href: string } } = {
      fetch: inner,
      location: { href: TUNNEL },
    };
    expect(installDevFileUrlRebase('/api', win as never)).toBe(true);
    const res = await win.fetch('/api/public/campaigns/abc');
    expect(await res.json()).toEqual({
      url: 'https://demo.ngrok-free.app/api/storage/public?key=public%2Forg%2Fsoporte.pdf',
    });
  });

  it('leaves other hosts and non-JSON responses untouched', async () => {
    const other = json({ url: SUPPORT });
    const file = new Response('%PDF', { headers: { 'content-type': 'application/pdf' } });
    const inner = vi.fn().mockResolvedValueOnce(other).mockResolvedValueOnce(file);
    const win: { fetch: typeof fetch; location: { href: string } } = {
      fetch: inner,
      location: { href: TUNNEL },
    };
    installDevFileUrlRebase('/api', win as never);
    expect(await win.fetch('https://otro.example.com/x.json')).toBe(other);
    expect(await win.fetch('/api/storage/public?key=a')).toBe(file);
  });
});
