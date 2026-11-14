import {
  CUSTODY_BASE_TEMPLATE,
  CUSTODY_RECEIPT_NOTICE,
  custodyChargeSituation,
  renderCustodyClause,
  unknownCustodyVariables,
} from '@adoptafacil/contracts';
import { withLockedClauses } from './custody-contracts.service';
import {
  buildConsolidatedReport,
  buildContract,
  buildPaymentReceipt,
  buildReleaseRecord,
} from './custody-document-builders';
import { type CustodyPdfBlock, type CustodyPdfSpec, renderCustodyPdf } from './custody-pdf';
import { releaseSchema } from './custody.schemas';
import { addMonths } from './custody.util';

const organization = { name: 'Fundación de Prueba', nit: '900123456-7', address: 'Calle 1' };
const animal = {
  id: 'a'.repeat(36),
  code: 'AAAAAAAA',
  name: 'Canela',
  species: 'dog',
  sex: 'female',
};
const responsible = { fullName: 'Persona De Prueba', documentType: 'CC', documentNumber: '1000' };

function textOf(spec: CustodyPdfSpec): string {
  const parts: string[] = [spec.title, spec.subtitle ?? '', spec.footerNote ?? ''];
  const walk = (block: CustodyPdfBlock) => parts.push(JSON.stringify(block));
  spec.blocks.forEach(walk);
  return parts.join('\n');
}

describe('custody · situación de un cobro', () => {
  const base = { status: 'pending' as const, hasExtension: false, today: '2026-11-12' };

  it('distingue por vencer, vence hoy y vencido', () => {
    expect(custodyChargeSituation({ ...base, effectiveDueDate: '2026-11-20' }).situation).toBe(
      'upcoming',
    );
    expect(custodyChargeSituation({ ...base, effectiveDueDate: '2026-11-12' }).situation).toBe(
      'due_today',
    );
    expect(custodyChargeSituation({ ...base, effectiveDueDate: '2026-11-10' })).toEqual({
      situation: 'overdue',
      daysOverdue: 2,
    });
  });

  it('respeta los días de gracia solo sobre la fecha original', () => {
    expect(
      custodyChargeSituation({ ...base, effectiveDueDate: '2026-11-10', graceDays: 5 }).situation,
    ).toBe('upcoming');
    expect(
      custodyChargeSituation({
        ...base,
        effectiveDueDate: '2026-11-10',
        graceDays: 5,
        hasExtension: true,
      }).situation,
    ).toBe('extension_breached');
  });

  it('una prórroga vigente no es mora; pagado y anulado no alertan', () => {
    expect(
      custodyChargeSituation({ ...base, effectiveDueDate: '2026-11-30', hasExtension: true })
        .situation,
    ).toBe('extended');
    expect(
      custodyChargeSituation({ ...base, status: 'paid', effectiveDueDate: '2020-01-01' }).situation,
    ).toBe('paid');
    expect(
      custodyChargeSituation({ ...base, status: 'cancelled', effectiveDueDate: '2020-01-01' })
        .situation,
    ).toBe('cancelled');
  });
});

describe('custody · cláusulas y plantilla', () => {
  it('reemplaza variables conocidas y deja las desconocidas a la vista', () => {
    expect(
      renderCustodyClause('Cuidar a {{animal}} por {{ valor_mensual }}.', {
        animal: 'Canela',
        valor_mensual: '$350.000',
      }),
    ).toBe('Cuidar a Canela por $350.000.');
    expect(unknownCustodyVariables('{{animal}} y {{inventada}}')).toEqual(['inventada']);
  });

  it('la cláusula que separa la deuda del animal no se puede quitar ni reescribir', () => {
    const locked = CUSTODY_BASE_TEMPLATE.clauses.find((c) => c.locked)!;
    const without = withLockedClauses([
      { id: 'x', title: 'X', body: 'Texto', enabled: true, locked: true },
    ]);
    expect(without.find((c) => c.id === 'x')?.locked).toBeUndefined();
    expect(without.find((c) => c.id === locked.id)).toMatchObject({
      body: locked.body,
      enabled: true,
    });
    const tampered = withLockedClauses([
      { ...locked, body: 'Se retiene por mora.', enabled: false },
    ]);
    expect(tampered).toEqual([{ ...locked, enabled: true, locked: true }]);
  });

  it('la plantilla base no retiene al animal por deuda ni lo entrega de forma automática', () => {
    const text = CUSTODY_BASE_TEMPLATE.clauses
      .map((c) => c.body)
      .join('\n')
      .toLowerCase();
    expect(text).not.toMatch(/derecho de retenci[oó]n/);
    expect(text).not.toContain('automáticamente');
    expect(
      CUSTODY_BASE_TEMPLATE.clauses.every((c) => unknownCustodyVariables(c.body).length === 0),
    ).toBe(true);
  });
});

describe('custody · documentos', () => {
  it('la constancia de pago dice que no es una factura electrónica', () => {
    const spec = buildPaymentReceipt({
      organization,
      animal,
      responsible,
      charge: {
        concept: 'boarding_fee',
        description: 'Mensualidad',
        amountCop: 350000,
        dueDate: '2026-11-05',
      },
      payment: {
        receiptNumber: 'RP-2026-000001',
        amountCop: 100000,
        paidOn: '2026-11-06',
        method: 'transfer',
        receivedByName: 'Equipo',
      },
      balanceAfterCop: 250000,
      hasProof: false,
    });
    const text = textOf(spec);
    expect(spec.title).toBe('Constancia de recepción de pago');
    expect(text).toContain(CUSTODY_RECEIPT_NOTICE);
    expect(spec.title.toLowerCase()).not.toContain('factura');
  });

  it('el acta de salida anota el saldo como información y no como condición', () => {
    const spec = buildReleaseRecord({
      organization,
      animal,
      code: 'SAL-1',
      release: {
        id: 'r',
        animalId: animal.id,
        releaseType: 'return_to_responsible',
        releasedAt: '2026-11-10T15:00:00.000Z',
        receivedByName: 'Persona De Prueba',
        conditionAtRelease: 'Sin novedades visibles.',
        deliveredByName: 'Equipo',
        outstandingBalanceCop: 450000,
        isRetrospective: false,
        createdAt: '2026-11-10T15:00:00.000Z',
      },
    });
    expect(textOf(spec)).toContain('no depende del pago');
  });

  it('el contrato omite lo que no está registrado y renderiza un PDF paginado', async () => {
    const spec = buildContract({
      organization,
      animal,
      responsible,
      contract: {
        number: 'GC-2026-0001',
        representative: {
          fullName: 'Representante',
          documentType: 'CC',
          documentNumber: '2000',
          position: 'Representante legal',
        },
        startDate: '2026-11-01',
        monthlyFeeCop: 350000,
        paymentFrequency: 'monthly',
        graceDays: 0,
        pickupDays: 10,
        noticeDays: 8,
        clauses: CUSTODY_BASE_TEMPLATE.clauses,
        annexes: CUSTODY_BASE_TEMPLATE.annexes,
      },
      draft: true,
    });
    const text = textOf(spec);
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('{{');
    const pdf = await renderCustodyPdf(spec);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2000);
  });

  it('el consolidado de 1.200 animales sale en un solo PDF', async () => {
    const rows = Array.from({ length: 1200 }, (_, i) => ({
      id: `id-${i}`,
      code: `C${i}`,
      name: `Animal ${i}`,
      species: 'dog',
      sex: 'male',
      ageLabel: '2 años',
      status: 'available',
      isActive: true,
      intakeDate: '2026-01-01',
      intakeDateSource: 'system_record' as const,
      custodyStatus: 'not_registered' as const,
    }));
    const pdf = await renderCustodyPdf(
      buildConsolidatedReport({
        organization,
        rows,
        photos: new Map(),
        filterLabels: ['Especie: Perro'],
        total: rows.length,
        truncated: false,
        photosOmitted: true,
      }),
    );
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  }, 60_000);
});

describe('custody · reglas de validación', () => {
  const release = {
    releaseType: 'handover_to_authority',
    releasedAt: '2026-11-10T15:00:00.000Z',
    receivedByName: 'Funcionario',
    conditionAtRelease: 'Sin novedades visibles.',
    deliveredByName: 'Equipo',
    authorityName: 'Autoridad de prueba',
    authorityBasis: 'Procedimiento revisado por la organización.',
  };

  it('entregar a una autoridad exige confirmar la revisión humana', () => {
    expect(releaseSchema.safeParse(release).success).toBe(false);
    expect(releaseSchema.safeParse({ ...release, humanReviewConfirmed: true }).success).toBe(true);
  });

  it('un registro retrospectivo exige la procedencia de la información', () => {
    const base = { ...release, releaseType: 'adoption', isRetrospective: true };
    expect(releaseSchema.safeParse(base).success).toBe(false);
    expect(
      releaseSchema.safeParse({ ...base, retrospectiveSource: 'Acta en papel de marzo' }).success,
    ).toBe(true);
  });

  it('suma meses sin salirse del mes', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-11-15', 2)).toBe('2027-01-15');
  });
});
