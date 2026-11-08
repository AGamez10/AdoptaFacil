import type * as ExcelJS from 'exceljs';
import { sheetText } from '../reports/report-text';
import { BORDER, NAVY, PAPER, TEAL, setupPrint } from '../reports/xlsx-style';
import type { Bar, PanelMetrics } from './data-export-panel';

/**
 * Hoja "Panel" de la exportación de datos: el tablero que se ve primero. Tarjetas
 * con las cifras clave y tablas con barras dentro de la celda (formato
 * condicional), así que se ve igual en Excel, en LibreOffice y al imprimir, y los
 * números siguen siendo números reales que se pueden filtrar y sumar.
 */

const MONEY = '"$" #,##0';
const HOURS = '0.##';
const MUTED = 'FF5B6472';

/** Columnas B..M son la rejilla del tablero (la A es un margen). */
const FIRST_COL = 2;
const LAST_COL = 13;

const CARD_TONES = ['FF0D7468', 'FF14294D', 'FF9A5B00', 'FF8B2F4B'] as const;

function fill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function merged(
  ws: ExcelJS.Worksheet,
  row: number,
  from: number,
  to: number,
  value: ExcelJS.CellValue,
): ExcelJS.Cell {
  if (to > from) ws.mergeCells(row, from, row, to);
  const cell = ws.getCell(row, from);
  cell.value = value;
  return cell;
}

function card(
  ws: ExcelJS.Worksheet,
  row: number,
  from: number,
  span: number,
  tone: string,
  content: { label: string; value: number | string; numFmt?: string; note: string },
): void {
  const to = from + span - 1;
  const label = merged(ws, row, from, to, content.label.toUpperCase());
  label.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
  label.fill = fill(tone);
  label.alignment = { vertical: 'middle', indent: 1 };

  const value = merged(ws, row + 1, from, to, content.value);
  value.font = { bold: true, size: 22, color: { argb: NAVY } };
  value.fill = fill(PAPER);
  value.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  if (content.numFmt) value.numFmt = content.numFmt;

  const note = merged(ws, row + 2, from, to, content.note);
  note.font = { size: 9, color: { argb: MUTED } };
  note.fill = fill(PAPER);
  note.alignment = { vertical: 'top', wrapText: true, indent: 1 };

  for (const r of [row, row + 1, row + 2]) {
    for (let c = from; c <= to; c += 1) ws.getCell(r, c).border = BORDER;
  }
}

function sectionTitle(ws: ExcelJS.Worksheet, row: number, text: string): number {
  const cell = merged(ws, row, FIRST_COL, LAST_COL, text);
  cell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  cell.fill = fill(TEAL);
  cell.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(row).height = 22;
  return row + 1;
}

function note(ws: ExcelJS.Worksheet, row: number, text: string): number {
  const cell = merged(ws, row, FIRST_COL, LAST_COL, text);
  cell.font = { italic: true, size: 9, color: { argb: MUTED } };
  cell.alignment = { vertical: 'top', wrapText: true, indent: 1 };
  ws.getRow(row).height = Math.max(15, Math.ceil(text.length / 150) * 13);
  return row + 1;
}

/** Barras dentro de la celda: el largo es proporcional al valor máximo de la tabla. */
function bars(ws: ExcelJS.Worksheet, ref: string, argb: string, fixedMax?: number): void {
  ws.addConditionalFormatting({
    ref,
    rules: [
      {
        type: 'dataBar',
        priority: 1,
        gradient: false,
        minLength: 0,
        maxLength: 100,
        border: false,
        cfvo: [
          { type: 'num', value: 0 },
          fixedMax ? { type: 'num', value: fixedMax } : { type: 'max' },
        ],
        color: { argb },
      } as ExcelJS.DataBarRuleType,
    ],
  });
}

/** Tabla de barras: etiqueta (columnas `from..from+labelSpan-1`) y valor con barra. */
function barTable(
  ws: ExcelJS.Worksheet,
  row: number,
  from: number,
  labelSpan: number,
  valueSpan: number,
  title: string,
  data: Bar[],
  opts: { numFmt?: string; argb: string; empty: string },
): void {
  const valueFrom = from + labelSpan;
  const valueTo = valueFrom + valueSpan - 1;
  const head = merged(ws, row, from, valueTo, title);
  head.font = { bold: true, color: { argb: NAVY } };
  head.fill = fill(PAPER);
  head.alignment = { vertical: 'middle', indent: 1 };
  for (let c = from; c <= valueTo; c += 1) ws.getCell(row, c).border = BORDER;
  if (data.length === 0) {
    const empty = merged(ws, row + 1, from, valueTo, opts.empty);
    empty.font = { italic: true, size: 9, color: { argb: MUTED } };
    empty.alignment = { indent: 1 };
    return;
  }
  data.forEach((item, i) => {
    const r = row + 1 + i;
    const label = merged(ws, r, from, from + labelSpan - 1, sheetText(item.label));
    label.alignment = { vertical: 'middle', indent: 1, wrapText: true };
    const value = merged(ws, r, valueFrom, valueTo, item.value);
    value.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    if (opts.numFmt) value.numFmt = opts.numFmt;
    for (let c = from; c <= valueTo; c += 1) ws.getCell(r, c).border = BORDER;
  });
  const topLeft = ws.getCell(row + 1, valueFrom).address;
  const bottomRight = ws.getCell(row + data.length, valueFrom).address;
  bars(ws, `${topLeft}:${bottomRight}`, opts.argb);
}

export interface PanelSheetInput {
  organizationName: string;
  generatedAt: Date;
  /** Hora de Colombia ya convertida (Excel no maneja zonas horarias). */
  generatedAtLocal: Date;
  metrics: PanelMetrics;
  /** Hojas del libro con su descripción, para el índice con enlaces. */
  sheets: Array<{ name: string; description: string }>;
  /** Hojas que llegaron al tope de filas, para avisarlo (nunca se corta en silencio). */
  cappedSheets: string[];
}

export function buildPanelSheet(ws: ExcelJS.Worksheet, input: PanelSheetInput): void {
  ws.properties.tabColor = { argb: NAVY };
  ws.views = [{ showGridLines: false }];
  ws.getColumn(1).width = 2;
  for (let c = FIRST_COL; c <= LAST_COL; c += 1) ws.getColumn(c).width = 14;
  const m = input.metrics;

  const banner = merged(ws, 2, FIRST_COL, LAST_COL, sheetText(input.organizationName));
  banner.font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
  banner.fill = fill(NAVY);
  banner.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(2).height = 40;
  const sub = merged(ws, 3, FIRST_COL, LAST_COL, input.generatedAtLocal);
  sub.numFmt = '"Tablero de tus datos · generado el "yyyy-mm-dd hh:mm" (hora de Colombia)"';
  sub.font = { bold: true, size: 11, color: { argb: TEAL } };
  sub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(3).height = 24;

  // Tarjetas: dos filas de cuatro.
  const cards: Array<Parameters<typeof card>[5]> = [
    {
      label: 'Animales',
      value: m.animals.total,
      note: `${m.animals.active} activos · ${m.animals.adopted} adoptados`,
    },
    {
      label: 'Solicitudes de adopción',
      value: m.adoptions.total,
      note:
        m.adoptions.approvalRate === null
          ? `${m.adoptions.contractsSigned} contratos firmados · sin solicitudes resueltas aún`
          : `${m.adoptions.approvalRate}% de las resueltas aprobadas · ${m.adoptions.contractsSigned} contratos firmados`,
    },
    {
      label: 'Donaciones netas (COP)',
      value: m.donations.netCop,
      numFmt: MONEY,
      note: `${m.donations.paidCount} aprobadas · ${m.donations.reversedCount} reversadas`,
    },
    {
      label: 'Campañas',
      value: m.campaigns.total,
      note:
        m.campaigns.progressPct === null
          ? `${m.campaigns.active} activas`
          : `${m.campaigns.active} activas · ${m.campaigns.progressPct}% de la meta total`,
    },
    {
      label: 'Horas de voluntariado',
      value: m.volunteering.hours,
      numFmt: HOURS,
      note: `${m.volunteering.volunteers} voluntarios aceptados · ${m.volunteering.opportunities} oportunidades`,
    },
    {
      label: 'Productos en la tienda',
      value: m.store.products,
      note: `${m.store.active} activos · ${m.store.outOfStock} agotados`,
    },
    {
      label: 'Donado (COP, antes de tarifas)',
      value: m.donations.grossCop,
      numFmt: MONEY,
      note: `Tarifas de Mercado Pago e IVA: ${new Intl.NumberFormat('es-CO').format(m.donations.feesCop)}`,
    },
    {
      label: 'Donaciones por confirmar',
      value: m.donations.pendingCount,
      note: 'Pagos que la pasarela aún no aprueba',
    },
  ];
  cards.forEach((content, i) => {
    const rowBlock = i < 4 ? 5 : 9;
    const col = FIRST_COL + (i % 4) * 3;
    card(ws, rowBlock, col, 3, CARD_TONES[i % 4], content);
    ws.getRow(rowBlock + 1).height = 36;
  });

  // Distribuciones lado a lado.
  let row = 13;
  row = sectionTitle(ws, row, 'Cómo está tu organización');
  const tablesTop = row;
  barTable(ws, tablesTop, 2, 2, 1, 'Animales por estado', m.animals.byStatus, {
    argb: 'FF9AD6CB',
    empty: 'Sin animales registrados',
  });
  barTable(ws, tablesTop, 5, 2, 1, 'Animales por especie', m.animals.bySpecies, {
    argb: 'FFA9BCDD',
    empty: 'Sin animales registrados',
  });
  barTable(ws, tablesTop, 8, 2, 1, 'Adopciones por estado', m.adoptions.byStatus, {
    argb: 'FFF0CC8A',
    empty: 'Sin solicitudes',
  });
  barTable(ws, tablesTop, 11, 2, 1, 'Tienda por categoría', m.store.byCategory, {
    argb: 'FFE3A6B8',
    empty: 'Sin productos',
  });
  row =
    tablesTop +
    1 +
    Math.max(
      m.animals.byStatus.length,
      m.animals.bySpecies.length,
      m.adoptions.byStatus.length,
      m.store.byCategory.length,
      1,
    ) +
    1;

  // Donaciones por mes.
  row = sectionTitle(ws, row, 'Donaciones netas por mes (COP, hora de Colombia)');
  barTable(ws, row, FIRST_COL, 2, 10, 'Mes', m.donations.netByMonth, {
    numFmt: MONEY,
    argb: 'FF9AD6CB',
    empty: 'Aún no hay donaciones aprobadas',
  });
  row += 1 + Math.max(m.donations.netByMonth.length, 1) + 1;

  // Campañas: meta, recaudado y avance.
  row = sectionTitle(ws, row, 'Campañas: meta, recaudado y avance');
  const campHead = ['Campaña', 'Meta (COP)', 'Recaudado (COP)', 'Avance'] as const;
  const spans: Array<[number, number]> = [
    [2, 5],
    [6, 7],
    [8, 9],
    [10, 13],
  ];
  campHead.forEach((text, i) => {
    const cell = merged(ws, row, spans[i][0], spans[i][1], text);
    cell.font = { bold: true, color: { argb: NAVY } };
    cell.fill = fill(PAPER);
    cell.alignment = { vertical: 'middle', indent: 1 };
    for (let c = spans[i][0]; c <= spans[i][1]; c += 1) ws.getCell(row, c).border = BORDER;
  });
  if (m.campaigns.rows.length === 0) {
    note(ws, row + 1, 'Aún no hay campañas.');
    row += 2;
  } else {
    m.campaigns.rows.forEach((c, i) => {
      const r = row + 1 + i;
      merged(ws, r, 2, 5, sheetText(c.label)).alignment = { indent: 1, wrapText: true };
      const goal = merged(ws, r, 6, 7, c.goal);
      goal.numFmt = MONEY;
      const raised = merged(ws, r, 8, 9, c.raised);
      raised.numFmt = MONEY;
      const pct = merged(ws, r, 10, 13, c.pct);
      pct.numFmt = '0.#"%"';
      pct.alignment = { horizontal: 'left', indent: 1 };
      for (const [from, to] of spans) {
        for (let col = from; col <= to; col += 1) ws.getCell(r, col).border = BORDER;
      }
    });
    bars(
      ws,
      `${ws.getCell(row + 1, 10).address}:${ws.getCell(row + m.campaigns.rows.length, 10).address}`,
      'FFA9BCDD',
      100,
    );
    row += 1 + m.campaigns.rows.length + 1;
  }

  // Voluntariado.
  row = sectionTitle(ws, row, 'Voluntariado: horas aprobadas por oportunidad');
  barTable(ws, row, FIRST_COL, 4, 8, 'Oportunidad', m.volunteering.hoursByOpportunity, {
    numFmt: HOURS,
    argb: 'FFF0CC8A',
    empty: 'Aún no hay oportunidades de voluntariado',
  });
  row += 1 + Math.max(m.volunteering.hoursByOpportunity.length, 1) + 1;

  // Índice con enlaces a cada hoja.
  row = sectionTitle(ws, row, 'Hojas de este libro');
  for (const sheet of input.sheets) {
    const link = merged(ws, row, 2, 4, {
      text: sheet.name,
      hyperlink: `#'${sheet.name}'!A1`,
    });
    link.font = { underline: true, bold: true, color: { argb: TEAL } };
    link.alignment = { indent: 1 };
    const desc = merged(ws, row, 5, 13, sheet.description);
    desc.alignment = { indent: 1, wrapText: true };
    for (let c = 2; c <= 13; c += 1) ws.getCell(row, c).border = BORDER;
    row += 1;
  }
  row += 1;

  if (input.cappedSheets.length > 0) {
    row = note(
      ws,
      row,
      `Estas hojas llegaron al tope de filas y no incluyen todo: ${input.cappedSheets.join(', ')}. Pide el resto a soporte.`,
    );
  }
  note(
    ws,
    row,
    'Este archivo no incluye nombres, correos, teléfonos, documentos ni direcciones de adoptantes, donantes o voluntarios: esos datos se consultan en el panel. Las visitas al portal y los clics a WhatsApp todavía no se miden, por eso no aparecen aquí.',
  );

  setupPrint(ws, {
    org: input.organizationName,
    title: 'Panel',
    code: 'Exportación de datos',
    verifyUrl: 'AdoptaFácil',
  });
  ws.pageSetup.orientation = 'portrait';
  ws.pageSetup.fitToHeight = 0;
}
