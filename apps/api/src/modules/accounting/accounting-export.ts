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
import {
  buildOrigins,
  categoryName,
  type ManualMovement,
  type SponsorshipIncome,
} from './accounting-origins';
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
  /** Movimientos registrados a mano por la organización en el mes (paquete completo). */
  manual?: ManualMovement[];
  /** Cobros de apadrinamiento pagados en el mes (paquete completo). */
  sponsorships?: SponsorshipIncome[];
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

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  visa: 'Visa',
  master: 'Mastercard',
  mastercard: 'Mastercard',
  amex: 'American Express',
  diners: 'Diners Club',
  codensa: 'Crédito Fácil Codensa',
  pse: 'PSE (débito bancario)',
  nequi: 'Nequi',
  bancolombia: 'Bancolombia',
  efecty: 'Efecty',
  baloto: 'Baloto',
  account_money: 'Dinero en cuenta de Mercado Pago',
};

function paymentMethodLabel(value: string | null): string {
  const key = (value ?? '').trim().toLowerCase();
  if (!key) return 'Sin dato';
  return PAYMENT_METHOD_LABEL[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

const SOURCE_LABEL: Record<string, string> = {
  mercadopago: 'Mercado Pago',
  other: 'Otra pasarela',
};

/** Quién donó. Sin autorización, nunca se identifica; nada queda vacío. */
function donorLabel(entry: AccountingEntry, donors: Map<string, DonorIdentity> | undefined) {
  if (!entry.donationId) return { name: 'No aplica', document: 'No aplica' };
  const d = donors?.get(entry.donationId);
  if (!d) {
    return {
      name: 'Donante sin autorización para identificarlo',
      document: 'No autorizado',
    };
  }
  return {
    name: d.name.trim() || 'Sin nombre registrado',
    document: d.document.trim() || 'No registrado',
  };
}

/**
 * Datos del plan de pago de un renglón, SIN celdas vacías: todo dato que la
 * pasarela no informó se escribe como tal ("Sin dato", "No aplica") y el neto
 * sin dato se calcula (bruto − comisión) y queda marcado.
 */
function fullFields(entry: AccountingEntry, donors: Map<string, DonorIdentity> | undefined) {
  const isReversal = entry.entryType !== 'donation';
  const fee = entry.feeCop ?? 0;
  const feeKnown = entry.feeCop !== null;
  const donor = donorLabel(entry, donors);
  return {
    fee,
    net: entry.netCop ?? entry.grossCop - fee,
    feeNote: feeKnown
      ? 'Informada por Mercado Pago'
      : isReversal
        ? 'No aplica: es un reverso'
        : 'Mercado Pago no la informó: se toma $0',
    paymentType: paymentTypeLabel(entry.paymentType ?? ''),
    paymentMethod: paymentMethodLabel(entry.paymentMethod),
    destination: ACCOUNTING_DESTINATION_LABEL[entry.destination],
    destinationDetail:
      entry.destinationLabel?.trim() ||
      (entry.destination === 'general' ? 'Donación libre, sin destino' : 'Sin detalle'),
    gatewayPaymentId: entry.gatewayPaymentId?.trim() || 'Sin dato',
    source: SOURCE_LABEL[entry.source] ?? 'Otra pasarela',
    adjustment: entry.isAdjustment ? `Sí, del mes ${entry.eventPeriod}` : 'No',
    donor: donor.name,
    document: donor.document,
  };
}

/** Separador de las hojas de cálculo en español (Colombia): el Excel local
 *  parte las columnas por punto y coma, no por coma. */
const CSV_SEP = ';';

function csvLine(cells: unknown[]): string {
  return cells.map(csvCell).join(CSV_SEP);
}

/**
 * CSV del mes: una tabla pura (una fila por movimiento, una columna por dato,
 * sin renglones de resumen) lista para abrir en Excel o importar al software
 * contable. Los totales, el NIT y el estado del mes van en el Excel. `full`
 * agrega las columnas del plan de pago, sin una sola celda vacía. Fecha y hora
 * van separadas; los reembolsos van en negativo.
 */
export function renderAccountingCsv(input: AccountingExportInput, full: boolean): Buffer {
  const header = ['Folio', 'Fecha', 'Hora (Colombia)', 'Tipo', 'Valor bruto (COP)'];
  if (full) {
    header.push(
      'Comisión de la pasarela (COP)',
      'Dato de la comisión',
      'Neto recibido (COP)',
      'Forma de pago',
      'Medio de pago',
      'Destinación',
      'Detalle de la destinación',
      'Pago en la pasarela',
      'Pasarela',
      'Mes del hecho',
      'Ajuste de mes cerrado',
      'Donante',
      'Documento del donante',
    );
  }
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
      const f = fullFields(e, input.donors);
      row.push(
        f.fee,
        f.feeNote,
        f.net,
        f.paymentType,
        f.paymentMethod,
        f.destination,
        f.destinationDetail,
        f.gatewayPaymentId,
        f.source,
        e.eventPeriod,
        f.adjustment,
        f.donor,
        f.document,
      );
    }
    lines.push(csvLine(row));
  }
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

/**
 * Hojas que cruzan TODO lo que entró en el mes, venga de donde venga:
 * - "Ingresos por origen": donaciones libres, a campañas y a animales (cobradas
 *   en línea), apadrinamientos pagados, y lo que la organización registró a mano
 *   (ventas del marketplace, eventos, donaciones en especie…), más los gastos.
 * - "Otros movimientos": cada movimiento registrado a mano, con su soporte.
 * Sin celdas vacías: lo que no aplica se escribe como tal.
 */
function addOriginSheets(wb: ExcelJS.Workbook, input: AccountingExportInput): void {
  const manual = input.manual ?? [];
  const sponsorships = input.sponsorships ?? [];
  const origins = buildOrigins(input.entries, manual, sponsorships);
  const channelText = {
    online: 'Cobrado en línea (Mercado Pago)',
    sponsorship: 'Cobros de apadrinamiento pagados en AdoptaFácil',
    manual: 'Registrado por la organización en el Libro público',
  } as const;

  const origin = wb.addWorksheet('Ingresos por origen');
  origin.columns = [
    { header: 'Origen del ingreso', key: 'origin', width: 40 },
    { header: 'Detalle', key: 'detail', width: 44 },
    { header: 'Cantidad', key: 'count', width: 12, style: { alignment: { horizontal: 'center' } } },
    { header: 'Valor (COP)', key: 'amount', width: 18, style: { numFmt: MONEY_SIGNED } },
    { header: 'De dónde sale el dato', key: 'source', width: 52 },
  ];
  styleHeader(origin.getRow(1));
  for (const r of origins.income) {
    origin.addRow({
      origin: sheetText(r.origin),
      detail: sheetText(r.detail),
      count: r.count,
      amount: r.amountCop,
      source: channelText[r.channel],
    });
  }
  origin.addRow({
    origin: 'TOTAL DE INGRESOS DEL MES',
    detail: 'Todos los orígenes, neto de reembolsos y contracargos',
    count: origins.income.reduce((n, r) => n + r.count, 0),
    amount: origins.incomeTotalCop,
    source: 'Suma de las filas anteriores',
  });
  const totalRowIdx = origin.rowCount;
  origin.addRow({
    origin: 'GASTOS DEL MES POR CATEGORÍA',
    detail: 'Registrados por la organización',
    count: origins.expenses.reduce((n, r) => n + r.count, 0),
    amount: origins.expenseTotalCop,
    source: channelText.manual,
  });
  const expenseIdx = origin.rowCount;
  if (origins.expenses.length === 0) {
    origin.addRow({
      origin: 'Sin gastos registrados',
      detail: 'No hay gastos en el mes',
      count: 0,
      amount: 0,
      source: channelText.manual,
    });
  }
  for (const r of origins.expenses) {
    origin.addRow({
      origin: sheetText(r.origin),
      detail: 'Gasto',
      count: r.count,
      amount: r.amountCop,
      source: channelText.manual,
    });
  }
  finishTable(origin, 5, origin.rowCount);
  for (const idx of [totalRowIdx, expenseIdx]) origin.getRow(idx).font = { bold: true };

  const others = wb.addWorksheet('Otros movimientos');
  others.columns = [
    { header: 'Fecha', key: 'date', width: 14 },
    { header: 'Tipo', key: 'kind', width: 12 },
    { header: 'Categoría', key: 'category', width: 38 },
    { header: 'Concepto', key: 'concept', width: 48 },
    { header: 'Proveedor', key: 'counterparty', width: 30 },
    { header: 'Valor (COP)', key: 'amount', width: 18, style: { numFmt: MONEY_SIGNED } },
    { header: 'Soporte', key: 'support', width: 22 },
  ];
  styleHeader(others.getRow(1));
  const sortedManual = [...manual].sort((a, b) => a.date.localeCompare(b.date));
  for (const m of sortedManual) {
    others.addRow({
      date: m.date,
      kind: m.kind === 'income' ? 'Ingreso' : 'Gasto',
      category: categoryName(m.category),
      concept: sheetText(m.concept),
      counterparty: sheetText(m.counterparty?.trim() || 'No aplica'),
      amount: m.kind === 'income' ? m.amountCop : -m.amountCop,
      support: m.hasSupport ? 'Con soporte' : 'Sin soporte cargado',
    });
  }
  for (const sp of sponsorships) {
    others.addRow({
      date: colombiaDateText(sp.paidAt).slice(0, 10),
      kind: 'Ingreso',
      category: 'Apadrinamiento (cobro mensual)',
      concept: sheetText(`${sp.plan} · padrino: ${sp.sponsor || 'Sin nombre registrado'}`),
      counterparty: 'No aplica',
      amount: sp.amountCop,
      support: 'Pago en línea verificado',
    });
  }
  if (sortedManual.length === 0 && sponsorships.length === 0) {
    others.addRow({
      date: 'Sin movimientos',
      kind: 'No aplica',
      category: 'No aplica',
      concept:
        'Este mes no hay ventas, eventos, gastos ni apadrinamientos fuera de las donaciones en línea',
      counterparty: 'No aplica',
      amount: 0,
      support: 'No aplica',
    });
  }
  finishTable(others, 7, others.rowCount);
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
      { header: 'Neto recibido', key: 'net', width: 16, style: { numFmt: MONEY_SIGNED } },
      { header: 'Dato de la comisión', key: 'feeNote', width: 34 },
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
        header: 'Ajuste de mes cerrado',
        key: 'adjustment',
        width: 20,
      },
      { header: 'Donante', key: 'donor', width: 32 },
      { header: 'Documento', key: 'document', width: 18 },
    );
  }
  detail.columns = columns;
  styleHeader(detail.getRow(1));
  for (const e of input.entries) {
    const f = fullFields(e, input.donors);
    detail.addRow({
      seq: e.seq,
      date: colombiaDate(e.occurredAt),
      type: ACCOUNTING_ENTRY_TYPE_LABEL[e.entryType],
      gross: e.grossCop,
      ...(full
        ? {
            fee: f.fee,
            net: f.net,
            feeNote: f.feeNote,
            paymentType: f.paymentType,
            paymentMethod: sheetText(f.paymentMethod),
            destination: f.destination,
            destinationLabel: sheetText(f.destinationDetail),
            payment: sheetText(f.gatewayPaymentId),
            eventPeriod: e.eventPeriod,
            adjustment: f.adjustment,
            donor: sheetText(f.donor),
            document: sheetText(f.document),
          }
        : {}),
    });
  }
  finishTable(detail, columns.length, input.entries.length + 1);
  if (input.entries.length > 0) {
    const last = input.entries.length + 1;
    // Sin celdas vacías: lo que no se suma lleva un guion.
    const totalRow = detail.addRow(
      Object.fromEntries(columns.map((c) => [c.key as string, '—'])) as Record<string, string>,
    );
    totalRow.getCell('seq').value = 'Total';
    totalRow.getCell('type').value = 'SALDO';
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
          payment: sheetText(l.gatewayPaymentId ?? 'Sin dato'),
          ps: sheetText(l.platformStatus ?? 'Sin registro en AdoptaFácil'),
          gs: sheetText(l.gatewayStatus ?? 'Sin registro en Mercado Pago'),
          pa: l.platformAmountCop ?? 0,
          ga: l.gatewayAmountCop ?? 0,
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
    const donorRows = [...grouped.values()].sort((x, y) => x.name.localeCompare(y.name, 'es'));
    for (const g of donorRows) {
      donorsSheet.addRow({
        name: sheetText(g.name || 'Sin nombre registrado'),
        document: sheetText(g.document || 'No registrado'),
        count: g.count,
        total: g.total,
      });
    }
    if (donorRows.length === 0) {
      donorsSheet.addRow({
        name: 'Ningún donante autorizó identificarse este mes',
        document: 'No aplica',
        count: 0,
        total: 0,
      });
    }
    finishTable(donorsSheet, 4, donorsSheet.rowCount);

    addOriginSheets(wb, input);
  }

  const bytes = await wb.xlsx.writeBuffer();
  return Buffer.from(bytes as ArrayBuffer);
}
