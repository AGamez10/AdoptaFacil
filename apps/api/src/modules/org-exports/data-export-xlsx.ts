import * as ExcelJS from 'exceljs';
import { sheetText } from '../reports/report-text';
import {
  ADOPTION_STATUS_LABEL,
  ANIMAL_STATUS_LABEL,
  CAMPAIGN_CATEGORY_LABEL,
  CAMPAIGN_STATUS_LABEL,
  CONTRACT_STATUS_LABEL,
  DONATION_CONCEPT_LABEL,
  DONATION_STATUS_LABEL,
  OPPORTUNITY_STATUS_LABEL,
  SEX_LABEL,
  SIZE_LABEL,
  SPECIES_LABEL,
  labelOf,
} from './export-labels';

/**
 * Exportación de los datos de la organización a Excel (plan Crece y Pro).
 *
 * Minimización (Ley 1581, finalidad y circulación restringida): el archivo
 * lleva los datos PROPIOS de la organización (animales, campañas, cifras) y
 * NUNCA datos personales de terceros: ni nombre, correo, teléfono, documento ni
 * dirección de adoptantes, donantes o voluntarios. Un archivo de Excel sale del
 * control de la plataforma (se reenvía, se queda en un portátil), así que lo que
 * no viaja no se puede filtrar. Quien necesite el contacto de un adoptante lo ve
 * en el panel, con su control de acceso y su auditoría.
 *
 * Toda celda de texto pasa por `sheetText` (nunca se evalúa como fórmula); los
 * montos van como números para que se puedan sumar y filtrar.
 */

/** Filas por hoja: protege la memoria del servidor. Si una hoja llega al tope,
 *  el resumen lo dice (nunca se corta en silencio). */
export const EXPORT_MAX_ROWS_PER_SHEET = 20_000;

export interface ExportAnimalRow {
  id: string;
  name: string;
  species: string;
  sex: string;
  size: string;
  status: string;
  breed: string | null;
  birthDate: Date | null;
  approximateAgeMonths: number | null;
  tags: string[];
  isActive: boolean;
  createdAt: Date;
}

export interface ExportAdoptionRow {
  id: string;
  animalName: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  contractStatus: string | null;
  contractSignedAt: Date | null;
}

export interface ExportDonationRow {
  id: string;
  approvedAt: Date;
  status: string;
  conceptKind: string;
  conceptName: string | null;
  amountCharged: number;
  net: number;
  platformFee: number;
  platformIva: number;
  gatewayFee: number;
  gatewayIva: number;
}

export interface ExportCampaignRow {
  id: string;
  title: string;
  category: string;
  goalAmount: number;
  raisedAmount: number;
  deadline: Date;
  status: string;
  createdAt: Date;
}

export interface ExportOpportunityRow {
  id: string;
  title: string;
  category: string;
  startDate: Date;
  endDate: Date;
  capacity: number | null;
  status: string;
  acceptedVolunteers: number;
  approvedHours: number;
}

export interface DataExportInput {
  organizationName: string;
  generatedAt: Date;
  animals: ExportAnimalRow[];
  adoptions: ExportAdoptionRow[];
  donations: ExportDonationRow[];
  campaigns: ExportCampaignRow[];
  opportunities: ExportOpportunityRow[];
}

const MONEY = '"$" #,##0';
const DATE = 'yyyy-mm-dd';
const DATE_TIME = 'yyyy-mm-dd hh:mm';

/** Excel no maneja zonas horarias: se escribe la hora de Colombia (UTC-5). */
function colombia(date: Date | null): Date | null {
  return date ? new Date(date.getTime() - 5 * 3600_000) : null;
}

function header(sheet: ExcelJS.Worksheet, columns: Array<[string, number, string?]>): void {
  sheet.columns = columns.map(([headerText, width, numFmt]) => ({
    header: headerText,
    width,
    style: numFmt ? { numFmt } : {},
  }));
  const row = sheet.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14294D' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
}

const yesNo = (value: boolean) => (value ? 'Sí' : 'No');

export async function renderDataExportXlsx(input: DataExportInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AdoptaFácil';
  wb.created = input.generatedAt;

  const summary = wb.addWorksheet('Resumen');
  summary.columns = [{ width: 34 }, { width: 80 }];
  summary.addRow(['Exportación de datos']).font = { bold: true, size: 14 };
  summary.addRow([]);
  summary.addRow(['Organización', sheetText(input.organizationName)]);
  const generated = summary.addRow(['Generado (hora de Colombia)', colombia(input.generatedAt)]);
  generated.getCell(2).numFmt = DATE_TIME;
  summary.addRow([]);
  const sections: Array<[string, number]> = [
    ['Animales', input.animals.length],
    ['Solicitudes de adopción', input.adoptions.length],
    ['Donaciones', input.donations.length],
    ['Campañas', input.campaigns.length],
    ['Oportunidades de voluntariado', input.opportunities.length],
  ];
  for (const [label, count] of sections) {
    const capped = count >= EXPORT_MAX_ROWS_PER_SHEET;
    summary.addRow([label, capped ? `${count} (tope por hoja: pide el resto a soporte)` : count]);
  }
  summary.addRow([]);
  summary.addRow([
    'Datos personales',
    'Este archivo no incluye nombres, correos, teléfonos, documentos ni direcciones de adoptantes, donantes o voluntarios. Esos datos se consultan en el panel.',
  ]).alignment = { wrapText: true, vertical: 'top' };

  const animals = wb.addWorksheet('Animales');
  header(animals, [
    ['ID', 38],
    ['Nombre', 24],
    ['Especie', 10],
    ['Sexo', 12],
    ['Tamaño', 10],
    ['Estado', 14],
    ['Raza', 20],
    ['Fecha de nacimiento', 16, DATE],
    ['Edad aproximada (meses)', 14],
    ['Etiquetas', 30],
    ['Activo', 8],
    ['Registrado', 18, DATE_TIME],
  ]);
  for (const a of input.animals) {
    animals.addRow([
      a.id,
      sheetText(a.name),
      labelOf(SPECIES_LABEL, a.species),
      labelOf(SEX_LABEL, a.sex),
      labelOf(SIZE_LABEL, a.size),
      labelOf(ANIMAL_STATUS_LABEL, a.status),
      sheetText(a.breed ?? ''),
      a.birthDate,
      a.approximateAgeMonths,
      sheetText(a.tags.join(', ')),
      yesNo(a.isActive),
      colombia(a.createdAt),
    ]);
  }

  const adoptions = wb.addWorksheet('Adopciones');
  header(adoptions, [
    ['ID de la solicitud', 38],
    ['Animal', 24],
    ['Estado', 16],
    ['Recibida', 18, DATE_TIME],
    ['Última actualización', 18, DATE_TIME],
    ['Contrato', 16],
    ['Contrato firmado', 18, DATE_TIME],
  ]);
  for (const r of input.adoptions) {
    adoptions.addRow([
      r.id,
      sheetText(r.animalName),
      labelOf(ADOPTION_STATUS_LABEL, r.status),
      colombia(r.createdAt),
      colombia(r.updatedAt),
      r.contractStatus ? labelOf(CONTRACT_STATUS_LABEL, r.contractStatus) : 'Sin contrato',
      colombia(r.contractSignedAt),
    ]);
  }

  const donations = wb.addWorksheet('Donaciones');
  header(donations, [
    ['ID', 38],
    ['Fecha', 18, DATE_TIME],
    ['Estado', 12],
    ['Destino', 16],
    ['Animal o campaña', 26],
    ['Monto cobrado', 16, MONEY],
    ['Neto para la organización', 18, MONEY],
    ['Comisión AdoptaFácil', 16, MONEY],
    ['IVA de la comisión', 14, MONEY],
    ['Costo de la pasarela', 16, MONEY],
    ['IVA de la pasarela', 14, MONEY],
  ]);
  for (const d of input.donations) {
    donations.addRow([
      d.id,
      colombia(d.approvedAt),
      labelOf(DONATION_STATUS_LABEL, d.status),
      labelOf(DONATION_CONCEPT_LABEL, d.conceptKind),
      sheetText(d.conceptName ?? ''),
      d.amountCharged,
      d.net,
      d.platformFee,
      d.platformIva,
      d.gatewayFee,
      d.gatewayIva,
    ]);
  }

  const campaigns = wb.addWorksheet('Campañas');
  header(campaigns, [
    ['ID', 38],
    ['Título', 32],
    ['Categoría', 16],
    ['Meta', 14, MONEY],
    ['Recaudado', 14, MONEY],
    ['Fecha límite', 14, DATE],
    ['Estado', 12],
    ['Creada', 18, DATE_TIME],
  ]);
  for (const c of input.campaigns) {
    campaigns.addRow([
      c.id,
      sheetText(c.title),
      labelOf(CAMPAIGN_CATEGORY_LABEL, c.category),
      c.goalAmount,
      c.raisedAmount,
      colombia(c.deadline),
      labelOf(CAMPAIGN_STATUS_LABEL, c.status),
      colombia(c.createdAt),
    ]);
  }

  const volunteering = wb.addWorksheet('Voluntariado');
  header(volunteering, [
    ['ID', 38],
    ['Oportunidad', 32],
    ['Categoría', 16],
    ['Inicio', 14, DATE],
    ['Fin', 14, DATE],
    ['Cupo', 8],
    ['Estado', 12],
    ['Voluntarios aceptados', 14],
    ['Horas aprobadas', 12, '0.##'],
  ]);
  for (const o of input.opportunities) {
    volunteering.addRow([
      o.id,
      sheetText(o.title),
      sheetText(o.category),
      colombia(o.startDate),
      colombia(o.endDate),
      o.capacity,
      labelOf(OPPORTUNITY_STATUS_LABEL, o.status),
      o.acceptedVolunteers,
      o.approvedHours,
    ]);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
