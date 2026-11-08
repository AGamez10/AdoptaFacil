import * as ExcelJS from 'exceljs';
import sharp from 'sharp';
import type {
  LegalRepresentativeRole,
  OrgReportLegalEffect,
  OrgReportSigner,
} from '@adoptafacil/contracts';
import type { OrgReportPayload } from './report-payloads';
import { SIGNER_ROLE_LABEL } from './report-legal-effect';
import { sheetText } from './report-text';
import { detectSignatureImageType } from '../adoptions/adoption-contract-rules';
import {
  BORDER,
  NAVY,
  PAPER,
  TEAL,
  WARNING,
  setupPrint,
  styleHeader,
  styleTable,
} from './xlsx-style';

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
  /** Imagen de la firma de cada firmante (mismo orden que `signers`), ya
   *  descifrada. Un null (o la ausencia) deja la línea de firma sin imagen. */
  signerImages?: ReadonlyArray<Buffer | null>;
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

/** "Revisora fiscal · T.P. 145872-T": el cargo registrado si ya nombra el rol;
 *  si no, "Rol · cargo" (nunca "Revisor fiscal · Revisora fiscal"). */
function roleLine(role: LegalRepresentativeRole, position: string): string {
  const label = SIGNER_ROLE_LABEL[role];
  const clean = sheetText(position);
  if (!clean) return label;
  const keyword = label.split(' ')[0].toLowerCase().slice(0, 6);
  return clean.toLowerCase().includes(keyword) ? clean : `${label} · ${clean}`;
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
  summary.columns = [{ width: 40 }, { width: 80 }];
  const title =
    payload.kind === 'donations'
      ? 'Informe de donaciones recibidas'
      : payload.kind === 'accounting'
        ? 'Libro auxiliar de donaciones'
        : 'Reporte de servicio social y voluntariado';
  const printCtx = {
    org: payload.organization.name,
    code: input.code,
    verifyUrl: input.verifyUrl,
  };
  const banner = summary.addRow([sheetText(payload.organization.name)]);
  summary.mergeCells(banner.number, 1, banner.number, 2);
  banner.height = 34;
  banner.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  banner.alignment = { vertical: 'middle', indent: 1 };
  banner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  const titleRow = summary.addRow([title]);
  summary.mergeCells(titleRow.number, 1, titleRow.number, 2);
  titleRow.height = 26;
  titleRow.font = { bold: true, size: 14, color: { argb: TEAL } };
  titleRow.alignment = { vertical: 'middle', indent: 1 };
  if (input.draft) {
    const notice = summary.addRow([
      input.draft === 'rejected'
        ? 'BORRADOR: un firmante rechazó este documento y no se emitirá.'
        : 'BORRADOR sin emitir: no tiene valor hasta que cada firmante lo apruebe.',
    ]);
    summary.mergeCells(notice.number, 1, notice.number, 2);
    notice.height = 24;
    notice.font = { bold: true, color: { argb: 'FF7A4B00' } };
    notice.alignment = { vertical: 'middle', indent: 1 };
    notice.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WARNING } };
  }
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
      ['Tarifa de Mercado Pago e IVA (COP)', payload.totals.fees],
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
      ['Tarifa de Mercado Pago (COP)', t.feesCop],
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
    const label = row.getCell(1);
    label.font = { bold: true, color: { argb: NAVY } };
    label.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PAPER } };
    label.alignment = { vertical: 'top', wrapText: true, indent: 1 };
    label.border = BORDER;
    const value = row.getCell(2);
    if (typeof v === 'number' && k.includes('COP')) value.numFmt = MONEY;
    value.alignment = { horizontal: 'left', vertical: 'top', wrapText: true, indent: 1 };
    value.border = BORDER;
  }

  // Firmas: cada firmante con su imagen y su nombre, como en el PDF.
  const issuedSigners = input.draft ? [] : input.signers;
  if (issuedSigners.length > 0 && input.legalEffect !== 'informative') {
    summary.addRow([]);
    const head = summary.addRow(['Firmas']);
    summary.mergeCells(head.number, 1, head.number, 2);
    head.height = 24;
    head.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    head.alignment = { vertical: 'middle', indent: 1 };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL } };
    for (const [i, signer] of issuedSigners.entries()) {
      const row = summary.addRow([
        `${sheetText(signer.fullName)}\n${roleLine(signer.role, signer.position)}`,
        '',
      ]);
      row.height = 62;
      const label = row.getCell(1);
      label.font = { bold: true, color: { argb: NAVY } };
      label.alignment = { vertical: 'bottom', wrapText: true, indent: 1 };
      label.border = BORDER;
      row.getCell(2).border = BORDER;
      const image = input.signerImages?.[i] ?? null;
      const kind = image ? detectSignatureImageType(image) : null;
      if (image && kind) {
        try {
          const meta = await sharp(image).metadata();
          const w = meta.width ?? 0;
          const h = meta.height ?? 0;
          if (w > 0 && h > 0) {
            const ratio = Math.min(200 / w, 74 / h, 1);
            const id = wb.addImage({ buffer: image as unknown as ExcelJS.Buffer, extension: kind });
            summary.addImage(id, {
              tl: { col: 1.15, row: row.number - 1 + 0.05 },
              ext: { width: Math.round(w * ratio), height: Math.round(h * ratio) },
            });
          }
        } catch {
          // Sin la imagen antes que sin el reporte; el nombre y el cargo siguen.
        }
      }
    }
  }
  setupPrint(summary, { ...printCtx, title });
  summary.pageSetup.fitToHeight = 1;

  if (payload.kind === 'donations') {
    const detail = wb.addWorksheet('Donaciones');
    detail.columns = [
      { header: 'Fecha', key: 'date', width: 18, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
      { header: 'Recibo', key: 'receipt', width: 12 },
      { header: 'Donante', key: 'donor', width: 32 },
      { header: 'Documento', key: 'doc', width: 14 },
      { header: 'Destino', key: 'concept', width: 34 },
      { header: 'Valor donado', key: 'amount', width: 15, style: { numFmt: MONEY } },
      { header: 'Tarifa de Mercado Pago e IVA', key: 'fees', width: 22, style: { numFmt: MONEY } },
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
    styleTable(detail, 9);
    setupPrint(detail, { ...printCtx, title: 'Donaciones', repeatHeader: true });

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
    styleTable(byConcept, 3);
    setupPrint(byConcept, { ...printCtx, title: 'Por destino', repeatHeader: true });
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
    styleTable(detail, 10);
    setupPrint(detail, { ...printCtx, title: 'Libro auxiliar', repeatHeader: true });
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
      { header: 'Jornadas en el período', key: 'sessions', width: 12 },
      { header: 'Horas por aprobar', key: 'pendingHours', width: 12, style: { numFmt: HOURS } },
      { header: 'Fotos de la jornada', key: 'photos', width: 10 },
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
        sessions: r.sessionsInPeriod,
        pendingHours: r.pendingHoursInPeriod,
        photos: r.photos?.length ?? 0,
      });
    }
    if (payload.anonymizedWithoutConsent && payload.anonymizedWithoutConsent > 0) {
      detail.addRow({
        name: sheetText(
          `${payload.anonymizedWithoutConsent} persona(s) figuran sin nombre por no autorizar el uso de sus datos; sus horas sí se cuentan.`,
        ),
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
    detail.autoFilter = { from: 'A1', to: 'M1' };
    styleTable(detail, 13);
    setupPrint(detail, { ...printCtx, title: 'Voluntarios', repeatHeader: true });

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
    styleTable(bySchool, 3);
    setupPrint(bySchool, { ...printCtx, title: 'Por institución', repeatHeader: true });
  }

  const bytes = await wb.xlsx.writeBuffer();
  return Buffer.from(bytes as ArrayBuffer);
}
