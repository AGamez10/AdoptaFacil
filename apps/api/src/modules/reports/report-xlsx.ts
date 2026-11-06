import * as ExcelJS from 'exceljs';
import type { OrgReportLegalEffect, OrgReportSigner } from '@adoptafacil/contracts';
import type { OrgReportPayload } from './report-payloads';
import { SIGNER_ROLE_LABEL } from './report-legal-effect';
import { sheetText } from './report-text';

/**
 * Versión Excel del reporte (para el contador o el colegio): mismas cifras que
 * el PDF, salidas del mismo snapshot sellado. Toda celda de texto pasa por
 * `sheetText` (nunca se evalúa como fórmula); los montos y horas van como
 * números reales para que se puedan sumar y filtrar.
 */

export interface RenderXlsxInput {
  code: string;
  contentHash: string;
  createdAt: Date;
  legalEffect: OrgReportLegalEffect;
  payload: OrgReportPayload;
  signers: OrgReportSigner[];
  verifyUrl: string;
  /** Borrador sin emitir (faltan firmas o fue rechazado). */
  draft?: 'pending_signatures' | 'rejected';
}

const EFFECT_LABEL: Record<OrgReportLegalEffect, string> = {
  informative: 'Comprobante informativo (sin efecto legal ni tributario)',
  signed: 'Firmado por la representación legal',
  certified: 'Certificado (art. 125-2 del Estatuto Tributario)',
};

const MONEY = '"$" #,##0';
const HOURS = '0.##';

function styleHeader(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14294D' } };
  row.alignment = { vertical: 'middle' };
}

function colombiaDate(iso: string): Date {
  // Excel no maneja zonas horarias: se guarda la fecha/hora de Colombia.
  return new Date(new Date(iso).getTime() - 5 * 3600_000);
}

export async function renderReportXlsx(input: RenderXlsxInput): Promise<Buffer> {
  const { payload } = input;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AdoptaFácil';
  wb.created = input.createdAt;

  const summary = wb.addWorksheet('Resumen');
  summary.columns = [{ width: 38 }, { width: 70 }];
  const title =
    payload.kind === 'donations'
      ? 'Informe de donaciones recibidas'
      : payload.kind === 'accounting'
        ? 'Libro auxiliar de donaciones'
        : 'Reporte de servicio social y voluntariado';
  summary.addRow([title]).font = { bold: true, size: 14 };
  summary.addRow([]);
  const info: Array<[string, string | number]> = [
    ['Organización', sheetText(payload.organization.name)],
    ['NIT', sheetText(payload.organization.nit ?? '')],
    ['Período (hora de Colombia)', `${payload.period.start} a ${payload.period.end}`],
    ['Folio', input.code],
    [
      'Valor del documento',
      input.draft
        ? 'BORRADOR sin emitir: sin valor hasta que cada firmante lo apruebe'
        : EFFECT_LABEL[input.legalEffect],
    ],
    [
      'Firmantes',
      input.signers.length
        ? input.signers
            .map((s) => `${sheetText(s.fullName)} (${SIGNER_ROLE_LABEL[s.role]})`)
            .join('; ')
        : 'Sin firmas',
    ],
    ['Huella SHA-256 del contenido', input.contentHash],
    ['Verificación pública', input.verifyUrl],
  ];
  if (payload.kind === 'donations') {
    info.push(
      ['Donaciones aprobadas', payload.totals.count],
      ['Valor donado (COP)', payload.totals.amountCharged],
      ['Comisiones e IVA (COP)', payload.totals.fees],
      ['Neto recibido (COP)', payload.totals.net],
    );
  } else if (payload.kind === 'accounting') {
    const t = payload.totals;
    info.push(
      ['Mes contable', payload.month],
      ['Donaciones del mes', t.donationCount],
      ['Donaciones brutas (COP)', t.donationsGrossCop],
      ['Reembolsos (COP)', t.refundsCop],
      ['Contracargos (COP)', t.chargebacksCop],
      ['Saldo bruto neto de reversos (COP)', t.balanceCop],
      ['Comisiones de la pasarela (COP)', t.feesCop],
      ['Neto informado por la pasarela (COP)', t.netCop],
      ['Conciliación al cerrar', payload.reconciliation.balanced ? 'Cuadra' : 'Con descuadres'],
      ['Huella SHA-256 de los renglones', payload.close.entriesHash],
      ['Último folio del libro', payload.close.lastSeq],
    );
  } else {
    info.push(
      ['Voluntarios con horas en el período', payload.totals.volunteers],
      ['Horas aprobadas en el período', payload.totals.hoursInPeriod],
      [`Cumplen el mínimo de ${payload.minHours} h`, payload.totals.completed],
      ['Certificados emitidos', payload.totals.certificates],
    );
  }
  for (const [k, v] of info) {
    const row = summary.addRow([k, v]);
    row.getCell(1).font = { bold: true };
    if (typeof v === 'number' && k.includes('COP')) row.getCell(2).numFmt = MONEY;
    row.getCell(2).alignment = { horizontal: 'left', wrapText: true };
  }

  if (payload.kind === 'donations') {
    const detail = wb.addWorksheet('Donaciones');
    detail.columns = [
      { header: 'Fecha', key: 'date', width: 18, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
      { header: 'Recibo', key: 'receipt', width: 12 },
      { header: 'Donante', key: 'donor', width: 32 },
      { header: 'Documento', key: 'doc', width: 14 },
      { header: 'Destino', key: 'concept', width: 34 },
      { header: 'Valor donado', key: 'amount', width: 15, style: { numFmt: MONEY } },
      { header: 'Comisiones e IVA', key: 'fees', width: 16, style: { numFmt: MONEY } },
      { header: 'Neto recibido', key: 'net', width: 15, style: { numFmt: MONEY } },
      { header: 'Certificado', key: 'cert', width: 22 },
    ];
    styleHeader(detail.getRow(1));
    for (const r of payload.rows) {
      detail.addRow({
        date: colombiaDate(r.date),
        receipt: sheetText(r.receiptNo),
        donor: sheetText(r.donor),
        doc: sheetText(r.donorDocument),
        concept: sheetText(r.concept),
        amount: r.amountCharged,
        fees: r.fees,
        net: r.net,
        cert: sheetText(r.certificateCode),
      });
    }
    detail.views = [{ state: 'frozen', ySplit: 1 }];
    detail.autoFilter = { from: 'A1', to: 'I1' };

    const byConcept = wb.addWorksheet('Por destino');
    byConcept.columns = [
      { header: 'Destino', key: 'concept', width: 40 },
      { header: 'Donaciones', key: 'count', width: 12 },
      { header: 'Neto recibido', key: 'net', width: 16, style: { numFmt: MONEY } },
    ];
    styleHeader(byConcept.getRow(1));
    for (const r of payload.byConcept) {
      byConcept.addRow({ concept: sheetText(r.concept), count: r.count, net: r.net });
    }
  } else if (payload.kind === 'accounting') {
    const detail = wb.addWorksheet('Libro auxiliar');
    detail.columns = [
      { header: 'Folio', key: 'seq', width: 8 },
      { header: 'Fecha', key: 'date', width: 18, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
      { header: 'Tipo', key: 'type', width: 14 },
      { header: 'Destinación', key: 'destination', width: 30 },
      { header: 'Forma de pago', key: 'paymentType', width: 18 },
      { header: 'Pago en pasarela', key: 'payment', width: 18 },
      { header: 'Bruto', key: 'gross', width: 14, style: { numFmt: MONEY } },
      { header: 'Comisión', key: 'fee', width: 12, style: { numFmt: MONEY } },
      { header: 'Neto', key: 'net', width: 14, style: { numFmt: MONEY } },
      { header: 'Ajuste', key: 'adjustment', width: 18 },
    ];
    styleHeader(detail.getRow(1));
    for (const r of payload.rows) {
      detail.addRow({
        seq: r.seq,
        date: colombiaDate(r.occurredAt),
        type: sheetText(r.type),
        destination: sheetText(r.destination),
        paymentType: sheetText(r.paymentType),
        payment: sheetText(r.gatewayPaymentId),
        gross: r.gross,
        fee: r.fee,
        net: r.net,
        adjustment: sheetText(r.adjustment),
      });
    }
    detail.views = [{ state: 'frozen', ySplit: 1 }];
    detail.autoFilter = { from: 'A1', to: 'J1' };
  } else {
    const detail = wb.addWorksheet('Voluntarios');
    detail.columns = [
      { header: 'Voluntario', key: 'name', width: 30 },
      { header: 'Actividad', key: 'opportunity', width: 30 },
      { header: 'Tipo', key: 'type', width: 16 },
      { header: 'Institución educativa', key: 'school', width: 30 },
      { header: 'Convenio', key: 'agreement', width: 14 },
      { header: 'Horas en el período', key: 'period', width: 12, style: { numFmt: HOURS } },
      { header: 'Horas totales', key: 'total', width: 12, style: { numFmt: HOURS } },
      { header: 'Sesiones pendientes', key: 'pending', width: 12 },
      { header: 'Estado', key: 'status', width: 26 },
      { header: 'Certificado', key: 'cert', width: 12 },
    ];
    styleHeader(detail.getRow(1));
    for (const r of payload.rows) {
      detail.addRow({
        name: sheetText(r.volunteerName),
        opportunity: sheetText(r.opportunity),
        type: r.studentService ? 'Servicio social' : 'Voluntariado',
        school: sheetText(r.school),
        agreement: sheetText(r.agreementCode),
        period: r.hoursInPeriod,
        total: r.hoursTotal,
        pending: r.pendingSessions,
        status: sheetText(r.status),
        cert: sheetText(r.certificateNo),
      });
    }
    if (payload.omittedWithoutConsent && payload.omittedWithoutConsent > 0) {
      detail.addRow({
        name: sheetText(
          `No se incluyen ${payload.omittedWithoutConsent} voluntario(s) sin autorización de uso de datos.`,
        ),
      });
    }
    detail.views = [{ state: 'frozen', ySplit: 1 }];
    detail.autoFilter = { from: 'A1', to: 'J1' };

    const bySchool = wb.addWorksheet('Por institución');
    bySchool.columns = [
      { header: 'Institución educativa', key: 'school', width: 40 },
      { header: 'Estudiantes / voluntarios', key: 'volunteers', width: 14 },
      { header: 'Horas en el período', key: 'hours', width: 14, style: { numFmt: HOURS } },
    ];
    styleHeader(bySchool.getRow(1));
    for (const r of payload.bySchool) {
      bySchool.addRow({ school: sheetText(r.school), volunteers: r.volunteers, hours: r.hours });
    }
  }

  const bytes = await wb.xlsx.writeBuffer();
  return Buffer.from(bytes as ArrayBuffer);
}
