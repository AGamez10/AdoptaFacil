import sharp from 'sharp';
import {
  IMAGE_MAX_EDGE_PX,
  IMAGE_TARGET_MAX_BYTES,
  optimizeImage,
  sniffImageContentType,
} from './image-optimizer';
import { isAllowedUpload } from './storage-keys';

/** Foto de celular simulada: mucho píxel y algo de textura para que el JPEG pese. */
async function bigPhoto(): Promise<Buffer> {
  return sharp({
    create: {
      width: 4000,
      height: 3000,
      channels: 3,
      background: { r: 120, g: 110, b: 100 },
      noise: { type: 'gaussian', mean: 120, sigma: 12 },
    },
  })
    .jpeg({ quality: 100 })
    .toBuffer();
}

describe('optimizeImage', () => {
  jest.setTimeout(30_000);
  it('redimensiona a 1600 px y convierte un JPEG grande a WebP', async () => {
    const original = await bigPhoto();
    const result = await optimizeImage(original, 'image/jpeg');
    expect(result).not.toBeNull();
    expect(result!.contentType).toBe('image/webp');
    expect(sniffImageContentType(result!.buffer)).toBe('image/webp');
    const meta = await sharp(result!.buffer).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(IMAGE_MAX_EDGE_PX);
    expect(result!.buffer.length).toBeLessThan(original.length);
  });

  it('deja el WebP por debajo de la meta de 400 KB cuando la imagen lo permite', async () => {
    const original = await bigPhoto();
    const result = await optimizeImage(original, 'image/jpeg');
    expect(result!.buffer.length).toBeLessThanOrEqual(IMAGE_TARGET_MAX_BYTES);
  });

  it('no amplía una imagen pequeña', async () => {
    const small = await sharp({
      create: { width: 300, height: 200, channels: 3, background: { r: 10, g: 90, b: 40 } },
    })
      .png()
      .toBuffer();
    const result = await optimizeImage(small, 'image/png');
    const meta = await sharp(result!.buffer).metadata();
    expect(meta.width).toBe(300);
    expect(meta.height).toBe(200);
  });

  it('devuelve los bytes originales si WebP no sale más pequeño', async () => {
    const tiny = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .webp({ lossless: true, effort: 6 })
      .toBuffer();
    const result = await optimizeImage(tiny, 'image/webp');
    expect(result!.buffer).toBe(tiny);
    expect(result!.contentType).toBe('image/webp');
  });

  it('no toca GIF, PDF ni video', async () => {
    const bytes = Buffer.from('no es una imagen real');
    for (const type of ['image/gif', 'application/pdf', 'video/mp4']) {
      const result = await optimizeImage(bytes, type);
      expect(result).toEqual({ buffer: bytes, contentType: type });
    }
  });

  it('rechaza bytes que no son una imagen decodificable', async () => {
    const result = await optimizeImage(Buffer.from('esto no es un jpeg'), 'image/jpeg');
    expect(result).toBeNull();
  });
});

describe('sniffImageContentType', () => {
  it('reconoce JPEG, PNG, WebP y GIF por sus bytes', () => {
    expect(sniffImageContentType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(
      sniffImageContentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe('image/png');
    expect(sniffImageContentType(Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 ', 'latin1'))).toBe(
      'image/webp',
    );
    expect(sniffImageContentType(Buffer.from('GIF89a\x00\x00', 'latin1'))).toBe('image/gif');
  });

  it('devuelve null para bytes desconocidos', () => {
    expect(sniffImageContentType(Buffer.from('%PDF-1.4'))).toBeNull();
  });
});

describe('isAllowedUpload (tipos aceptados)', () => {
  it('sigue aceptando JPEG, PNG, WebP, GIF y PDF en privado y en público', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']) {
      expect(isAllowedUpload(type, 'private')).toBe(true);
      expect(isAllowedUpload(type, 'public')).toBe(true);
    }
  });

  it('solo acepta video en público', () => {
    expect(isAllowedUpload('video/mp4', 'public')).toBe(true);
    expect(isAllowedUpload('video/mp4', 'private')).toBe(false);
  });
});
