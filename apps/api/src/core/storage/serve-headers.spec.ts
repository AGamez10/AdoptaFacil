import type { Response } from 'express';
import { servedFilename, setServeHeaders } from './serve-headers';

function fakeResponse(): { res: Response; headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: (name: string, value: string) => {
      headers[name.toLowerCase()] = value;
    },
  } as unknown as Response;
  return { res, headers };
}

const KEY =
  'private/6f9619ff-8b86-d011-b42d-00cf4fc964ff/2a1b3c4d-1111-4222-8333-444455556666-rut.png';

describe('cabeceras al servir un archivo de usuario', () => {
  it('un PDF se muestra en línea con su tipo real aunque la clave diga .png', () => {
    const { res, headers } = fakeResponse();
    setServeHeaders(res, KEY, Buffer.from('%PDF-1.7 ...'));
    expect(headers['content-type']).toBe('application/pdf');
    expect(headers['content-disposition']).toBe('inline; filename="rut.pdf"');
    expect(headers['content-security-policy']).toContain('sandbox');
    expect(headers['content-security-policy']).toContain("default-src 'none'");
  });

  it('bytes que no son PDF ni imagen nunca se sirven en línea ni con su tipo declarado', () => {
    const { res, headers } = fakeResponse();
    setServeHeaders(res, KEY, Buffer.from('<html><script>alert(1)</script>'));
    expect(headers['content-type']).toBe('application/octet-stream');
    expect(headers['content-disposition']).toBe('attachment; filename="rut"');
  });

  it('el nombre servido no trae el uuid ni caracteres que rompan la cabecera', () => {
    expect(servedFilename(KEY, 'image/webp')).toBe('rut.webp');
    expect(servedFilename('public/o/x-"; evil=1.pdf', 'application/pdf')).toBe('x-evil1.pdf');
  });
});
