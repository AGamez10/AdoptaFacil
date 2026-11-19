import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_RULES,
  DocumentType,
  FORMALIZATION_REQUIRED_CODE,
  FormalizationState,
  OrganizationCapability,
  formalizationRequiredError,
  isCapabilityEnabled,
  rteReminderStage,
  rteValidUntilFrom,
} from '../src';

const S = FormalizationState;
const C = OrganizationCapability;

describe('matriz estado formal → funciones', () => {
  it('vender en la tienda se habilita desde Formalizada, no antes', () => {
    expect(isCapabilityEnabled(C.MarketplaceSales, S.Informal, false)).toBe(false);
    expect(isCapabilityEnabled(C.MarketplaceSales, S.EnProceso, false)).toBe(false);
    expect(isCapabilityEnabled(C.MarketplaceSales, S.Formalizada, false)).toBe(true);
    expect(isCapabilityEnabled(C.MarketplaceSales, S.ESAL_RTE, false)).toBe(true);
  });

  it('lo que protege al animal y el recaudo quedan para todos, también informales', () => {
    for (const capability of [
      C.PublicPortal,
      C.AdoptionContracts,
      C.ReceiveDonations,
      C.FundraisingCampaigns,
      C.Sponsorships,
      C.DonationReceipt,
      C.VolunteerConstancy,
    ]) {
      expect(isCapabilityEnabled(capability, S.Informal, false)).toBe(true);
    }
  });

  it('una ESAL con RTE vencido se trata como ESAL', () => {
    expect(isCapabilityEnabled(C.DonationTaxCertificate, S.ESAL_RTE, true)).toBe(true);
    expect(isCapabilityEnabled(C.DonationTaxCertificate, S.ESAL_RTE, false)).toBe(false);
  });
});

describe('formalizationRequiredError', () => {
  it('dice el estado que falta y los documentos para llegar a él', () => {
    const body = formalizationRequiredError(C.MarketplaceSales, S.Informal);
    expect(body).toEqual({
      code: FORMALIZATION_REQUIRED_CODE,
      capability: C.MarketplaceSales,
      currentState: S.Informal,
      requiredState: S.Formalizada,
      requiredDocuments: [DocumentType.Rut, DocumentType.ExistenceRepresentationCertificate],
      message: expect.stringContaining('Formalizada'),
    });
  });

  it('usa el primer estado de cada regla de la matriz', () => {
    for (const rule of CAPABILITY_RULES) {
      expect(formalizationRequiredError(rule.capability, S.Informal).requiredState).toBe(
        rule.minState,
      );
    }
  });
});

describe('reverificación anual del RTE', () => {
  it('vale hasta el próximo 30 de junio, fin del día en Colombia', () => {
    expect(rteValidUntilFrom(new Date('2026-11-15T12:00:00Z')).toISOString()).toBe(
      '2027-07-01T04:59:59.000Z',
    );
    expect(rteValidUntilFrom(new Date('2027-03-01T12:00:00Z')).toISOString()).toBe(
      '2027-07-01T04:59:59.000Z',
    );
    // Aprobado justo después del plazo (1 de julio en Colombia): al año siguiente.
    expect(rteValidUntilFrom(new Date('2027-07-01T05:00:00Z')).toISOString()).toBe(
      '2028-07-01T04:59:59.000Z',
    );
  });

  it('avisa a 60 y a 30 días; vencido o lejos, no', () => {
    const until = new Date('2027-07-01T04:59:59Z');
    const daysBefore = (n: number) => new Date(until.getTime() - n * 24 * 60 * 60 * 1000);
    expect(rteReminderStage(until, daysBefore(90))).toBeNull();
    expect(rteReminderStage(until, daysBefore(60))).toBe(60);
    expect(rteReminderStage(until, daysBefore(45))).toBe(60);
    expect(rteReminderStage(until, daysBefore(30))).toBe(30);
    expect(rteReminderStage(until, daysBefore(1))).toBe(30);
    expect(rteReminderStage(until, daysBefore(-1))).toBeNull();
  });
});
