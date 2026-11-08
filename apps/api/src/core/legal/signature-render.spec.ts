import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { embedSignatureForPdf, fitSignature, prepareSignature } from './signature-render';

/** Lienzo del SignaturePad (400×150, transparente) con un trazo en una esquina. */
async function padCanvas(): Promise<Buffer> {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="150">' +
    '<path d="M30 60 C 50 10, 80 10, 90 60 S 130 100, 150 40" stroke="#1a1a1a" stroke-width="3" fill="none"/></svg>';
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe('prepareSignature (firma lista para un documento)', () => {
  it('recorta el lienzo vacío alrededor del trazo', async () => {
    const out = await prepareSignature(await padCanvas());
    expect(out).not.toBeNull();
    // El trazo ocupa ~125×75 px de un lienzo de 400×150.
    expect(out!.width).toBeLessThan(160);
    expect(out!.height).toBeLessThan(100);
    const meta = await sharp(out!.png).metadata();
    expect(meta.format).toBe('png');
    expect([meta.width, meta.height]).toEqual([out!.width, out!.height]);
  });

  it('vuelve transparente el papel blanco de una firma sin transparencia (JPG)', async () => {
    const jpg = await sharp(await padCanvas())
      .flatten({ background: '#ffffff' })
      .jpeg()
      .toBuffer();
    const out = await prepareSignature(jpg);
    expect(out).not.toBeNull();
    const { data, info } = await sharp(out!.png).ensureAlpha().raw().toBuffer({
      resolveWithObject: true,
    });
    // La esquina superior izquierda es papel: queda transparente.
    expect(data[3]).toBe(0);
    expect(info.width).toBeLessThan(160);
  });

  it('devuelve null si los bytes no son una imagen', async () => {
    expect(await prepareSignature(Buffer.from('no-es-imagen'))).toBeNull();
    expect(await prepareSignature(null)).toBeNull();
  });

  it('embebe en el PDF la firma ya recortada', async () => {
    const pdf = await PDFDocument.create();
    const image = await embedSignatureForPdf(pdf, await padCanvas());
    expect(image).not.toBeNull();
    expect(image!.width).toBeLessThan(160);
  });
});

describe('fitSignature', () => {
  it('cabe en la caja sin deformarse', () => {
    const size = fitSignature(400, 150, 140, 42);
    expect(size.height).toBeLessThanOrEqual(42 + 1e-9);
    expect(size.width).toBeLessThanOrEqual(140 + 1e-9);
    expect(size.width / size.height).toBeCloseTo(400 / 150, 5);
  });

  it('amplía una firma pequeña solo hasta 1,5×', () => {
    expect(fitSignature(40, 20, 200, 60)).toEqual({ width: 60, height: 30 });
  });
});
