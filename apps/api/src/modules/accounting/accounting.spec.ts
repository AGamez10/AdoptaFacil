import * as ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import {
  accountingPeriodOf,
  accountingPeriodRange,
  nextAccountingPeriod,
  type AccountingEntry,
} from '@adoptafacil/contracts';
import { computeLegalEffect, defaultSignerRoles } from '../reports/report-legal-effect';
import { renderReportPdf } from '../reports/report-pdf';
import {
  collectorFee,
  draftsForDonation,
  effectiveRefunds,
  entriesHash,
  postingPeriod,
  reconcile,
  totalsOf,
  type DonationSource,
  type GatewayPaymentSource,
} from './accounting-ledger';
import { csvCell, renderAccountingCsv, renderAccountingXlsx } from './accounting-export';

const donation = (over: Partial<DonationSource> = {}): DonationSource => ({
  id: 'd-1',
  collectionId: 'af-0001',
  amountCharged: 50_000,
  conceptKind: 'organization',
  conceptId: 'org-1',
  approvedAt: new Date('2026-09-10T15:00:00Z'),
  destinationLabel: null,
  ...over,
});

const payment = (over: Partial<GatewayPaymentSource> = {}): GatewayPaymentSource => ({
  mpPaymentId: '900',
  externalReference: 'af-0001',
  donationId: 'd-1',
  status: 'approved',
  transactionAmount: 50_000,
  netReceivedAmount: 48_000,
  transactionAmountRefunded: 0,
  feeDetails: [
    { type: 'mercadopago_fee', amount: 1700, fee_payer: 'collector' },
    { type: 'financing_fee', amount: 300, fee_payer: 'payer' },
  ],
  refunds: [],
  paymentTypeId: 'credit_card',
  paymentMethodId: 'visa',
  dateApproved: new Date('2026-09-10T14:59:00Z'),
  firstSeenAt: new Date('2026-09-10T14:59:00Z'),
  updatedAt: new Date('2026-09-10T14:59:00Z'),
  ...over,
});

const entry = (over: Partial<AccountingEntry> = {}): AccountingEntry => ({
  id: 'e',
  seq: 1,
  entryType: 'donation',
  source: 'mercadopago',
  donationId: 'd-1',
  gatewayPaymentId: '900',
  occurredAt: '2026-09-10T14:59:00.000Z',
  eventPeriod: '2026-09',
  period: '2026-09',
  isAdjustment: false,
  grossCop: 50_000,
  feeCop: 1700,
  netCop: 48_300,
  paymentType: 'credit_card',
  paymentMethod: 'visa',
  destination: 'general',
  destinationLabel: null,
  createdAt: '2026-09-10T15:00:00.000Z',
  ...over,
});

describe('periodos contables (hora de Colombia, UTC−5)', () => {
  it('asigna el mes de Colombia, no el de UTC', () => {
    // 1 de octubre 03:00 UTC = 30 de septiembre 22:00 en Colombia.
    expect(accountingPeriodOf(new Date('2026-10-01T03:00:00Z'))).toBe('2026-09');
    expect(accountingPeriodOf(new Date('2026-10-01T05:00:00Z'))).toBe('2026-10');
  });

  it('el rango de un mes cubre de medianoche a medianoche de Colombia', () => {
    const { fromUtc, toUtcExclusive } = accountingPeriodRange('2026-12');
    expect(fromUtc.toISOString()).toBe('2026-12-01T05:00:00.000Z');
    expect(toUtcExclusive.toISOString()).toBe('2027-01-01T05:00:00.000Z');
    expect(nextAccountingPeriod('2026-12')).toBe('2027-01');
    expect(() => accountingPeriodRange('2026-13')).toThrow();
  });
});

describe('renglones del libro auxiliar', () => {
  it('la comisión es solo la que paga el refugio (fee_payer = collector)', () => {
    expect(collectorFee(payment().feeDetails)).toBe(1700);
    expect(collectorFee([])).toBeNull();
    expect(collectorFee([{ amount: 10, fee_payer: 'payer' }])).toBe(0);
  });

  it('una donación aprobada con su pago: bruto, comisión, neto y forma de pago', () => {
    const [d] = draftsForDonation(donation(), payment());
    expect(d).toMatchObject({
      dedupKey: 'donation:d-1',
      entryType: 'donation',
      source: 'mercadopago',
      grossCop: 50_000,
      feeCop: 1700,
      netCop: 48_000,
      paymentType: 'credit_card',
      occurredAt: new Date('2026-09-10T14:59:00Z'),
    });
  });

  it('sin pago de la pasarela: queda el bruto y la comisión sin informar', () => {
    const drafts = draftsForDonation(donation({ collectionId: 'fake-1' }), undefined);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ source: 'other', feeCop: null, netCop: null });
  });

  it('reembolsos aprobados restan, nunca más que lo donado; los rechazados no cuentan', () => {
    const p = payment({
      refunds: [
        { id: 1, amount: 20_000, status: 'approved', date_created: '2026-10-02T12:00:00Z' },
        { id: 2, amount: 5_000, status: 'rejected' },
        { id: 3, amount: 40_000, status: 'approved' },
      ],
    });
    expect(effectiveRefunds(p.refunds).map((r) => r.id)).toEqual(['1', '3']);
    const drafts = draftsForDonation(donation(), p);
    const refunds = drafts.filter((d) => d.entryType === 'refund');
    expect(refunds.map((r) => r.grossCop)).toEqual([-20_000, -30_000]);
    expect(refunds[0].dedupKey).toBe('refund:900:1');
  });

  it('un contracargo resta lo que no se había reembolsado', () => {
    const drafts = draftsForDonation(
      donation(),
      payment({
        status: 'charged_back',
        refunds: [{ id: 7, amount: 10_000, status: 'approved' }],
      }),
    );
    expect(drafts.map((d) => [d.entryType, d.grossCop])).toEqual([
      ['donation', 50_000],
      ['refund', -10_000],
      ['chargeback', -40_000],
    ]);
  });

  it('un hecho de un mes cerrado entra como ajuste en el mes en curso', () => {
    const now = new Date('2026-11-06T12:00:00Z');
    const at = new Date('2026-09-20T12:00:00Z');
    expect(postingPeriod(at, new Set(), now)).toEqual({
      eventPeriod: '2026-09',
      period: '2026-09',
    });
    expect(postingPeriod(at, new Set(['2026-09']), now)).toEqual({
      eventPeriod: '2026-09',
      period: '2026-11',
    });
  });
});

describe('totales y sello', () => {
  it('suma donaciones, reversos, comisiones, destinación y forma de pago', () => {
    const t = totalsOf([
      entry(),
      entry({ seq: 2, entryType: 'refund', grossCop: -10_000, feeCop: null, netCop: -10_000 }),
      entry({ seq: 3, destination: 'campaign', feeCop: null, isAdjustment: true }),
    ]);
    expect(t).toMatchObject({
      donationCount: 2,
      donationsGrossCop: 100_000,
      refundsCop: -10_000,
      chargebacksCop: 0,
      balanceCop: 90_000,
      feesCop: 1700,
      entriesWithoutFee: 1,
      adjustmentCount: 1,
      byDestination: { general: 40_000, animal: 0, campaign: 50_000 },
      byPaymentType: { credit_card: 90_000 },
    });
  });

  it('la huella cambia si cambia un renglón y no depende del orden', () => {
    const a = [entry(), entry({ seq: 2, grossCop: 1000 })];
    expect(entriesHash(a)).toBe(entriesHash([...a].reverse()));
    expect(entriesHash(a)).not.toBe(entriesHash([entry(), entry({ seq: 2, grossCop: 1001 })]));
  });
});

describe('conciliación AdoptaFácil ↔ Mercado Pago', () => {
  const at = new Date('2026-09-10T15:00:00Z');
  const d = (id: string, ref: string, over = {}) => ({
    id,
    collectionId: ref,
    status: 'approved',
    amountCharged: 50_000,
    at,
    reversedCop: 0,
    ...over,
  });

  it('cuadra, falta en uno, sobra en el otro, otro monto y otro estado', () => {
    const result = reconcile(
      [
        d('a', 'af-a'),
        d('b', 'af-b'),
        d('c', 'af-c', { status: 'pending' }),
        d('e', 'af-e'),
        d('f', 'af-f'),
      ],
      [
        payment({ mpPaymentId: '1', externalReference: 'af-a', donationId: 'a' }),
        payment({ mpPaymentId: '3', externalReference: 'af-c', donationId: 'c' }),
        payment({ mpPaymentId: '5', externalReference: 'af-e', transactionAmount: 49_000 }),
        payment({ mpPaymentId: '6', externalReference: 'af-f', status: 'refunded' }),
        // Intento rechazado y luego aprobado de la misma donación: vale el aprobado.
        payment({ mpPaymentId: '7', externalReference: 'af-a', status: 'rejected' }),
      ],
    );
    expect(result.counts).toEqual({
      matched: 1,
      missing_in_gateway: 1,
      missing_in_platform: 1,
      status_mismatch: 1,
      amount_mismatch: 1,
    });
    expect(result.lines.at(-1)?.status).toBe('matched');
    expect(result.lines.every((l) => l.status === 'matched' || l.hint.length > 0)).toBe(true);
    expect(result.platformTotalCop).toBe(200_000);
    expect(result.gatewayFeesCop).toBe(1700 * 4);
  });

  it('un reembolso ya asentado en el libro cuadra con el estado de Mercado Pago', () => {
    const result = reconcile(
      [d('a', 'af-a', { reversedCop: -50_000 }), d('b', 'af-b', { reversedCop: -10_000 })],
      [
        payment({ mpPaymentId: '1', externalReference: 'af-a', status: 'refunded' }),
        payment({
          mpPaymentId: '2',
          externalReference: 'af-b',
          refunds: [{ id: 1, amount: 10_000, status: 'approved' }],
        }),
      ],
    );
    expect(result.counts.matched).toBe(2);
  });
});

describe('exportes y documento firmable', () => {
  const input = {
    organizationName: 'Refugio =Patitas',
    nit: '900123456-1',
    period: '2026-09',
    status: 'closed' as const,
    closedAt: '2026-10-02T15:00:00.000Z',
    entriesHash: 'a'.repeat(64),
    entries: [
      entry({ donationId: 'd-1' }),
      entry({ seq: 2, donationId: 'd-2', destinationLabel: '=cmd|calc' }),
    ],
    totals: totalsOf([entry(), entry({ seq: 2 })]),
    donors: new Map([['d-1', { name: 'Ana Pérez', document: '52111222' }]]),
    generatedAt: new Date('2026-10-02T15:00:00Z'),
  };

  it('las celdas CSV nunca son fórmulas', () => {
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell(-5)).toBe('-5');
  });

  it('el CSV básico no trae comisión ni donantes; el completo sí, y solo los autorizados', () => {
    const basic = renderAccountingCsv(input, false).toString('utf8');
    expect(basic.charCodeAt(0)).toBe(0xfeff);
    expect(basic).not.toContain('Comisión');
    expect(basic).not.toContain('Ana Pérez');
    const full = renderAccountingCsv(input, true).toString('utf8');
    expect(full).toContain('Comisión pasarela (COP)');
    expect(full).toContain('Ana Pérez');
    expect(full).toContain('Donante (sin autorización para identificarlo)');
    expect(full).toContain("'=cmd|calc");
  });

  it('el CSV separa con punto y coma, parte fecha y hora y alinea los totales', () => {
    const csv = renderAccountingCsv(input, false)
      .toString('utf8')
      .replace(/^\uFEFF/, '');
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('sep=;');
    expect(lines[1]).toBe('Folio;Fecha;Hora (Colombia);Tipo;Valor bruto (COP)');
    expect(lines[2]).toMatch(/^1;\d{4}-\d{2}-\d{2};\d{2}:\d{2};Donación;/);
    expect(csv).toContain('SALDO bruto neto de reversos;');
    expect(csv).toContain('NIT;');
  });

  it('el Excel completo trae libro, destinación, forma de pago y donantes autorizados', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await renderAccountingXlsx(input, true)) as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Resumen',
      'Libro auxiliar',
      'Por destinación',
      'Por forma de pago',
      'Donantes autorizados',
    ]);
    const basic = new ExcelJS.Workbook();
    await basic.xlsx.load((await renderAccountingXlsx(input, false)) as unknown as ArrayBuffer);
    expect(basic.worksheets.map((w) => w.name)).toEqual(['Resumen', 'Libro auxiliar']);
  });

  it('el libro del mes lo firma el revisor fiscal o el contador; nunca sale "certificado"', () => {
    const registered = new Set(['legal_representative', 'accountant'] as const);
    expect(defaultSignerRoles('accounting', registered)).toEqual([
      'legal_representative',
      'accountant',
    ]);
    const base = { kind: 'accounting' as const, rteVigente: true, hasNit: true };
    expect(
      computeLegalEffect({
        ...base,
        formalizationState: 'esal_rte',
        signerRoles: ['fiscal_reviewer'],
      }),
    ).toBe('signed');
    expect(
      computeLegalEffect({
        ...base,
        formalizationState: 'esal_rte',
        signerRoles: ['legal_representative'],
      }),
    ).toBe('informative');
    expect(
      computeLegalEffect({ ...base, formalizationState: 'informal', signerRoles: ['accountant'] }),
    ).toBe('informative');
  });

  it('el PDF del libro auxiliar se dibuja', async () => {
    const pdf = await renderReportPdf({
      code: 'ADF-REP-2026-ABCDEFGH',
      contentHash: 'b'.repeat(64),
      createdAt: new Date('2026-10-02T15:00:00Z'),
      legalEffect: 'signed',
      payload: {
        version: 1,
        kind: 'accounting',
        organization: { name: 'Refugio', formalizationState: 'formalizada' },
        period: { start: '2026-09-01', end: '2026-09-30' },
        month: '2026-09',
        rows: [
          {
            seq: 1,
            occurredAt: '2026-09-10T14:59:00.000Z',
            type: 'Donación',
            destination: 'Libre (sin destinación)',
            paymentType: 'credit_card',
            gatewayPaymentId: '900',
            gross: 50_000,
            fee: 1700,
            net: 48_300,
            adjustment: '',
          },
        ],
        totals: totalsOf([entry()]),
        reconciliation: {
          balanced: true,
          counts: {
            matched: 1,
            missing_in_gateway: 0,
            missing_in_platform: 0,
            status_mismatch: 0,
            amount_mismatch: 0,
          },
        },
        close: {
          closedAt: '2026-10-02T15:00:00.000Z',
          entriesHash: 'a'.repeat(64),
          lastSeq: 1,
          note: null,
        },
      },
      signers: [{ role: 'fiscal_reviewer', fullName: 'Rita', position: 'Revisora', image: null }],
      verifyUrl: 'https://adoptafacil.test/verificar/ADF-REP-2026-ABCDEFGH',
    });
    const doc = await PDFDocument.load(pdf);
    expect(doc.getTitle()).toContain('Libro auxiliar de donaciones');
  });
});
