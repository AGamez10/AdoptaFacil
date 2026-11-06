import sharp from 'sharp';
import { normalizeSignatureImage, SignatureImageError } from './signature-image';

/** Foto simulada: papel gris claro con un trazo oscuro, en JPG y con EXIF. */
async function photoOfSignature(): Promise<Buffer> {
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">' +
      '<rect width="800" height="600" fill="#eeeeea"/>' +
      '<path d="M150 350 C 250 200, 350 450, 450 300 S 600 250, 650 380" stroke="#1a1a2a" stroke-width="10" fill="none"/>' +
      '</svg>',
  );
  return sharp(svg)
    .jpeg({ quality: 85 })
    .withExif({ IFD0: { Artist: 'secreto', ImageDescription: 'gps' } })
    .toBuffer();
}

describe('normalizeSignatureImage', () => {
  it('turns a photo on white paper into black ink on a transparent, cropped PNG with no metadata', async () => {
    const out = await normalizeSignatureImage(await photoOfSignature(), 'photo');
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('png');
    expect(meta.hasAlpha).toBe(true);
    expect(meta.exif).toBeUndefined();
    // Recortada a la firma (el trazo ocupa ~500x250 de 800x600).
    expect(meta.width).toBeLessThan(600);
    expect(meta.height).toBeLessThan(320);
    // La esquina es papel: transparente.
    const { data } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    expect(data[3]).toBe(0);
  });

  it('re-encodes a drawn PNG and drops metadata', async () => {
    const drawn = await sharp({
      create: { width: 300, height: 120, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .withExif({ IFD0: { Artist: 'x' } })
      .toBuffer();
    const out = await normalizeSignatureImage(drawn, 'drawn');
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('png');
    expect(meta.exif).toBeUndefined();
  });

  it('rejects a fake file whatever its name or declared type (SVG/HTML renamed to .png)', async () => {
    await expect(
      normalizeSignatureImage(Buffer.from('<svg onload="alert(1)"></svg>'), 'photo'),
    ).rejects.toThrow('PNG o JPG');
  });

  it('rejects a file with valid magic bytes but corrupt content', async () => {
    const corrupt = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(200, 7),
    ]);
    await expect(normalizeSignatureImage(corrupt, 'photo')).rejects.toBeInstanceOf(
      SignatureImageError,
    );
  });

  it('rejects an oversized file', async () => {
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(600 * 1024)]);
    await expect(normalizeSignatureImage(big, 'photo')).rejects.toThrow('512 KB');
  });

  it('rejects a photo with no visible signature (blank paper)', async () => {
    const blank = await sharp({
      create: { width: 400, height: 300, channels: 3, background: '#f4f4f0' },
    })
      .jpeg()
      .toBuffer();
    await expect(normalizeSignatureImage(blank, 'photo')).rejects.toThrow('firma clara');
  });
});
