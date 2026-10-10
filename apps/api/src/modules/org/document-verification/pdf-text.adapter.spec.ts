import { execFileSync } from 'node:child_process';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { PdfTextAdapter } from './pdf-text.adapter';

async function pdfWith(lines: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  lines.forEach((line, i) => page.drawText(line, { x: 40, y: 760 - i * 18, size: 11, font }));
  return Buffer.from(await doc.save());
}

describe('PdfTextAdapter', () => {
  const adapter = new PdfTextAdapter();

  it('devuelve null para algo que no es PDF o está dañado', async () => {
    expect(await adapter.extractText(Buffer.from('\x89PNG....'), 'image/png')).toBeNull();
    expect(await adapter.extractText(Buffer.from('%PDF-1.7 basura'), 'application/pdf')).toBeNull();
  });

  // pdf.js carga su worker con import() dinámico, que la VM de Jest no permite
  // sin --experimental-vm-modules; por eso la lectura real corre en un Node aparte,
  // con las mismas opciones que usa el adaptador.
  it('lee la capa de texto de un PDF generado (Node real)', async () => {
    const pdf = await pdfWith(['Formulario del Registro Unico Tributario', 'NIT 900123456-8']);
    const script = `
      const { PDFParse } = require('pdf-parse');
      const chunks = [];
      process.stdin.on('data', (c) => chunks.push(c));
      process.stdin.on('end', async () => {
        const p = new PDFParse({ data: new Uint8Array(Buffer.concat(chunks)), isEvalSupported: false, disableFontFace: true });
        const r = await p.getText({ first: 10 });
        await p.destroy();
        process.stdout.write(r.text);
      });`;
    const out = execFileSync(process.execPath, ['-e', script], {
      input: pdf,
      cwd: __dirname,
    }).toString();
    expect(out).toContain('Registro Unico Tributario');
    expect(out).toContain('900123456-8');
  });
});
