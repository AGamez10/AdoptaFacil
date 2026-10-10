import type { AdoptionContractPayload, AdoptionContractSigner } from '@adoptafacil/contracts';
import { pdfSafe, renderAdoptionContractPdf } from './adoption-contract-pdf';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

const payload: AdoptionContractPayload = {
  requestId: 'r',
  organizationId: 'o',
  animalId: 'a',
  animal: { animalId: 'a', name: 'Luna 🐶', species: 'dog' },
  applicant: { fullName: 'Ana\u0000 Pérez', email: 'ana@example.com' },
  applicableLaws: ['Ley 527/1999', 'Ley 1581/2012'],
  terms: '',
  templateVersion: 'v2',
  data: {
    followUpMonths: 12,
    organizationName: 'Fundación 你好 Huellitas',
    // Un estado de salud muy largo y una palabra larguísima no deben salirse
    // de la caja ni romper la generación.
    healthStatusAtDelivery: `${'Vacunado y desparasitado. '.repeat(60)}${'x'.repeat(300)}`,
  },
};

const signers: AdoptionContractSigner[] = [
  {
    id: 's1',
    role: 'organization_representative',
    fullName: 'María Gómez',
    email: 'm@o.org',
    signedAt: '2026-10-08T15:00:00.000Z',
  },
  {
    id: 's2',
    role: 'adopter',
    fullName: 'Ana Pérez',
    email: 'ana@example.com',
    signedAt: '2026-10-08T16:00:00.000Z',
  },
  { id: 's3', role: 'co_adopter', fullName: 'Pedro Pérez', email: 'p@x.co' },
];

describe('pdfSafe', () => {
  it('conserva el español y los signos tipográficos de WinAnsi', () => {
    expect(pdfSafe('Cláusula “única” — ñandú, 50 €')).toBe('Cláusula “única” — ñandú, 50 €');
  });
  it('quita controles y reemplaza lo que la fuente no puede dibujar', () => {
    expect(pdfSafe('a\u0000b\u0007c')).toBe('abc');
    expect(pdfSafe('línea1\nlínea2')).toBe('línea1 línea2');
    expect(pdfSafe('perro 🐶 你')).toBe('perro ? ?');
  });
});

describe('renderAdoptionContractPdf', () => {
  it('genera un PDF válido aun con emoji, otros alfabetos, controles y textos largos', async () => {
    const pdf = await renderAdoptionContractPdf({
      payload,
      signers,
      signatureImages: { s1: PNG, s2: Buffer.from('no es una imagen'), s3: null },
      contractId: '0f9b6c1e-0000-4000-8000-000000000000',
      status: 'pending_signatures',
    });
    expect(pdf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(5000);
  });

  it('renderiza también contratos v1 (sin templateVersion)', async () => {
    const pdf = await renderAdoptionContractPdf({
      payload: { ...payload, templateVersion: undefined },
      signers: signers.slice(0, 2),
      signatureImages: { s1: PNG, s2: PNG },
      status: 'signed',
      contentHash: 'a'.repeat(64),
    });
    expect(pdf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  });
});
