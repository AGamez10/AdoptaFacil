import * as ExcelJS from 'exceljs';
import {
  ACCOUNTING_DESTINATION_LABEL,
  ACCOUNTING_DISCLAIMER,
  ACCOUNTING_ENTRY_TYPE_LABEL,
  RECONCILIATION_STATUS_LABEL,
  accountingPeriodLabel,
  type AccountingEntry,
  type AccountingReconciliation,
  type AccountingTotals,
} from '@adoptafacil/contracts';
import { paymentTypeLabel } from '../reports/report-pdf';
import { sheetText } from '../reports/report-text';

/**
 * Exportes para el contador. Toda celda de texto pasa por `sheetText`
 * (nunca se evalúa como fórmula); los montos van como números para sumar.
 *
 * - BÁSICO (gratis): folio, fecha, tipo y valor + totales del mes.
 * - COMPLETO (plan `accountingFullExport`): además comisión, neto, forma de
 *   pago, destinación, id del pago en la pasarela, conciliación y la
 *   identificación del donante SOLO si autorizó ser identificado.
 */

export interface DonorIdentity {
  name: string;
  document: string;
}

export interface AccountingExportInput {
  organizationName: string;
  nit: string | null;
  period: string;
  status: 'open' | 'closed';
  closedAt: string | null;
  entriesHash: string | null;
  entries: AccountingEntry[];
  totals: AccountingTotals;
  reconciliation?: AccountingReconciliation;
  /** Por donación: identidad del donante si autorizó; si no, ausente. */
  donors?: Map<string, DonorIdentity>;
  generatedAt: Date;
}

const MONEY = '"$" #,##0';

function colombiaDate(iso: string): Date {
  return new Date(new Date(iso).getTime() - 5 * 3600_000);
}

function colombiaDateText(iso: string): string {
  return colombiaDate(iso).toISOString().slice(0, 16).replace('T', ' ');
}

/** Celda CSV segura: sin fórmulas (= + - @ tab CR al inicio) y con comillas. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  let text = sheetText(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",;\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function donorLabel(entry: AccountingEntry, donors: Map<string, DonorIdentity> | undefined) {
  if (!entry.donationId) return { name: '', document: '' };
  const d = donors?.get(entry.donationId);
  return d ?? { name: 'Donante (sin autorización para identificarlo)', document: '' };
}

/** Separador de las hojas de cálculo en español (Colombia): el Excel local
 *  parte las columnas por punto y coma, no por coma. */
const CSV_SEP = ';';

function csvLine(cells: unknown[]): string {
  return cells.map(csvCell).join(CSV_SEP);
}

/**
 * CSV del mes: una tabla limpia (una fila por movimiento, una columna por
 * dato) lista para abrir en Excel o importar al software contable, y debajo
 * los totales alineados a las mismas columnas. `full` agrega las columnas del
 * plan de pago. Fecha y hora van separadas; los reembolsos van en negativo.
 */
export function renderAccountingCsv(input: AccountingExportInput, full: boolean): Buffer {
  const header = ['Folio', 'Fecha', 'Hora (Colombia)', 'Tipo', 'Valor bruto (COP)'];
  if (full) {
    header.push(
      'Comisión pasarela (COP)',
      'Neto (COP)',
      'Forma de pago',
      'Medio de pago',
      'Destinación',
      'Detalle destinación',
      'Pago en pasarela',
      'Pasarela',
      'Mes del hecho',
      'Ajuste',
      'Donante',
      'Documento del donante',
    );
  }
  const width = header.length;
  /** Fila de totales: etiqueta en "Tipo" y valor en "Valor bruto"; el resto vacío. */
  const total = (label: string, value: unknown): string => {
    const cells: unknown[] = Array.from({ length: width }, () => '');
    cells[3] = label;
    cells[4] = value;
    return csvLine(cells);
  };
  const note = (label: string, value: unknown): string => {
    const cells: unknown[] = Array.from({ length: width }, () => '');
    cells[0] = label;
    cells[1] = value;
    return csvLine(cells);
  };

  const lines: string[] = [`sep=${CSV_SEP}`, csvLine(header)];
  for (const e of input.entries) {
    const at = colombiaDateText(e.occurredAt);
    const row: unknown[] = [
      e.seq,
      at.slice(0, 10),
      at.slice(11),
      ACCOUNTING_ENTRY_TYPE_LABEL[e.entryType],
      e.grossCop,
    ];
    if (full) {
      const donor = donorLabel(e, input.donors);
      row.push(
        e.feeCop ?? '',
        e.netCop ?? '',
        paymentTypeLabel(e.paymentType ?? ''),
        e.paymentMethod ?? '',
        ACCOUNTING_DESTINATION_LABEL[e.destination],
        e.destinationLabel ?? '',
        e.gatewayPaymentId ?? '',
        e.source,
        e.eventPeriod,
        e.isAdjustment ? 'Sí' : 'No',
        donor.name,
        donor.document,
      );
    }
    lines.push(csvLine(row));
  }
  lines.push(csvLine(Array.from({ length: width }, () => '')));
  lines.push(total('TOTAL donaciones (cantidad)', input.totals.donationCount));
  lines.push(total('TOTAL donaciones brutas', input.totals.donationsGrossCop));
  lines.push(total('TOTAL reembolsos', input.totals.refundsCop));
  lines.push(total('TOTAL contracargos', input.totals.chargebacksCop));
  lines.push(total('SALDO bruto neto de reversos', input.totals.balanceCop));
  if (full) {
    lines.push(total('Tarifa de Mercado Pago', input.totals.feesCop));
    lines.push(total('Neto informado por la pasarela', input.totals.netCop));
  }
  lines.push(csvLine(Array.from({ length: width }, () => '')));
  lines.push(note('Organización', input.organizationName));
  lines.push(note('NIT', input.nit ?? 'No registrado'));
  lines.push(note('Mes contable', accountingPeriodLabel(input.period)));
  lines.push(note('Estado del mes', input.status === 'closed' ? 'Cerrado' : 'Abierto'));
  if (input.entriesHash) lines.push(note('Huella SHA-256 del cierre', input.entriesHash));
  lines.push(note('Aviso', ACCOUNTING_DISCLAIMER));
  // BOM: Excel en español abre el UTF-8 con tildes correctas.
  return Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');
}

const NAVY = 'FF14294D';
const ZEBRA = 'FFF3F6FA';
const BORDER = { style: 'thin', color: { argb: 'FFD5DBE5' } } as const;
const MONEY_SIGNED = '"$" #,##0;[Red]-"$" #,##0';

function styleHeader(row: ExcelJS.Row): void {
  row.height = 24;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
}

/** Hoja de datos: encabezado fijo, filtros, filas alternadas y lista para imprimir. */
function finishTable(ws: ExcelJS.Worksheet, columnCount: number, lastRow: number): void {
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  if (lastRow > 1) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnCount } };
  }
  for (let r = 2; r <= lastRow; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= columnCount; c++) {
      const cell = row.getCell(c);
      cell.border = { bottom: BORDER };
      cell.alignment = { ...cell.alignment, vertical: 'middle', wrapText: true };
      if (r % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
      }
    }
  }
  ws.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
  };
  ws.headerFooter = { oddFooter: '&LAdoptaFácil · libro auxiliar&RPágina &P de &N' };
  ws.pageSetup.printTitlesRow = '1:1';
}

/** Excel del mes. `full` agrega columnas, conciliación y donantes autorizados. */
export async function renderAccountingXlsx(
  input: AccountingExportInput,
  full: boolean,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AdoptaFácil';
  wb.created = input.generatedAt;
  const t = input.totals;

  const summary = wb.addWorksheet('Resumen', {
    views: [{ showGridLines: false }],
    properties: { tabColor: { argb: NAVY } },
  });
  summary.columns = [{ width: 4 }, { width: 38 }, { width: 24 }, { width: 62 }];
  summary.mergeCells('B1:D1');
  const title = summary.getCell('B1');
  title.value = 'Libro auxiliar de donaciones';
  title.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  title.alignment = { vertical: 'middle', indent: 1 };
  summary.getRow(1).height = 34;
  summary.mergeCells('B2:D2');
  const subtitle = summary.getCell('B2');
  subtitle.value = `${sheetText(input.organizationName)} · ${accountingPeriodLabel(input.period)}`;
  subtitle.font = { size: 11, color: { argb: 'FF5B6B84' } };
  subtitle.alignment = { indent: 1 };

  let r = 4;
  const section = (label: string): void => {
    summary.mergeCells(`B${r}:D${r}`);
    const c = summary.getCell(`B${r}`);
    c.value = label;
    c.font = { bold: true, size: 11, color: { argb: NAVY } };
    c.border = { bottom: { style: 'medium', color: { argb: 'FF2BB5A0' } } };
    r++;
  };
  const line = (
    label: string,
    value: string | number,
    opts: { money?: boolean; bold?: boolean; note?: string } = {},
  ): void => {
    const row = summary.getRow(r);
    row.getCell(2).value = label;
    row.getCell(2).font = { bold: opts.bold ?? false };
    const v = row.getCell(3);
    v.value = value;
    v.alignment = { horizontal: 'right', vertical: 'middle' };
    v.font = { bold: opts.bold ?? false };
    if (opts.money) v.numFmt = MONEY_SIGNED;
    if (opts.note) {
      row.getCell(4).value = opts.note;
      row.getCell(4).font = { italic: true, color: { argb: 'FF5B6B84' } };
      row.getCell(4).alignment = { wrapText: true, vertical: 'middle' };
    }
    for (const col of [2, 3, 4]) row.getCell(col).border = { bottom: BORDER };
    r++;
  };

  section('Datos de la organización y del mes');
  line('Organización', sheetText(input.organizationName));
  line('NIT', sheetText(input.nit ?? '') || 'No registrado', {
    note: input.nit ? undefined : 'Regístralo en Documentos para que aparezca aquí.',
  });
  line('Mes contable', accountingPeriodLabel(input.period), { note: 'Hora de Colombia.' });
  line(
    'Estado del mes',
    input.status === 'closed'
      ? `Cerrado el ${input.closedAt ? colombiaDateText(input.closedAt) : ''}`
      : 'Abierto',
    {
      note:
        input.status === 'closed'
          ? undefined
          : 'Puede recibir más movimientos hasta que lo cierres.',
    },
  );
  line('Huella SHA-256 del cierre', input.entriesHash ?? 'Se genera al cerrar el mes', {
    note: input.entriesHash
      ? undefined
      : 'Sirve para comprobar que el libro no cambió después del cierre.',
  });
  r++;
  section('Totales del mes');
  line('Donaciones (cantidad)', t.donationCount);
  line('Donaciones brutas', t.donationsGrossCop, { money: true });
  line('Reembolsos', t.refundsCop, { money: true });
  line('Contracargos', t.chargebacksCop, { money: true });
  line('Saldo bruto neto de reversos', t.balanceCop, { money: true, bold: true });
  if (full) {
    line('Tarifa de Mercado Pago', t.feesCop, { money: true });
    line('Neto informado por la pasarela', t.netCop, { money: true, bold: true });
    line('Renglones sin comisión informada', t.entriesWithoutFee);
    line('Ajustes de meses cerrados', t.adjustmentCount);
  }
  r++;
  summary.mergeCells(`B${r}:D${r + 2}`);
  const aviso = summary.getCell(`B${r}`);
  aviso.value = `Aviso: ${ACCOUNTING_DISCLAIMER}`;
  aviso.font = { italic: true, size: 9, color: { argb: 'FF5B6B84' } };
  aviso.alignment = { wrapText: true, vertical: 'top' };
  summary.pageSetup = {
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    paperSize: 9,
  };

  const detail = wb.addWorksheet('Libro auxiliar');
  const columns: Array<Partial<ExcelJS.Column>> = [
    { header: 'Folio', key: 'seq', width: 8, style: { alignment: { horizontal: 'center' } } },
    {
      header: 'Fecha y hora (Colombia)',
      key: 'date',
      width: 20,
      style: { numFmt: 'yyyy-mm-dd hh:mm' },
    },
    { header: 'Tipo', key: 'type', width: 14 },
    { header: 'Valor bruto', key: 'gross', width: 16, style: { numFmt: MONEY_SIGNED } },
  ];
  if (full) {
    columns.push(
      { header: 'Comisión', key: 'fee', width: 14, style: { numFmt: MONEY_SIGNED } },
      { header: 'Neto', key: 'net', width: 16, style: { numFmt: MONEY_SIGNED } },
      { header: 'Forma de pago', key: 'paymentType', width: 20 },
      { header: 'Medio de pago', key: 'paymentMethod', width: 16 },
      { header: 'Destinación', key: 'destination', width: 24 },
      { header: 'Detalle destinación', key: 'destinationLabel', width: 36 },
      { header: 'Pago en pasarela', key: 'payment', width: 20 },
      {
        header: 'Mes del hecho',
        key: 'eventPeriod',
        width: 13,
        style: { alignment: { horizontal: 'center' } },
      },
      {
        header: 'Ajuste',
        key: 'adjustment',
        width: 9,
        style: { alignment: { horizontal: 'center' } },
      },
      { header: 'Donante', key: 'donor', width: 32 },
      { header: 'Documento', key: 'document', width: 18 },
    );
  }
  detail.columns = columns;
  styleHeader(detail.getRow(1));
  for (const e of input.entries) {
    const donor = donorLabel(e, input.donors);
    detail.addRow({
      seq: e.seq,
      date: colombiaDate(e.occurredAt),
      type: ACCOUNTING_ENTRY_TYPE_LABEL[e.entryType],
      gross: e.grossCop,
      ...(full
        ? {
            fee: e.feeCop,
            net: e.netCop,
            paymentType: paymentTypeLabel(e.paymentType ?? ''),
            paymentMethod: sheetText(e.paymentMethod ?? ''),
            destination: ACCOUNTING_DESTINATION_LABEL[e.destination],
            destinationLabel: sheetText(e.destinationLabel ?? ''),
            payment: sheetText(e.gatewayPaymentId ?? ''),
            eventPeriod: e.eventPeriod,
            adjustment: e.isAdjustment ? 'Sí' : 'No',
            donor: sheetText(donor.name),
            document: sheetText(donor.document),
          }
        : {}),
    });
  }
  finishTable(detail, columns.length, input.entries.length + 1);
  if (input.entries.length > 0) {
    const last = input.entries.length + 1;
    const totalRow = detail.addRow({ type: 'SALDO' });
    totalRow.getCell('gross').value = { formula: `SUM(D2:D${last})`, result: t.balanceCop };
    totalRow.getCell('gross').numFmt = MONEY_SIGNED;
    if (full) {
      totalRow.getCell('fee').value = { formula: `SUM(E2:E${last})`, result: t.feesCop };
      totalRow.getCell('net').value = { formula: `SUM(F2:F${last})`, result: t.netCop };
      totalRow.getCell('fee').numFmt = MONEY_SIGNED;
      totalRow.getCell('net').numFmt = MONEY_SIGNED;
    }
    totalRow.font = { bold: true };
    totalRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = { top: { style: 'medium', color: { argb: NAVY } } };
    });
  }

  if (full) {
    const byDest = wb.addWorksheet('Por destinación');
    byDest.columns = [
      { header: 'Destinación', key: 'd', width: 30 },
      { header: 'Valor neto de reversos', key: 'v', width: 20, style: { numFmt: MONEY } },
    ];
    styleHeader(byDest.getRow(1));
    for (const [d, v] of Object.entries(t.byDestination)) {
      byDest.addRow({
        d: ACCOUNTING_DESTINATION_LABEL[d as keyof typeof ACCOUNTING_DESTINATION_LABEL],
        v,
      });
    }

    const byType = wb.addWorksheet('Por forma de pago');
    byType.columns = [
      { header: 'Forma de pago', key: 'd', width: 30 },
      { header: 'Valor neto de reversos', key: 'v', width: 20, style: { numFmt: MONEY } },
    ];
    styleHeader(byType.getRow(1));
    for (const [d, v] of Object.entries(t.byPaymentType)) {
      byType.addRow({ d: paymentTypeLabel(d === 'sin_dato' ? '' : d), v });
    }

    if (input.reconciliation) {
      const rec = wb.addWorksheet('Conciliación');
      rec.columns = [
        { header: 'Resultado', key: 'status', width: 22 },
        { header: 'Referencia', key: 'reference', width: 36 },
        { header: 'Pago en pasarela', key: 'payment', width: 18 },
        { header: 'Estado AdoptaFácil', key: 'ps', width: 22 },
        { header: 'Estado Mercado Pago', key: 'gs', width: 22 },
        { header: 'Monto AdoptaFácil', key: 'pa', width: 16, style: { numFmt: MONEY } },
        { header: 'Monto Mercado Pago', key: 'ga', width: 16, style: { numFmt: MONEY } },
        { header: 'Qué hacer', key: 'hint', width: 70 },
      ];
      styleHeader(rec.getRow(1));
      for (const l of input.reconciliation.lines) {
        rec.addRow({
          status: RECONCILIATION_STATUS_LABEL[l.status],
          reference: sheetText(l.reference),
          payment: sheetText(l.gatewayPaymentId ?? ''),
          ps: sheetText(l.platformStatus ?? ''),
          gs: sheetText(l.gatewayStatus ?? ''),
          pa: l.platformAmountCop,
          ga: l.gatewayAmountCop,
          hint: sheetText(l.hint),
        });
      }
    }

    // Insumo para certificados y exógena: solo donantes que autorizaron (🧾 formato).
    const donorsSheet = wb.addWorksheet('Donantes autorizados');
    donorsSheet.columns = [
      { header: 'Donante', key: 'name', width: 34 },
      { header: 'Documento', key: 'document', width: 18 },
      { header: 'Donaciones', key: 'count', width: 12 },
      { header: 'Total neto de reversos', key: 'total', width: 20, style: { numFmt: MONEY } },
    ];
    styleHeader(donorsSheet.getRow(1));
    const grouped = new Map<
      string,
      { name: string; document: string; count: number; total: number }
    >();
    for (const e of input.entries) {
      const d = e.donationId ? input.donors?.get(e.donationId) : undefined;
      if (!d) continue;
      const key = `${d.document}|${d.name}`;
      const g = grouped.get(key) ?? { ...d, count: 0, total: 0 };
      if (e.entryType === 'donation') g.count++;
      g.total += e.grossCop;
      grouped.set(key, g);
    }
    for (const g of [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'))) {
      donorsSheet.addRow({
        name: sheetText(g.name),
        document: sheetText(g.document),
        count: g.count,
        total: g.total,
      });
    }
    donorsSheet.addRow({});
    donorsSheet.addRow({
      name: sheetText(
        'Solo aparecen los donantes que autorizaron a la organización a identificarlos. Los demás figuran como "Donante" en el libro.',
      ),
    });
  }

  const bytes = await wb.xlsx.writeBuffer();
  return Buffer.from(bytes as ArrayBuffer);
}
