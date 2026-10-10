import * as ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import { computeLegalEffect, defaultSignerRoles, nextStepsFor } from './report-legal-effect';
import { buildDonationsPayload, buildSocialServicePayload } from './report-payloads';
import { resolveReportPeriod, todayInColombia } from './report-period';
import { renderReportPdf } from './report-pdf';
import { REPORT_CODE_PATTERN, generateReportCode, sealHash } from './report-seal';
import { maskDocument, pdfText, sheetText, toWinAnsi } from './report-text';
import { renderReportXlsx } from './report-xlsx';

const ORG = { name: 'Refugio 🐾 Patitas', formalizationState: 'esal_rte', nit: '900123456-1' };

describe('report-text (saneamiento de variables)', () => {
  it('pdfText deja solo caracteres WinAnsi, sin controles ni saltos', () => {
    expect(pdfText('Ana 🐶 Pérez\n\u0000Ñandú‮')).toBe('Ana ? Pérez Ñandú');
    expect(() => toWinAnsi('漢字')).not.toThrow();
    expect(toWinAnsi('漢字')).toBe('??');
    expect(toWinAnsi('15 oct')).toBe('15 oct');
  });

  it('pdfText acota la longitud', () => {
    expect(pdfText('x'.repeat(500), 10)).toHaveLength(10);
  });

  it('sheetText neutraliza fórmulas (inyección CSV/DDE)', () => {
    expect(sheetText('=HYPERLINK("http://evil","x")')).toBe('\'=HYPERLINK("http://evil","x")');
    expect(sheetText('+57 300')).toBe("'+57 300");
    expect(sheetText('-1')).toBe("'-1");
    expect(sheetText('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(sheetText('Normal')).toBe('Normal');
  });

  it('maskDocument deja solo los 4 últimos dígitos', () => {
    expect(maskDocument('1020304050')).toBe('••••4050');
    expect(maskDocument('12')).toBe('••••');
    expect(maskDocument(undefined)).toBe('');
  });
});

describe('report-period', () => {
  const now = new Date('2026-10-09T12:00:00Z');

  it('convierte fechas de Colombia (UTC-5) a límites UTC', () => {
    const p = resolveReportPeriod('2026-09-01', '2026-09-30', now);
    expect(p.fromUtc.toISOString()).toBe('2026-09-01T05:00:00.000Z');
    expect(p.toUtcExclusive.toISOString()).toBe('2026-10-01T05:00:00.000Z');
  });

  it('rechaza fechas inexistentes, invertidas, futuras o períodos de más de un año', () => {
    expect(() => resolveReportPeriod('2026-02-30', '2026-03-01', now)).toThrow();
    expect(() => resolveReportPeriod('2026-09-10', '2026-09-01', now)).toThrow();
    expect(() => resolveReportPeriod('2026-10-01', '2026-10-20', now)).toThrow();
    expect(() => resolveReportPeriod('2024-01-01', '2026-01-01', now)).toThrow();
    expect(() => resolveReportPeriod("2026-01-01' OR 1=1", '2026-01-02', now)).toThrow();
  });

  it('hoy en Colombia usa UTC-5', () => {
    expect(todayInColombia(new Date('2026-10-09T03:00:00Z'))).toBe('2026-10-08');
  });
});

describe('report-legal-effect (niveles de formalidad)', () => {
  const base = { rteVigente: true, hasNit: true };

  it('informal / en proceso ⇒ siempre informativo, aunque haya firmas', () => {
    for (const state of ['informal', 'en_proceso']) {
      expect(
        computeLegalEffect({
          ...base,
          kind: 'donations',
          formalizationState: state,
          signerRoles: ['legal_representative', 'fiscal_reviewer'],
        }),
      ).toBe('informative');
    }
  });

  it('formal sin firma del representante legal ⇒ informativo', () => {
    expect(
      computeLegalEffect({
        ...base,
        kind: 'social_service',
        formalizationState: 'formalizada',
        signerRoles: [],
      }),
    ).toBe('informative');
  });

  it('ESAL con RTE + rep. legal + revisor fiscal o contador ⇒ certificado (donaciones)', () => {
    for (const second of ['fiscal_reviewer', 'accountant'] as const) {
      expect(
        computeLegalEffect({
          ...base,
          kind: 'donations',
          formalizationState: 'esal_rte',
          signerRoles: ['legal_representative', second],
        }),
      ).toBe('certified');
    }
  });

  it('ESAL con RTE solo con rep. legal, o sin RTE ⇒ firmado (no certificado)', () => {
    expect(
      computeLegalEffect({
        ...base,
        kind: 'donations',
        formalizationState: 'esal_rte',
        signerRoles: ['legal_representative'],
      }),
    ).toBe('signed');
    expect(
      computeLegalEffect({
        ...base,
        kind: 'donations',
        formalizationState: 'esal',
        signerRoles: ['legal_representative', 'fiscal_reviewer'],
      }),
    ).toBe('signed');
    expect(
      computeLegalEffect({
        ...base,
        kind: 'social_service',
        formalizationState: 'esal_rte',
        signerRoles: ['legal_representative', 'fiscal_reviewer'],
      }),
    ).toBe('signed');
  });

  it('firmantes por defecto: revisor fiscal antes que contador', () => {
    expect(
      defaultSignerRoles(
        'donations',
        new Set(['legal_representative', 'accountant', 'fiscal_reviewer']),
      ),
    ).toEqual(['legal_representative', 'fiscal_reviewer']);
    expect(
      defaultSignerRoles('donations', new Set(['legal_representative', 'accountant'])),
    ).toEqual(['legal_representative', 'accountant']);
    expect(
      defaultSignerRoles('social_service', new Set(['legal_representative', 'accountant'])),
    ).toEqual(['legal_representative']);
  });

  it('próximos pasos guían a formalizarse o a registrar firmas', () => {
    expect(
      nextStepsFor({
        formalizationState: 'informal',
        rteVigente: false,
        hasNit: false,
        registered: new Set(),
      })[0],
    ).toMatch(/Formaliza/);
    const steps = nextStepsFor({
      formalizationState: 'esal_rte',
      rteVigente: true,
      hasNit: true,
      registered: new Set(['legal_representative']),
    });
    expect(steps.join(' ')).toMatch(/revisor fiscal o del contador/);
  });
});

const breakdown = (net: number) => ({
  net,
  platformFee: 4000,
  platformIva: 760,
  gatewayFee: 3000,
  gatewayIva: 570,
});

function donationsPayload() {
  return buildDonationsPayload({
    organization: ORG,
    period: { start: '2026-09-01', end: '2026-09-30' },
    campaignNames: new Map([['c1', 'Cirugía de Luna']]),
    animalNames: new Map(),
    donations: [
      {
        id: 'b-donation',
        conceptKind: 'organization',
        conceptId: 'org',
        amountCharged: 100000,
        breakdown: breakdown(91670),
        payer: { fullName: 'María Restrepo', documentId: '1020304050' },
        anonymous: false,
        approvedAt: new Date('2026-09-10T15:00:00Z'),
        receiptId: 'abcdef12-0000',
        certificateCode: 'ADF-CERT-2026-000001',
      },
      {
        id: 'a-donation',
        conceptKind: 'campaign',
        conceptId: 'c1',
        amountCharged: 50000,
        breakdown: breakdown(41670),
        payer: { fullName: 'Secreto Real', documentId: '99999999' },
        anonymous: true,
        approvedAt: new Date('2026-09-05T15:00:00Z'),
      },
    ],
  });
}

describe('report-payloads', () => {
  it('donaciones: ordena, totaliza y nunca revela al donante anónimo', () => {
    const p = donationsPayload();
    expect(p.rows.map((r) => r.donor)).toEqual(['Donante anónimo', 'María Restrepo']);
    expect(JSON.stringify(p)).not.toContain('Secreto');
    expect(JSON.stringify(p)).not.toContain('99999999');
    expect(JSON.stringify(p)).not.toContain('1020304050');
    expect(p.rows[1].donorDocument).toBe('••••4050');
    expect(p.totals).toEqual({ count: 2, amountCharged: 150000, fees: 16660, net: 133340 });
    expect(p.byConcept[0]).toEqual({ concept: 'Donación general', count: 1, net: 91670 });
    expect(p.rows[0].concept).toBe('Campaña: Cirugía de Luna');
  });

  it('servicio social: solo horas aprobadas del período, filtros y faltantes', () => {
    const period = resolveReportPeriod(
      '2026-09-01',
      '2026-09-30',
      new Date('2026-10-09T12:00:00Z'),
    );
    const p = buildSocialServicePayload({
      organization: ORG,
      period: {
        start: period.startDate,
        end: period.endDate,
        fromUtc: period.fromUtc,
        toUtcExclusive: period.toUtcExclusive,
      },
      filters: { studentServiceOnly: true },
      minHours: 80,
      enrollments: [
        {
          id: 'e1',
          volunteerName: 'Juan Estudiante',
          opportunityTitle: 'Paseo de perros',
          appliesToStudentService: true,
          schoolName: 'Colegio San José',
          schoolAgreementCode: 'CV-1',
          hours: [
            { date: new Date('2026-09-02T15:00:00Z'), hours: 4, status: 'approved' },
            { date: new Date('2026-09-03T15:00:00Z'), hours: 2.5, status: 'approved' },
            { date: new Date('2026-09-04T15:00:00Z'), hours: 8, status: 'pending' },
            { date: new Date('2026-09-05T15:00:00Z'), hours: 3, status: 'rejected' },
            { date: new Date('2026-08-01T15:00:00Z'), hours: 70, status: 'approved' },
          ],
        },
        {
          id: 'e2',
          volunteerName: 'Voluntaria General',
          opportunityTitle: 'Limpieza',
          appliesToStudentService: false,
          schoolName: null,
          schoolAgreementCode: null,
          hours: [{ date: new Date('2026-09-02T15:00:00Z'), hours: 5, status: 'approved' }],
        },
        {
          id: 'e3',
          volunteerName: 'Sin Horas En Septiembre',
          opportunityTitle: 'Paseo',
          appliesToStudentService: true,
          schoolName: 'Colegio San José',
          schoolAgreementCode: null,
          hours: [{ date: new Date('2026-07-02T15:00:00Z'), hours: 5, status: 'approved' }],
        },
      ],
    });
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0]).toMatchObject({
      volunteerName: 'Juan Estudiante',
      hoursInPeriod: 6.5,
      hoursTotal: 76.5,
      pendingSessions: 1,
      missingHours: 3.5,
      status: 'En curso (faltan 3,5 h)',
    });
    expect(p.bySchool).toEqual([{ school: 'Colegio San José', volunteers: 1, hours: 6.5 }]);
  });
});

describe('report-seal', () => {
  it('el hash no depende del orden de las claves', () => {
    expect(sealHash({ a: 1, b: { c: 2, d: [1, 2] } })).toBe(
      sealHash({ b: { d: [1, 2], c: 2 }, a: 1 }),
    );
    expect(sealHash({ a: 1 })).not.toBe(sealHash({ a: 2 }));
  });

  it('el folio es no enumerable y cumple el patrón público', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateReportCode(2026)));
    expect(codes.size).toBe(200);
    for (const code of codes) expect(code).toMatch(REPORT_CODE_PATTERN);
  });
});

describe('render PDF / Excel', () => {
  const tinyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );

  it('dibuja un PDF multipágina con firmas aunque los textos traigan emojis', async () => {
    const payload = donationsPayload();
    // 120 filas ⇒ obliga a paginar la tabla de detalle.
    payload.rows = Array.from({ length: 120 }, (_, i) => ({
      ...payload.rows[i % 2],
      donor: `Donante 😀 ${i}`,
    }));
    const pdf = await renderReportPdf({
      code: 'ADF-REP-2026-ABCDEFGH',
      contentHash: 'a'.repeat(64),
      createdAt: new Date('2026-10-01T12:00:00Z'),
      legalEffect: 'certified',
      payload,
      signers: [
        {
          role: 'legal_representative',
          fullName: 'Rep 🖊 Legal',
          position: 'Representante legal',
          image: tinyPng,
        },
        {
          role: 'fiscal_reviewer',
          fullName: 'Revisora Fiscal',
          position: 'Revisora fiscal',
          image: Buffer.from('no-es-imagen'),
        },
      ],
      verifyUrl: 'http://localhost:5173/verificar/ADF-REP-2026-ABCDEFGH',
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBeGreaterThan(2);
  });

  it('el Excel guarda números reales y textos sin fórmulas', async () => {
    const payload = donationsPayload();
    payload.rows[1].donor = '=cmd|"/c calc"!A1';
    const bytes = await renderReportXlsx({
      code: 'ADF-REP-2026-ABCDEFGH',
      contentHash: 'b'.repeat(64),
      createdAt: new Date(),
      legalEffect: 'informative',
      payload,
      signers: [],
      verifyUrl: 'http://x/verificar/ADF-REP-2026-ABCDEFGH',
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    const sheet = wb.getWorksheet('Donaciones')!;
    expect(sheet.getRow(3).getCell(3).value).toBe('\'=cmd|"/c calc"!A1');
    expect(sheet.getRow(2).getCell(8).value).toBe(41670);
  });
});
