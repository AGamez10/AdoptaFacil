import { PDFDocument } from 'pdf-lib';
import { renderImpactReportPdf, type ImpactReportData } from './impact-report-pdf';

const base: ImpactReportData = {
  organization: { name: 'Refugio 🐾 Patitas', city: 'Medellín' },
  period: { start: '2026-01-01', end: '2026-09-30' },
  generatedAt: new Date('2026-10-20T15:00:00Z'),
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
  portalUrl: 'https://adoptafacil.org/o/patitas',
};

describe('impact-report-pdf (reporte de impacto)', () => {
  it('dibuja un PDF válido aunque los textos traigan emojis', async () => {
    const pdf = await PDFDocument.load(await renderImpactReportPdf(base));
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(pdf.getTitle()).toBe('Reporte de impacto · Refugio ? Patitas');
  });

  it('una organización sin datos, sin ciudad ni portal también obtiene su PDF', async () => {
    const empty: ImpactReportData = {
      ...base,
      organization: { name: 'Rescatista nueva' },
      animalsRegistered: 0,
      adoptionsCompleted: 0,
      donations: { count: 0, netTotal: 0, donors: 0 },
      care: { vaccines: 0, sterilizations: 0, surgeries: 0, treatments: 0 },
      volunteerHours: 0,
      volunteers: 0,
      campaigns: [],
      animalsToday: { available: 0, inProcess: 0, adopted: 0 },
      portalUrl: undefined,
    };
    const pdf = await PDFDocument.load(await renderImpactReportPdf(empty));
    expect(pdf.getPageCount()).toBe(1);
  });

  it('muchas campañas no desbordan: la tabla se acota y pasa de página si hace falta', async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      ...base.campaigns[0],
      title: `Campaña ${i}`,
    }));
    const pdf = await PDFDocument.load(await renderImpactReportPdf({ ...base, campaigns: many }));
    expect(pdf.getPageCount()).toBeLessThanOrEqual(3);
  });
});
