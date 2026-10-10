import { ConflictException } from '@nestjs/common';
import type { DonationsReportPayload } from './report-payloads';

/**
 * Bloqueo de datos de terceros en reportes sellados.
 *
 * Requisito explícito: no se puede usar el nombre ni el documento de un donante,
 * adoptante o voluntario en un documento emitido sin su consentimiento. El
 * registro de ese consentimiento todavía no existe, así que hasta que se
 * implemente (PR siguiente) el sistema NO emite documentos con datos de terceros:
 *  - donaciones: se emiten sin identificar al donante (solo el monto y el concepto);
 *  - servicio social: se rechaza, porque cada fila es una persona identificada.
 *
 * TODO(client): al implementar el registro de consentimiento, `CONSENT_REGISTRY`
 * pasa a consultarse por persona y estos dos pasos solo filtran a quienes no
 * hayan consentido.
 */
export const THIRD_PARTY_CONSENT_REGISTRY_AVAILABLE = false;

export const THIRD_PARTY_BLOCKED_MESSAGE =
  'Este reporte identifica a personas (voluntarios) y aún no hay registro de su consentimiento para usar sus datos en un documento emitido. Por seguridad no se emite hasta que exista.';

export function redactDonationDonors(payload: DonationsReportPayload): DonationsReportPayload {
  if (THIRD_PARTY_CONSENT_REGISTRY_AVAILABLE) return payload;
  return {
    ...payload,
    rows: payload.rows.map((r) => ({
      ...r,
      donor: r.donor === 'Donante anónimo' ? r.donor : 'Donante',
      donorDocument: '',
    })),
  };
}

export function assertNoIdentifiedPeople(rowCount: number): void {
  if (THIRD_PARTY_CONSENT_REGISTRY_AVAILABLE) return;
  if (rowCount > 0) throw new ConflictException(THIRD_PARTY_BLOCKED_MESSAGE);
}
