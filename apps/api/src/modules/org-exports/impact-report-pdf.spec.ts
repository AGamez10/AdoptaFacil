import { PDFDocument } from 'pdf-lib';
import type { ImpactReportPayload } from '../reports/report-payloads';
import { renderReportPdf } from '../reports/report-pdf';
import { renderReportXlsx } from '../reports/report-xlsx';
import { computeLegalEffect, defaultSignerRoles } from '../reports/report-legal-effect';

const base: ImpactReportPayload = {
  version: 1,
  kind: 'impact',
  organization: {
    name: 'Refugio 🐾 Patitas',
    city: 'Medellín',
    nit: null,
    formalizationState: 'esal_rte',
  } as unknown as ImpactReportPayload['organization'],
  period: { start: '2026-01-01', end: '2026-09-30' },
  animalsRegistered: 42,
  adoptionsCompleted: 17,
  donations: { count: 120, netTotal: 4_250_000, donors: 85 },
  care: { vaccines: 60, sterilizations: 25, surgeries: 4, treatments: 33 },
  volunteerHours: 310.5,
  volunteers: 12,
  campaigns: [
    {
      title: 'Cirugía de Luna 🐶',
      category: 'surgeries',
      status: 'active',
      goalAmount: 800_000,
      raisedAmount: 650_000,
    },
  ],
  animalsToday: { available: 20, inProcess: 3, adopted: 140 },
};

const sealed = (payload: ImpactReportPayload) => ({
  code: 'ADF-REP-2026-ABCD1234',
  contentHash: 'a'.repeat(64),
  createdAt: new Date('2026-10-20T15:00:00Z'),
  legalEffect: 'informative' as const,
  payload,
  signers: [],
  verifyUrl: 'https://adoptafacil.org/verificar/ADF-REP-2026-ABCD1234',
});

describe('reporte de impacto sellado', () => {
  it('dibuja un PDF válido con folio y título, aunque los textos traigan emojis', async () => {
    const pdf = await PDFDocument.load(await renderReportPdf(sealed(base)));
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(pdf.getTitle()).toContain('Reporte de impacto');
    expect(pdf.getTitle()).toContain('ADF-REP-2026-ABCD1234');
  });

  it('una organización sin datos también obtiene su PDF', async () => {
    const empty: ImpactReportPayload = {
      ...base,
      animalsRegistered: 0,
      adoptionsCompleted: 0,
      donations: { count: 0, netTotal: 0, donors: 0 },
      care: { vaccines: 0, sterilizations: 0, surgeries: 0, treatments: 0 },
      volunteerHours: 0,
      volunteers: 0,
      campaigns: [],
      animalsToday: { available: 0, inProcess: 0, adopted: 0 },
    };
    const pdf = await PDFDocument.load(await renderReportPdf(sealed(empty)));
    expect(pdf.getPageCount()).toBeLessThanOrEqual(2);
  });

  it('muchas campañas no desbordan: la tabla se acota', async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      ...base.campaigns[0],
      title: `Campaña ${i}`,
    }));
    const pdf = await PDFDocument.load(await renderReportPdf(sealed({ ...base, campaigns: many })));
    expect(pdf.getPageCount()).toBeLessThanOrEqual(3);
  });

  it('también sale en Excel', async () => {
    const xlsx = await renderReportXlsx(sealed(base));
    expect(xlsx.length).toBeGreaterThan(1000);
  });

  it('es siempre informativo y nunca pide firmantes', () => {
    expect(
      computeLegalEffect({
        kind: 'impact',
        formalizationState: 'esal_rte',
        rteVigente: true,
        hasNit: true,
        signerRoles: ['legal_representative', 'fiscal_reviewer'],
      }),
    ).toBe('informative');
    expect(defaultSignerRoles('impact', new Set(['legal_representative', 'accountant']))).toEqual(
      [],
    );
  });
});
