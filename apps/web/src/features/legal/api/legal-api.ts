import type {
  AcceptLegalDocumentsInput,
  LegalDocumentKey,
  LegalStatus,
} from '@adoptafacil/contracts';
import type { ApiClient } from '../../../shell/api';

/** Estado legal del usuario autenticado: qué falta aceptar y su historial. */
export function fetchLegalStatus(client: ApiClient): Promise<LegalStatus> {
  return client.request<LegalStatus>('/legal/me');
}

export function acceptLegalDocuments(
  client: ApiClient,
  input: AcceptLegalDocumentsInput,
): Promise<LegalStatus> {
  return client.request<LegalStatus>('/legal/me/acceptances', { method: 'POST', json: input });
}

export function revokeLegalDocument(
  client: ApiClient,
  key: LegalDocumentKey,
): Promise<LegalStatus> {
  return client.request<LegalStatus>('/legal/me/revocations', { method: 'POST', json: { key } });
}
