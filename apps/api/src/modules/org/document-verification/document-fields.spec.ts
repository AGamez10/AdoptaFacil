import { DocumentType } from '@adoptafacil/contracts';
import {
  FAKE,
  chamberPdf,
  readWithPdfParse,
  rutPdf,
  rutRows,
} from './__fixtures__/official-documents';
import {
  extractChamberData,
  extractRutData,
  hasProfileData,
  isLabelLike,
  prefillFromText,
} from './document-fields';

const NIT = `${FAKE.nitBase}-${FAKE.nitDv}`;
const read = (pdf: Buffer) => readWithPdfParse(pdf, __dirname);

describe('lectura del RUT (formulario 001 de la DIAN) para el perfil', () => {
  let interleaved: string;
  let labelsFirst: string;

  beforeAll(async () => {
    interleaved = read(await rutPdf('interleaved'));
    labelsFirst = read(await rutPdf('labels-first'));
  });

  it('el PDF de prueba sale con las etiquetas antes que los valores (el caso del error)', () => {
    // Sanidad del montaje: en este orden lo que sigue a "Razón social" son etiquetas.
    const after = labelsFirst.slice(labelsFirst.indexOf('35. Razón social'), undefined);
    expect(after.split('\n')[1]).toContain('36. Nombre comercial');
  });

  it.each([
    ['valores junto a su casilla', () => interleaved],
    ['etiquetas primero y valores al final', () => labelsFirst],
  ])('extrae NIT, razón social, domicilio y dirección (%s)', (_name, text) => {
    const data = extractRutData(text());
    expect(data.nit).toBe(NIT);
    expect(data.legalName).toBe(FAKE.legalName);
    expect(data.location).toEqual({
      department: FAKE.department,
      city: FAKE.city,
      address: FAKE.address,
    });
    expect(data.details.find((d) => d.key === 'taxpayer_type')?.value).toBe('Persona jurídica');
    expect(data.details.find((d) => d.key === 'regime')?.value).toContain('04');
  });

  it('lee el representante legal de la hoja 3 cuando viene junto a su casilla', () => {
    const rep = extractRutData(interleaved).details.find((d) => d.key === 'legal_representative');
    expect(rep?.value).toBe(FAKE.repName);
    // En bloque no se puede saber qué nombre es de quién: no se adivina.
    const block = extractRutData(labelsFirst).details.find((d) => d.key === 'legal_representative');
    expect(block).toBeUndefined();
  });

  it('nunca propone etiquetas del formulario como razón social (regresión)', () => {
    // Exactamente lo que se vio: la casilla 35 en la misma línea que la 31-34.
    const text = [
      'Formulario del Registro Único Tributario Hoja Principal',
      '5. Número de Identificación Tributaria (NIT) 6. DV',
      '24. Tipo de contribuyente Persona jurídica',
      '35. Razón social 31. Primer apellido 32. Segundo apellido 33. Primer nombre',
      '34. Otros nombres',
      '36. Nombre comercial 37. Sigla',
    ].join('\n');
    const data = extractRutData(text);
    expect(data.legalName).toBeUndefined();
    expect(hasProfileData(prefillFromText('d1', DocumentType.Rut, text))).toBe(false);
  });

  it('con la razón social vacía no propone nada (y no toma el nombre comercial)', async () => {
    const rows = rutRows({ legalName: '' });
    for (const order of ['interleaved', 'labels-first'] as const) {
      const data = extractRutData(read(await rutPdf(order, rows)));
      expect(data.legalName).toBeUndefined();
      expect(data.nit).toBe(NIT);
    }
  });

  it('el RUT de una persona natural no propone razón social', async () => {
    const rows = rutRows({ taxpayer: 'Persona natural o sucesión ilíquida 2' });
    const data = extractRutData(read(await rutPdf('interleaved', rows)));
    expect(data.legalName).toBeUndefined();
    expect(data.details.find((d) => d.key === 'taxpayer_type')?.value).toBe('Persona natural');
  });

  it('no confunde el teléfono, la fecha ni el número de formulario con el NIT', async () => {
    const text = labelsFirst.replace(FAKE.nitBase.split('').join(' '), '');
    expect(extractRutData(text).nit).toBeUndefined();
  });

  it('un NIT con dígito de verificación errado no se propone', () => {
    const text = interleaved.replace(/(9 0 0 1 2 3 4 5 6\s+)8/, '$13');
    expect(extractRutData(text).nit).toBeUndefined();
  });
});

describe('lectura del certificado de Cámara de Comercio para el perfil', () => {
  let text: string;
  beforeAll(async () => {
    text = read(await chamberPdf());
  });

  it('extrae los datos que importan', () => {
    const data = extractChamberData(text);
    expect(data.nit).toBe(NIT);
    expect(data.legalName).toBe(FAKE.legalName);
    expect(data.location).toEqual({
      department: FAKE.department,
      city: FAKE.city,
      address: FAKE.address,
    });
    const detail = (key: string) => data.details.find((d) => d.key === key)?.value;
    // El principal, no el suplente.
    expect(detail('legal_representative')).toBe('MARIA FERNANDA PEREZ GOMEZ · C.C. 52.345.678');
    expect(detail('registered_at')).toBe('2015-03-12');
    expect(detail('registration_number')).toBe('S0012345');
    expect(detail('renewed')).toBe('2026');
  });

  it('"No reportó" y las etiquetas no son valores', () => {
    const data = extractChamberData(
      ['Razón social: No reportó', 'Domicilio principal: No reportó', 'Nit: 900123456-8'].join(
        '\n',
      ),
    );
    expect(data.legalName).toBeUndefined();
    expect(data.location).toBeUndefined();
    expect(data.nit).toBe(NIT);
  });

  it('dos razones sociales distintas no se proponen', () => {
    const data = extractChamberData(
      ['Razón social: FUNDACION UNO', 'Nombre: ASOCIACION DOS'].join('\n'),
    );
    expect(data.legalName).toBeUndefined();
  });
});

describe('prefillFromText', () => {
  it('arma la propuesta con perfil y datos informativos', async () => {
    const text = read(await chamberPdf());
    const prefill = prefillFromText('d1', DocumentType.ExistenceRepresentationCertificate, text);
    expect(prefill).toMatchObject({
      documentId: 'd1',
      readable: true,
      nit: NIT,
      legalName: FAKE.legalName,
      location: { city: FAKE.city },
    });
    expect(prefill.details?.length).toBeGreaterThan(0);
    expect(hasProfileData(prefill)).toBe(true);
  });

  it('un tipo sin lectura (cédula, otro) no propone nada', () => {
    const prefill = prefillFromText('d1', DocumentType.Other, 'NIT 900123456-8');
    expect(hasProfileData(prefill)).toBe(false);
  });
});

describe('isLabelLike', () => {
  it.each([
    'Primer apellido 32. Segundo apellido 33. Primer nombre',
    '35. Razón social',
    'Nombre comercial',
    'No reportó',
    'NIT',
  ])('"%s" es etiqueta', (v) => expect(isLabelLike(v)).toBe(true));

  it.each(['FUNDACION HUELLITAS DEL VALLE', 'ASOCIACION PROTECTORA DE ANIMALES DE PASTO'])(
    '"%s" es un valor',
    (v) => expect(isLabelLike(v)).toBe(false),
  );
});
