import { DocumentType, FormalizationState } from '@adoptafacil/contracts';
import {
  buildVerificationReport,
  extractNit,
  parseSpanishDate,
  type VerificationContext,
} from './document-checks';
import { nitCheckDigit } from './nit';

const NOW = new Date('2026-10-08T15:00:00Z');
const NIT = '900123456';
const DV = String(nitCheckDigit(NIT));

const ctx = (over: Partial<VerificationContext> = {}): VerificationContext => ({
  profileNit: `${NIT}-${DV}`,
  legalName: 'Fundación Huellitas del Valle',
  organizationName: 'Huellitas',
  currentState: FormalizationState.Formalizada,
  legalRepresentative: { fullName: 'María Pérez Gómez', documentNumber: '52.345.678' },
  now: NOW,
  ...over,
});

// Texto como lo devuelve la capa de texto de un RUT: el NIT en casillas.
const RUT_RTE = `Formulario del Registro Único Tributario Hoja Principal 001
5. Número de Identificación Tributaria (NIT) 6. DV
${NIT.split('').join(' ')} ${DV}
24. Tipo de contribuyente Persona jurídica
35. Razón social FUNDACION HUELLITAS DEL VALLE
53. Responsabilidades, Calidades y Atributos
04- Impto. renta y compl. régimen especial
Fecha generación documento PDF: 01-10-2026 10:12:13AM`;

const CERL = `CAMARA DE COMERCIO DE CALI
CERTIFICADO DE EXISTENCIA Y REPRESENTACIÓN LEGAL DE ENTIDADES SIN ÁNIMO DE LUCRO
Fecha expedición: 2 de octubre de 2026
Nombre: FUNDACIÓN HUELLITAS DEL VALLE
Nit: ${NIT.slice(0, 3)}.${NIT.slice(3, 6)}.${NIT.slice(6)}-${DV}
Estado de la inscripción: ACTIVA
Último año renovado: 2026
REPRESENTANTE LEGAL: MARÍA PÉREZ GÓMEZ C.C. 52345678
Código de verificación: ABC123XYZ`;

const doc = (type: DocumentType) => ({ id: 'd1', organizationId: 'o1', type });

describe('verificación automática de documentos', () => {
  it('lee fechas en los formatos de la DIAN y las Cámaras', () => {
    expect(parseSpanishDate('01-10-2026 10:12')?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(parseSpanishDate('2 de octubre de 2026')?.toISOString()).toBe(
      '2026-10-02T00:00:00.000Z',
    );
    expect(parseSpanishDate('2026/10/03')?.toISOString()).toBe('2026-10-03T00:00:00.000Z');
    expect(parseSpanishDate('sin fecha')).toBeNull();
  });

  it('encuentra el NIT con puntos o en casillas', () => {
    expect(extractNit(CERL)).toEqual({ base: NIT, dv: DV });
    expect(extractNit(RUT_RTE)).toEqual({ base: NIT, dv: DV });
  });

  it('un RUT en régimen especial pasa todo y propone ESAL con RTE', () => {
    const report = buildVerificationReport(doc(DocumentType.Rut), RUT_RTE, ctx());
    expect(report.checks.filter((c) => c.result !== 'pass')).toEqual([]);
    expect(report.suggestion).toBe('approve');
    expect(report.suggestedState).toBe(FormalizationState.ESAL_RTE);
    expect(report.fields.map((f) => f.key)).toEqual([
      'nit',
      'taxpayer_type',
      'regime',
      'generated_at',
    ]);
  });

  it('un RUT en régimen ordinario no propone RTE y lo advierte', () => {
    const text = RUT_RTE.replace(
      '04- Impto. renta y compl. régimen especial',
      '05- Impto. renta y compl. régimen ordinario',
    );
    const report = buildVerificationReport(doc(DocumentType.Rut), text, ctx());
    expect(report.checks.find((c) => c.id === 'rte')?.result).toBe('warn');
    expect(report.suggestedState).toBeUndefined();
    expect(report.suggestion).toBe('approve');
  });

  it('un NIT distinto al del perfil sugiere observar con el motivo listo', () => {
    const report = buildVerificationReport(
      doc(DocumentType.Rut),
      RUT_RTE,
      ctx({ profileNit: '800197268-4' }),
    );
    expect(report.suggestion).toBe('observe');
    expect(report.suggestedNote).toContain('800197268-4');
    expect(report.suggestedState).toBeUndefined();
  });

  it('un DV inválido falla', () => {
    const bad = String((Number(DV) + 1) % 10);
    const text = CERL.replace(`-${DV}`, `-${bad}`);
    const report = buildVerificationReport(
      doc(DocumentType.ExistenceRepresentationCertificate),
      text,
      ctx(),
    );
    expect(report.checks.find((c) => c.id === 'nit_dv')?.result).toBe('fail');
  });

  it('un RUT viejo se advierte pero no bloquea', () => {
    const report = buildVerificationReport(
      doc(DocumentType.Rut),
      RUT_RTE,
      ctx({ now: new Date('2027-01-15T00:00:00Z') }),
    );
    expect(report.checks.find((c) => c.id === 'fresh')?.result).toBe('warn');
  });

  it('el certificado de Cámara de una ESAL activa propone ESAL', () => {
    const report = buildVerificationReport(
      doc(DocumentType.ExistenceRepresentationCertificate),
      CERL,
      ctx(),
    );
    expect(report.checks.filter((c) => c.result !== 'pass')).toEqual([]);
    expect(report.suggestedState).toBe(FormalizationState.ESAL);
    expect(report.fields.find((f) => f.key === 'verification_code')?.value).toBe('ABC123XYZ');
  });

  it('una entidad en liquidación falla', () => {
    const text = CERL.replace('ACTIVA', 'EN LIQUIDACIÓN');
    const report = buildVerificationReport(
      doc(DocumentType.ExistenceRepresentationCertificate),
      text,
      ctx(),
    );
    expect(report.checks.find((c) => c.id === 'active')?.result).toBe('fail');
    expect(report.suggestion).toBe('observe');
  });

  it('un representante legal distinto falla', () => {
    const report = buildVerificationReport(
      doc(DocumentType.ExistenceRepresentationCertificate),
      CERL,
      ctx({ legalRepresentative: { fullName: 'Juan Gómez', documentNumber: '1010101010' } }),
    );
    expect(report.checks.find((c) => c.id === 'legal_rep')?.result).toBe('fail');
  });

  it('un archivo que no es lo que dice falla en el tipo', () => {
    const report = buildVerificationReport(doc(DocumentType.Rut), CERL, ctx());
    expect(report.checks.find((c) => c.id === 'kind')?.result).toBe('fail');
    expect(report.suggestion).toBe('observe');
  });

  it('un escaneo sin texto pasa a revisión manual', () => {
    const report = buildVerificationReport(doc(DocumentType.Rut), null, ctx());
    expect(report).toMatchObject({ method: 'none', suggestion: 'manual', checks: [] });
    expect(report.links.length).toBeGreaterThan(0);
  });
});
