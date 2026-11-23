import { execFileSync } from 'node:child_process';
import { PDFDocument, StandardFonts } from 'pdf-lib';

/**
 * PDF de prueba con la distribución de los documentos oficiales colombianos,
 * con datos FICTICIOS (ningún NIT, nombre o cédula real):
 *
 * - RUT, formulario 001 de la DIAN: cada casilla tiene su etiqueta numerada
 *   arriba ("35. Razón social") y el valor abajo, en MAYÚSCULAS. Los dígitos del
 *   NIT y de los códigos DANE van uno por casilla.
 * - Certificado de existencia y representación legal (formato RUES/Confecámaras):
 *   texto corrido con "Etiqueta: valor" y la tabla de nombramientos.
 *
 * El RUT se arma en dos órdenes, porque pdf.js devuelve el texto en el orden en
 * que el PDF lo dibuja: `interleaved` (cada valor justo después de su etiqueta)
 * y `labels-first` (todo el formulario primero y los valores al final). El
 * segundo es el que producía "Primer apellido 32. Segundo apellido…" como
 * razón social.
 */

export const FAKE = {
  nitBase: '900123456',
  nitDv: '8',
  legalName: 'FUNDACION HUELLITAS DEL VALLE',
  tradeName: 'HUELLITAS',
  department: 'Valle del Cauca',
  city: 'Cali',
  address: 'CL 5 38 25 OF 201',
  repName: 'PEREZ GOMEZ MARIA FERNANDA',
  repDoc: '52345678',
};

interface Cell {
  label: string;
  value?: string;
  x: number;
}

type Row = { heading: string } | { cells: Cell[] };

/** Hoja principal y hoja 3 (representación) del RUT de una persona jurídica. */
export function rutRows(over: { taxpayer?: string; legalName?: string } = {}): Row[] {
  return [
    { heading: 'Formulario del Registro Único Tributario Hoja Principal 001' },
    {
      cells: [
        { label: '2. Concepto', value: '0 2 Actualización', x: 20 },
        { label: '4. Número de formulario', value: '14123456789', x: 300 },
      ],
    },
    {
      cells: [
        {
          label: '5. Número de Identificación Tributaria (NIT)',
          value: FAKE.nitBase.split('').join(' '),
          x: 20,
        },
        { label: '6. DV', value: FAKE.nitDv, x: 200 },
        { label: '12. Dirección seccional', value: 'Impuestos de Cali', x: 240 },
        { label: '14. Buzón electrónico', value: '3 1', x: 460 },
      ],
    },
    { heading: 'IDENTIFICACIÓN' },
    {
      cells: [
        { label: '24. Tipo de contribuyente', value: over.taxpayer ?? 'Persona jurídica 1', x: 20 },
        { label: '25. Tipo de documento', x: 130 },
        { label: '26. Número de Identificación', x: 220 },
        { label: '27. Fecha expedición', x: 330 },
        { label: '28. País 29. Departamento 30. Ciudad/Municipio', x: 410 },
      ],
    },
    {
      cells: [
        { label: '31. Primer apellido', x: 20 },
        { label: '32. Segundo apellido', x: 150 },
        { label: '33. Primer nombre', x: 280 },
        { label: '34. Otros nombres', x: 410 },
      ],
    },
    {
      cells: [{ label: '35. Razón social', value: over.legalName ?? FAKE.legalName, x: 20 }],
    },
    {
      cells: [
        { label: '36. Nombre comercial', value: FAKE.tradeName, x: 20 },
        { label: '37. Sigla', value: 'FHV', x: 410 },
      ],
    },
    { heading: 'UBICACIÓN' },
    {
      cells: [
        { label: '38. País', value: 'COLOMBIA 1 6 9', x: 20 },
        { label: '39. Departamento', value: `${FAKE.department} 7 6`, x: 170 },
        { label: '40. Ciudad/Municipio', value: `${FAKE.city} 0 0 1`, x: 330 },
      ],
    },
    { cells: [{ label: '41. Dirección principal', value: FAKE.address, x: 20 }] },
    { cells: [{ label: '42. Correo electrónico', value: 'contacto@huellitas.example', x: 20 }] },
    {
      cells: [
        { label: '43. Código postal', value: '760042', x: 20 },
        { label: '44. Teléfono 1', value: '6 0 2 3 4 5 6 7 8 9', x: 170 },
        { label: '45. Teléfono 2', x: 330 },
      ],
    },
    { heading: 'CLASIFICACIÓN' },
    {
      cells: [
        { label: '46. Código 47. Fecha inicio actividad', value: '9 4 9 9 2 0 1 5 0 3 1 2', x: 20 },
      ],
    },
    { cells: [{ label: '53. Responsabilidades, Calidades y Atributos', x: 20 }] },
    {
      cells: [
        { label: '', value: '04- Impto. renta y compl. régimen especial', x: 20 },
        { label: '', value: '07- Retención en la fuente a título de renta', x: 300 },
      ],
    },
    { heading: 'Formulario del Registro Único Tributario Hoja 3 Representación' },
    {
      cells: [
        { label: '98. Representación', value: 'REPRS LEGAL PRIN', x: 20 },
        { label: '99. Fecha inicio ejercicio representación', value: '2 0 1 5 0 3 1 2', x: 250 },
      ],
    },
    {
      cells: [
        { label: '100. Tipo de documento', value: 'Cédula de Ciudadanía 1 3', x: 20 },
        { label: '101. Número de identificación', value: FAKE.repDoc, x: 200 },
        { label: '102. DV', x: 360 },
      ],
    },
    {
      cells: [
        { label: '104. Primer apellido', value: 'PEREZ', x: 20 },
        { label: '105. Segundo apellido', value: 'GOMEZ', x: 150 },
        { label: '106. Primer nombre', value: 'MARIA', x: 280 },
        { label: '107. Otros nombres', value: 'FERNANDA', x: 410 },
      ],
    },
    { heading: 'Fecha generación documento PDF: 01-10-2026 10:12:13AM' },
  ];
}

/** Certificado de una ESAL inscrita en la Cámara de Comercio de Cali. */
export function chamberLines(): string[] {
  return [
    'CÁMARA DE COMERCIO DE CALI',
    'CERTIFICADO DE EXISTENCIA Y REPRESENTACIÓN LEGAL O INSCRIPCIÓN DE DOCUMENTOS',
    'Fecha expedición: 2 de octubre de 2026 Hora: 10:22:31',
    'CÓDIGO DE VERIFICACIÓN: A26001234567',
    'NOMBRE, IDENTIFICACIÓN Y DOMICILIO',
    `Razón social: ${FAKE.legalName}`,
    'Sigla: No reportó',
    `Nit: ${FAKE.nitBase.slice(0, 3)}.${FAKE.nitBase.slice(3, 6)}.${FAKE.nitBase.slice(6)}-${FAKE.nitDv}`,
    'Domicilio principal: Cali, Valle del Cauca',
    'INSCRIPCIÓN',
    'Inscripción No: S0012345',
    'Fecha de inscripción: 12 de marzo de 2015',
    'Último año renovado: 2026',
    'Fecha de renovación: 25 de marzo de 2026',
    'Estado de la inscripción: ACTIVA',
    'UBICACIÓN',
    `Dirección del domicilio principal: ${FAKE.address}`,
    'Municipio: Cali - Valle del Cauca',
    'Correo electrónico: contacto@huellitas.example',
    'CONSTITUCIÓN',
    'Por Acta No. 1 del 1 de febrero de 2015 de la Asamblea de Asociados, registrado en',
    'esta Cámara de Comercio el 12 de marzo de 2015 con el No. 123 del Libro I, se',
    `constituyó la entidad sin ánimo de lucro denominada ${FAKE.legalName}.`,
    'NOMBRAMIENTOS',
    'REPRESENTANTES LEGALES',
    'CARGO NOMBRE IDENTIFICACIÓN',
    `REPRESENTANTE LEGAL MARIA FERNANDA PEREZ GOMEZ C.C. No. 52.345.678`,
    `REPRESENTANTE LEGAL SUPLENTE JUAN CARLOS RUIZ DIAZ C.C. No. 16.789.012`,
  ];
}

async function newPage() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 1008]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  return { doc, page, font };
}

/** Dibuja el RUT. `labels-first` imita los PDF que pintan el fondo del
 *  formulario completo antes de los datos. */
export async function rutPdf(
  order: 'interleaved' | 'labels-first',
  rows: Row[] = rutRows(),
): Promise<Buffer> {
  const { doc, page, font } = await newPage();
  const drawLabel = (t: string, x: number, y: number) =>
    t && page.drawText(t, { x, y, size: 5, font });
  const drawValue = (t: string, x: number, y: number) => page.drawText(t, { x, y, size: 8, font });
  const values: Array<() => void> = [];
  let y = 980;
  for (const row of rows) {
    if ('heading' in row) {
      drawLabel(row.heading, 20, y);
      y -= 14;
      continue;
    }
    for (const c of row.cells) drawLabel(c.label, c.x, y);
    const vy = y - 10;
    const drawRow = () => row.cells.forEach((c) => c.value && drawValue(c.value, c.x, vy));
    if (order === 'interleaved') drawRow();
    else values.push(drawRow);
    y -= 26;
  }
  values.forEach((draw) => draw());
  return Buffer.from(await doc.save());
}

export async function chamberPdf(): Promise<Buffer> {
  const { doc, page, font } = await newPage();
  chamberLines().forEach((line, i) =>
    page.drawText(line, { x: 30, y: 970 - i * 14, size: 9, font }),
  );
  return Buffer.from(await doc.save());
}

/**
 * Lee el PDF con pdf-parse en un Node aparte, con las mismas opciones que el
 * adaptador (pdf.js usa import() dinámico, que la VM de Jest no permite).
 */
export function readWithPdfParse(pdf: Buffer, cwd: string): string {
  const script = `
    const { PDFParse } = require('pdf-parse');
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', async () => {
      const p = new PDFParse({ data: new Uint8Array(Buffer.concat(chunks)), isEvalSupported: false, disableFontFace: true, stopAtErrors: false });
      const r = await p.getText({ first: 10 });
      await p.destroy();
      process.stdout.write(r.text);
    });`;
  return execFileSync(process.execPath, ['-e', script], { input: pdf, cwd }).toString();
}
