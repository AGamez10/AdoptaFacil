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
  return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvLine(cells: unknown[]): string {
  return cells.map(csvCell).join(',');
}

function donorLabel(entry: AccountingEntry, donors: Map<string, DonorIdentity> | undefined) {
  if (!entry.donationId) return { name: '', document: '' };
  const d = donors?.get(entry.donationId);
  return d ?? { name: 'Donante (sin autorización para identificarlo)', document: '' };
}

/** CSV del mes. `full` agrega las columnas del plan de pago. */
export function renderAccountingCsv(input: AccountingExportInput, full: boolean): Buffer {
  const lines: string[] = [];
  const header = ['Folio', 'Fecha (hora Colombia)', 'Tipo', 'Valor bruto (COP)'];
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
  lines.push(csvLine(header));
  for (const e of input.entries) {
    const row: unknown[] = [
      e.seq,
      colombiaDateText(e.occurredAt),
      ACCOUNTING_ENTRY_TYPE_LABEL[e.entryType],
      e.grossCop,
    ];
    if (full) {
      const donor = donorLabel(e, input.donors);
      row.push(
        e.feeCop,
        e.netCop,
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
  lines.push('');
  lines.push(csvLine(['Resumen', accountingPeriodLabel(input.period)]));
  lines.push(csvLine(['Donaciones', input.totals.donationCount]));
  lines.push(csvLine(['Donaciones brutas (COP)', input.totals.donationsGrossCop]));
  lines.push(csvLine(['Reembolsos (COP)', input.totals.refundsCop]));
  lines.push(csvLine(['Contracargos (COP)', input.totals.chargebacksCop]));
  lines.push(csvLine(['Saldo bruto neto de reversos (COP)', input.totals.balanceCop]));
  if (full) {
    lines.push(csvLine(['Tarifa de Mercado Pago (COP)', input.totals.feesCop]));
    lines.push(csvLine(['Neto informado por la pasarela (COP)', input.totals.netCop]));
  }
  lines.push(csvLine(['Estado del mes', input.status === 'closed' ? 'Cerrado' : 'Abierto']));
  lines.push(csvLine(['Aviso', ACCOUNTING_DISCLAIMER]));
  // BOM: Excel en español abre el UTF-8 con tildes correctas.
  return Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');
}

function styleHeader(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14294D' } };
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

  const summary = wb.addWorksheet('Resumen');
  summary.columns = [{ width: 42 }, { width: 70 }];
  summary.addRow(['Libro auxiliar de donaciones']).font = { bold: true, size: 14 };
  summary.addRow([]);
  const info: Array<[string, string | number]> = [
    ['Organización', sheetText(input.organizationName)],
    ['NIT', sheetText(input.nit ?? '')],
    ['Mes contable (hora de Colombia)', accountingPeriodLabel(input.period)],
    [
      'Estado del mes',
      input.status === 'closed'
        ? `Cerrado el ${input.closedAt ? colombiaDateText(input.closedAt) : ''}`
        : 'Abierto (puede recibir más movimientos)',
    ],
    ['Huella SHA-256 del cierre', input.entriesHash ?? ''],
    ['Donaciones', t.donationCount],
    ['Donaciones brutas (COP)', t.donationsGrossCop],
    ['Reembolsos (COP)', t.refundsCop],
    ['Contracargos (COP)', t.chargebacksCop],
    ['Saldo bruto neto de reversos (COP)', t.balanceCop],
  ];
  if (full) {
    info.push(
      ['Tarifa de Mercado Pago (COP)', t.feesCop],
      ['Neto informado por la pasarela (COP)', t.netCop],
      ['Renglones sin comisión informada', t.entriesWithoutFee],
      ['Ajustes de meses cerrados', t.adjustmentCount],
    );
  }
  info.push(['Aviso', ACCOUNTING_DISCLAIMER]);
  for (const [k, v] of info) {
    const row = summary.addRow([k, v]);
    row.getCell(1).font = { bold: true };
    if (typeof v === 'number' && k.includes('COP')) row.getCell(2).numFmt = MONEY;
    row.getCell(2).alignment = { horizontal: 'left', wrapText: true };
  }

  const detail = wb.addWorksheet('Libro auxiliar');
  const columns: Array<Partial<ExcelJS.Column>> = [
    { header: 'Folio', key: 'seq', width: 8 },
    { header: 'Fecha', key: 'date', width: 18, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
    { header: 'Tipo', key: 'type', width: 14 },
    { header: 'Valor bruto', key: 'gross', width: 14, style: { numFmt: MONEY } },
  ];
  if (full) {
    columns.push(
      { header: 'Comisión', key: 'fee', width: 12, style: { numFmt: MONEY } },
      { header: 'Neto', key: 'net', width: 14, style: { numFmt: MONEY } },
      { header: 'Forma de pago', key: 'paymentType', width: 20 },
      { header: 'Medio de pago', key: 'paymentMethod', width: 14 },
      { header: 'Destinación', key: 'destination', width: 24 },
      { header: 'Detalle destinación', key: 'destinationLabel', width: 28 },
      { header: 'Pago en pasarela', key: 'payment', width: 18 },
      { header: 'Mes del hecho', key: 'eventPeriod', width: 12 },
      { header: 'Ajuste', key: 'adjustment', width: 8 },
      { header: 'Donante', key: 'donor', width: 30 },
      { header: 'Documento', key: 'document', width: 16 },
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
  detail.views = [{ state: 'frozen', ySplit: 1 }];

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
