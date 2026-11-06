import type { OrganizationQr, UpdateOrganizationQrTargetInput } from '@adoptafacil/contracts';
import type { ApiClient } from '../../../shell/api';

/** El QR fijo de la propia organización (Owner/Administrator/Operator). */
export function getOwnOrganizationQr(client: ApiClient): Promise<OrganizationQr> {
  return client.request<OrganizationQr>('/org/qr');
}

/** Cambia a dónde lleva el QR (Owner/Administrator). El código no cambia. */
export function updateOrganizationQrTarget(
  client: ApiClient,
  input: UpdateOrganizationQrTargetInput,
): Promise<OrganizationQr> {
  return client.request<OrganizationQr>('/org/qr/target', { method: 'PUT', json: input });
}
