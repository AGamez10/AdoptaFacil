import { describe, expect, it } from 'vitest';
import { sniffViewableType, toViewableFile } from './private-file';

const bytes = (...values: number[]) => new Uint8Array(values);

describe('private-file: solo se muestra un PDF o una imagen, decidido por los bytes', () => {
  it('reconoce PDF e imágenes por su firma', () => {
    expect(sniffViewableType(new TextEncoder().encode('%PDF-1.7'))).toBe('application/pdf');
    expect(sniffViewableType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe(
      'image/png',
    );
    expect(sniffViewableType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffViewableType(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
  });

  it('no muestra HTML ni SVG aunque lleguen como PDF', async () => {
    expect(sniffViewableType(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull();
    expect(
      await toViewableFile(new Blob(['<html><script>x</script>'], { type: 'application/pdf' })),
    ).toBeNull();
  });

  it('rehace el blob con el tipo real, no con el que dijo el servidor', async () => {
    const file = await toViewableFile(new Blob(['%PDF-1.4 rut'], { type: 'text/html' }));
    expect(file?.kind).toBe('pdf');
    expect(file?.blob.type).toBe('application/pdf');
  });
});
