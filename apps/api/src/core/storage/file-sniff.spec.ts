import sharp from 'sharp';
import { isInlineContentType, sniffContentType } from './file-sniff';

describe('sniffContentType: el tipo sale de los bytes, no del nombre', () => {
  it('reconoce PDF, imágenes y video por su firma', async () => {
    const png = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();
    expect(sniffContentType(Buffer.from('%PDF-1.7\n...'))).toBe('application/pdf');
    expect(sniffContentType(png)).toBe('image/png');
    expect(sniffContentType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('image/jpeg');
    expect(sniffContentType(Buffer.from('GIF89a......'))).toBe('image/gif');
    expect(sniffContentType(Buffer.from('\0\0\0\x18ftypisom\0\0\0\0', 'latin1'))).toBe('video/mp4');
    expect(sniffContentType(Buffer.from('\0\0\0\x14ftypqt  \0\0\0\0', 'latin1'))).toBe(
      'video/quicktime',
    );
    expect(sniffContentType(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01]))).toBe('video/webm');
  });

  it('no reconoce HTML, scripts ni ejecutables aunque se llamen .pdf', () => {
    expect(sniffContentType(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull();
    expect(sniffContentType(Buffer.from('<svg onload="alert(1)"/>'))).toBeNull();
    expect(sniffContentType(Buffer.from('MZ\x90\x00\x03', 'latin1'))).toBeNull();
    expect(sniffContentType(Buffer.from('PK\x03\x04', 'latin1'))).toBeNull();
    expect(sniffContentType(Buffer.alloc(0))).toBeNull();
  });

  it('solo PDF, imagen y video se muestran en línea', () => {
    expect(isInlineContentType('application/pdf')).toBe(true);
    expect(isInlineContentType('image/webp')).toBe(true);
    expect(isInlineContentType('text/html')).toBe(false);
    expect(isInlineContentType('application/octet-stream')).toBe(false);
  });
});
