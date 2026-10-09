import { describe, expect, it } from 'vitest';
import {
  buildAdoptionContractDocument,
  type AdoptionContractDocument,
  type AdoptionContractPayload,
  type AdoptionContractSigner,
} from '../src';

const base: AdoptionContractPayload = {
  requestId: 'req-1',
  organizationId: 'org-1',
  animalId: 'animal-1',
  animal: { animalId: 'animal-1', name: 'Luna', species: 'dog' },
  applicant: { fullName: 'Ana Pérez', email: 'ana@example.com', phone: '3001234567' },
  applicableLaws: ['Ley 527/1999', 'Ley 1581/2012'],
  terms: '',
  data: { followUpMonths: 12, organizationName: 'Fundación Huellitas', signatureCity: 'Medellín' },
};

const signers: AdoptionContractSigner[] = [
  {
    id: 's1',
    role: 'organization_representative',
    fullName: 'María Gómez',
    email: 'maria@huellitas.org',
  },
  { id: 's2', role: 'adopter', fullName: 'Ana Pérez', email: 'ana@example.com' },
];

function fullText(doc: AdoptionContractDocument): string {
  return doc.sections
    .flatMap((s) => [
      s.heading,
      ...s.blocks.map((b) =>
        b.kind === 'fields'
          ? b.fields.map((f) => `${f.label}: ${f.value}`).join('\n')
          : b.kind === 'clause'
            ? `${b.title}: ${b.text}`
            : b.text,
      ),
    ])
    .join('\n');
}

describe('buildAdoptionContractDocument', () => {
  it('sin templateVersion renderiza el texto v1 LITERAL (contratos ya firmados)', () => {
    const doc = buildAdoptionContractDocument(base, signers);
    expect(doc.templateVersion).toBe('v1');
    expect(fullText(doc)).toContain('Cedente/Entregante: Adopta Fácil');
    expect(fullText(doc)).toContain('renunciando a otro fuero');
  });

  it('v2 nombra a la organización como cedente y a AdoptaFácil como no-parte', () => {
    const text = fullText(
      buildAdoptionContractDocument({ ...base, templateVersion: 'v2' }, signers),
    );
    expect(text).toContain('EL CEDENTE: Fundación Huellitas');
    expect(text).toContain('representada en este acto por María Gómez');
    expect(text).toContain('AdoptaFácil actúa únicamente como plataforma tecnológica');
    expect(text).not.toContain('Adopta Fácil (organización');
    expect(text).not.toContain('renunciando a otro fuero');
  });

  it('v2 cita el marco legal vigente (Ley 1774, 2455, C. Civil, conciliación)', () => {
    const text = fullText(
      buildAdoptionContractDocument({ ...base, templateVersion: 'v2' }, signers),
    );
    for (const ref of [
      'Ley 1774 de 2016',
      'Ley 2455 de 2025',
      'arts. 43 num. 12 y 50A',
      'art. 1483',
      'art. 2353',
      'Ley 2220 de 2022',
      'Ley 527 de 1999',
      'Ley 1581 de 2012',
      'Ley 2054 de 2020',
    ]) {
      expect(text).toContain(ref);
    }
    expect(text).toContain('En ningún caso el cedente recuperará el animal por la fuerza');
  });

  it('plan ligero por defecto (1, 4 y 12 meses) y acompañado con 15 días', () => {
    const light = fullText(buildAdoptionContractDocument({ ...base, templateVersion: 'v2' }));
    expect(light).toContain('plan ligero');
    expect(light).toContain('al mes, a los cuatro (4) meses y a los doce (12) meses');
    const standard = fullText(
      buildAdoptionContractDocument({
        ...base,
        templateVersion: 'v2',
        data: { ...base.data, followUpPlan: 'standard' },
      }),
    );
    expect(standard).toContain('plan acompañado');
    expect(standard).toContain('a los quince (15) días');
  });

  it('cláusulas condicionales: prueba, cuidador, esterilización, edad mínima, responsable', () => {
    const plain = fullText(
      buildAdoptionContractDocument({ ...base, templateVersion: 'v2' }, signers),
    );
    expect(plain).not.toContain('SEMANA DE PRUEBA');
    expect(plain).not.toContain('CUIDADOR DE RESPALDO');
    expect(plain).not.toContain('RESPONSABLE FIRMANTE');

    const full = fullText(
      buildAdoptionContractDocument(
        {
          ...base,
          templateVersion: 'v2',
          data: {
            ...base.data,
            trialPeriodDays: 7,
            backupCaregiverName: 'Luis Pérez',
            backupCaregiverPhone: '3109876543',
            backupCaregiverInformed: true,
            animalSterilized: false,
            sterilizationCommitmentMonths: 6,
            minimumSignerAge: 25,
            identityDocumentVerified: true,
            animalIdentificationType: 'microchip',
            animalIdentificationNumber: '900123456789012',
          },
        },
        [...signers, { id: 's3', role: 'co_adopter', fullName: 'Pedro Pérez', email: 'p@x.co' }],
      ),
    );
    expect(full).toContain('periodo de prueba de 7 días');
    expect(full).toContain('comodato, Código Civil art. 2200');
    expect(full).toContain('cuidador de respaldo a Luis Pérez, celular 3109876543');
    expect(full).toContain('informó al cuidador de respaldo y obtuvo su autorización');
    expect(full).toContain('esterilizar al animal dentro de los 6 meses');
    expect(full).toContain('edad mínima de 25 años');
    expect(full).toContain('verificó la identidad y la edad con el documento original');
    expect(full).toContain('Microchip nº 900123456789012');
    expect(full).toContain('RESPONSABLE FIRMANTE: Pedro Pérez');
    expect(full).toContain('art. 1568');
  });

  it('los datos faltantes se ven como ______, nunca como "undefined"', () => {
    const text = fullText(
      buildAdoptionContractDocument({
        ...base,
        templateVersion: 'v2',
        data: { followUpMonths: 12 },
      }),
    );
    expect(text).toContain('EL CEDENTE: ______');
    expect(text).not.toMatch(/undefined|null|NaN/);
  });

  it('numera las cláusulas en orden sin saltos', () => {
    const doc = buildAdoptionContractDocument({ ...base, templateVersion: 'v2' }, signers);
    const headings = doc.sections.map((s) => s.heading).filter((h) => h.startsWith('CLÁUSULA'));
    expect(headings[0]).toMatch(/^CLÁUSULA PRIMERA\. OBJETO/);
    expect(headings[1]).toMatch(/^CLÁUSULA SEGUNDA\./);
    expect(new Set(headings).size).toBe(headings.length);
  });
});
