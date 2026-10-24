import * as ExcelJS from 'exceljs';
import { renderDataExportXlsx, type DataExportInput } from './data-export-xlsx';

const at = new Date('2026-10-20T15:00:00Z');

const input: DataExportInput = {
  organizationName: 'Refugio Patitas',
  generatedAt: at,
  animals: [
    {
      id: 'a1',
      name: '=HYPERLINK("http://evil","Toby")',
      species: 'dog',
      sex: 'male',
      size: 'medium',
      status: 'available',
      breed: 'Criollo',
      birthDate: new Date('2024-01-01T00:00:00Z'),
      approximateAgeMonths: null,
      tags: ['juguetón', 'tranquilo'],
      isActive: true,
      createdAt: at,
    },
  ],
  adoptions: [
    {
      id: 'r1',
      animalName: 'Toby',
      status: 'approved',
      createdAt: at,
      updatedAt: at,
      contractStatus: 'signed',
      contractSignedAt: at,
    },
  ],
  donations: [
    {
      id: 'd1',
      approvedAt: at,
      status: 'approved',
      conceptKind: 'campaign',
      conceptName: 'Cirugía de Luna',
      amountCharged: 52_000,
      net: 50_000,
      platformFee: 2_000,
      platformIva: 380,
      gatewayFee: 1_000,
      gatewayIva: 190,
    },
  ],
  campaigns: [],
  opportunities: [
    {
      id: 'o1',
      title: 'Paseos',
      category: 'paseos',
      startDate: at,
      endDate: at,
      capacity: 10,
      status: 'active',
      acceptedVolunteers: 3,
      approvedHours: 12.5,
    },
  ],
};

async function read(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb;
}

describe('data-export-xlsx (exportación de datos de la organización)', () => {
  it('arma una hoja por tipo de dato, en español', async () => {
    const wb = await read(await renderDataExportXlsx(input));
    expect(wb.worksheets.map((s) => s.name)).toEqual([
      'Resumen',
      'Animales',
      'Adopciones',
      'Donaciones',
      'Campañas',
      'Voluntariado',
    ]);
    const animals = wb.getWorksheet('Animales')!;
    expect(animals.getRow(2).getCell(3).value).toBe('Perro');
    expect(animals.getRow(2).getCell(6).value).toBe('Disponible');
    expect(wb.getWorksheet('Adopciones')!.getRow(2).getCell(6).value).toBe('Firmado');
  });

  it('neutraliza fórmulas en el texto que escribió un usuario', async () => {
    const wb = await read(await renderDataExportXlsx(input));
    const cell = wb.getWorksheet('Animales')!.getRow(2).getCell(2).value;
    expect(cell).toBe('\'=HYPERLINK("http://evil","Toby")');
  });

  it('los montos y las horas van como números para poder sumarlos', async () => {
    const wb = await read(await renderDataExportXlsx(input));
    const donation = wb.getWorksheet('Donaciones')!.getRow(2);
    expect(donation.getCell(6).value).toBe(52_000);
    expect(donation.getCell(7).value).toBe(50_000);
    expect(wb.getWorksheet('Voluntariado')!.getRow(2).getCell(9).value).toBe(12.5);
  });

  it('las columnas no incluyen datos de contacto de adoptantes, donantes ni voluntarios', async () => {
    const wb = await read(await renderDataExportXlsx(input));
    const headers = wb.worksheets
      .filter((s) => s.name !== 'Resumen')
      .flatMap((s) => (s.getRow(1).values as unknown[]).filter(Boolean).map(String));
    for (const forbidden of [
      /correo/i,
      /tel[eé]fono/i,
      /documento/i,
      /direcci[oó]n/i,
      /adoptante/i,
      /donante$/i,
    ]) {
      expect(headers.filter((h) => forbidden.test(h))).toEqual([]);
    }
  });
});
