import type {
  AdoptionContract,
  AdoptionDelivery,
  AdoptionDeliveryCodeIssued,
  AdoptionDeliveryPhotoTarget,
  StartAdoptionDeliveryInput,
  AdoptionFollowUpMilestone,
  AdoptionRequest,
  CreateAdoptionRequestInput,
  GenerateAdoptionContractInput,
  ScheduleFollowUpMilestoneInput,
  SignAdoptionContractInput,
  SubmitFollowUpInput,
  TransitionAdoptionContractInput,
  TransitionAdoptionRequestInput,
  UpdateAdoptionContractDataInput,
} from '@adoptafacil/contracts';
import { ApiError, type ApiClient } from '../../../shell/api';

/**
 * Typed wrappers over the shell {@link ApiClient} for M04 (T-028a). The client
 * attaches the access token and handles refresh; feature code stays declarative.
 * Shapes come straight from `@adoptafacil/contracts` — nothing is redefined here.
 */

/** Org kanban: the caller organization's adoption requests (RLS-scoped). */
export function listAdoptionRequests(client: ApiClient): Promise<AdoptionRequest[]> {
  return client.request<AdoptionRequest[]>('/adoptions');
}

/** F1-01 — the applicant's own requests (cross-tenant, by identity). */
export function listMyAdoptionRequests(client: ApiClient): Promise<AdoptionRequest[]> {
  return client.request<AdoptionRequest[]>('/adoptions/mine');
}

/** Person applies to adopt an animal (authenticated). */
export function createAdoptionRequest(
  client: ApiClient,
  input: CreateAdoptionRequestInput,
): Promise<AdoptionRequest> {
  return client.request<AdoptionRequest>('/adoptions', { method: 'POST', json: input });
}

/** Org moves a request through the evaluation state machine (audited server-side). */
export function transitionAdoptionRequest(
  client: ApiClient,
  id: string,
  input: TransitionAdoptionRequestInput,
): Promise<AdoptionRequest> {
  return client.request<AdoptionRequest>(`/adoptions/${id}/transitions`, {
    method: 'POST',
    json: input,
  });
}

// --- T-028b · contract + signature -----------------------------------------

/** Org generates the contract for an approved request (RF11). */
export function generateAdoptionContract(
  client: ApiClient,
  input: GenerateAdoptionContractInput,
): Promise<AdoptionContract> {
  return client.request<AdoptionContract>('/adoptions/contracts', { method: 'POST', json: input });
}

/**
 * Org fetches the contract of a request, or `null` when none exists yet (404).
 * Lets the kanban decide between "generate" and "manage/sign".
 */
export async function getContractForRequest(
  client: ApiClient,
  requestId: string,
): Promise<AdoptionContract | null> {
  try {
    return await client.request<AdoptionContract>(`/adoptions/contracts/by-request/${requestId}`);
  } catch (error) {
    if (ApiError.is(error) && error.status === 404) return null;
    throw error;
  }
}

/** A signer fetches the contract they must sign (org rep or adopter). */
export function getContractForSigner(
  client: ApiClient,
  contractId: string,
): Promise<AdoptionContract> {
  return client.request<AdoptionContract>(`/adoptions/contracts/${contractId}`);
}

/** The contract detail page for ANY org manager (not just whoever generated
 *  it) — `/adopciones/contratos/:id`. */
export function getContractForOrgById(
  client: ApiClient,
  contractId: string,
): Promise<AdoptionContract> {
  return client.request<AdoptionContract>(`/adoptions/contracts/org/${contractId}`);
}

/** Org moves the contract between managed states (draft→pending, cancel). */
export function transitionAdoptionContract(
  client: ApiClient,
  contractId: string,
  input: TransitionAdoptionContractInput,
): Promise<AdoptionContract> {
  return client.request<AdoptionContract>(`/adoptions/contracts/${contractId}/transitions`, {
    method: 'POST',
    json: input,
  });
}

/** A signer signs their part. The org representative needs no image (reuses
 *  the already-registered legal representative signature); the adopter MUST
 *  include `signatureBase64` (drawn/uploaded via `SignaturePad`). */
export function signAdoptionContract(
  client: ApiClient,
  contractId: string,
  input: SignAdoptionContractInput,
): Promise<AdoptionContract> {
  return client.request<AdoptionContract>(`/adoptions/contracts/${contractId}/signatures`, {
    method: 'POST',
    json: input,
  });
}

/** Org edits the fillable data (peso, estado de salud, etc.) while the
 *  contract is still a draft with no signatures yet. */
export function updateAdoptionContractData(
  client: ApiClient,
  contractId: string,
  input: UpdateAdoptionContractDataInput,
): Promise<AdoptionContract> {
  return client.request<AdoptionContract>(`/adoptions/contracts/${contractId}/data`, {
    method: 'PATCH',
    json: input,
  });
}

/** Download the contract as a real PDF and trigger a browser save — any
 *  legitimate signer, or any org manager (`canManage`), at any status (lets
 *  the org preview the draft). */
export async function downloadAdoptionContractPdf(
  client: ApiClient,
  canManage: boolean,
  contractId: string,
): Promise<void> {
  const path = canManage
    ? `/adoptions/contracts/org/${contractId}/pdf`
    : `/adoptions/contracts/${contractId}/pdf`;
  const blob = await client.requestBlob(path);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `contrato-adopcion-${contractId}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * The decrypted signature IMAGE of one signer, as an object URL ready for an
 * `<img src>` — or `null` if that signer hasn't signed yet (404). Nuevo
 * requerimiento: la vista en pantalla mostraba solo el nombre del firmante,
 * no la firma dibujada/subida. The caller owns the returned URL and must
 * `URL.revokeObjectURL` it once no longer shown (e.g. on unmount/refresh).
 */
export async function getSignatureImageUrl(
  client: ApiClient,
  canManage: boolean,
  contractId: string,
  signerId: string,
): Promise<string | null> {
  const path = canManage
    ? `/adoptions/contracts/org/${contractId}/signatures/${signerId}/image`
    : `/adoptions/contracts/${contractId}/signatures/${signerId}/image`;
  try {
    const blob = await client.requestBlob(path);
    return URL.createObjectURL(blob);
  } catch (error) {
    if (ApiError.is(error) && error.status === 404) return null;
    throw error;
  }
}

// --- T-028c · post-adoption follow-up ---------------------------------------

/** Org schedules a follow-up milestone on a signed contract (RF12). */
export function scheduleFollowUpMilestone(
  client: ApiClient,
  input: ScheduleFollowUpMilestoneInput,
): Promise<AdoptionFollowUpMilestone> {
  return client.request<AdoptionFollowUpMilestone>('/adoptions/followups', {
    method: 'POST',
    json: input,
  });
}

/** Org lists the follow-up milestones of a contract. */
export function listFollowUpsForContract(
  client: ApiClient,
  contractId: string,
): Promise<AdoptionFollowUpMilestone[]> {
  return client.request<AdoptionFollowUpMilestone[]>(
    `/adoptions/followups/by-contract/${contractId}`,
  );
}

/** The adopter's own follow-up milestones (cross-tenant, by identity). */
export function listMyFollowUps(client: ApiClient): Promise<AdoptionFollowUpMilestone[]> {
  return client.request<AdoptionFollowUpMilestone[]>('/adoptions/followups/mine');
}

/** The adopter responds a milestone (answers and/or a photo via StoragePort). */
export function submitFollowUp(
  client: ApiClient,
  milestoneId: string,
  input: SubmitFollowUpInput,
): Promise<AdoptionFollowUpMilestone> {
  return client.request<AdoptionFollowUpMilestone>(`/adoptions/followups/${milestoneId}/submit`, {
    method: 'POST',
    json: input,
  });
}

/**
 * The adopter responds a milestone WITH a photo in the same request (multipart:
 * `file`, plus optional `answers` as a JSON string and `complete` as
 * "true"/"false"). The generic storage upload only accepts keys of the caller's
 * own organization, so the adopter's photo travels through this endpoint.
 */
export function submitFollowUpWithPhoto(
  client: ApiClient,
  milestoneId: string,
  file: File,
  answers?: Record<string, unknown>,
  options: { complete?: boolean } = {},
): Promise<AdoptionFollowUpMilestone> {
  const form = new FormData();
  form.append('file', file, file.name);
  if (answers !== undefined) form.append('answers', JSON.stringify(answers));
  if (options.complete !== undefined) form.append('complete', String(options.complete));
  return client.request<AdoptionFollowUpMilestone>(`/adoptions/followups/${milestoneId}/photo`, {
    method: 'POST',
    body: form,
  });
}

/** The org closes (completes) a milestone. */
export function completeFollowUp(
  client: ApiClient,
  milestoneId: string,
): Promise<AdoptionFollowUpMilestone> {
  return client.request<AdoptionFollowUpMilestone>(`/adoptions/followups/${milestoneId}/complete`, {
    method: 'POST',
  });
}

// --- Ajuste 6 · acta de entrega -------------------------------------------

/** Org reserves where to upload the mandatory delivery photo (private). */
export function createDeliveryPhotoTarget(
  client: ApiClient,
  filename: string,
): Promise<AdoptionDeliveryPhotoTarget> {
  return client.request<AdoptionDeliveryPhotoTarget>('/adoptions/deliveries/photo-target', {
    method: 'POST',
    json: { filename },
  });
}

/** PUT the photo bytes to the reserved key (auth handled by the client). */
export async function uploadDeliveryPhoto(
  client: ApiClient,
  storageRef: string,
  file: File,
): Promise<void> {
  const form = new FormData();
  form.append('file', file, file.name);
  await client.request(`/storage/upload?key=${encodeURIComponent(storageRef)}`, {
    method: 'PUT',
    body: form,
  });
}

/** Org registers the delivery; returns the one-time code and the QR link. */
export function startAdoptionDelivery(
  client: ApiClient,
  input: StartAdoptionDeliveryInput,
): Promise<AdoptionDeliveryCodeIssued> {
  return client.request<AdoptionDeliveryCodeIssued>('/adoptions/deliveries', {
    method: 'POST',
    json: input,
  });
}

/** Org: the current (pending or confirmed) delivery of a contract, or null. */
export async function getDeliveryForContract(
  client: ApiClient,
  contractId: string,
): Promise<AdoptionDelivery | null> {
  const body = await client.request<AdoptionDelivery | null | Record<string, never>>(
    `/adoptions/deliveries/by-contract/${contractId}`,
  );
  return body && 'id' in body ? (body as AdoptionDelivery) : null;
}

/** Org issues a new code (expired, locked, or the email did not arrive). */
export function regenerateDeliveryCode(
  client: ApiClient,
  deliveryId: string,
): Promise<AdoptionDeliveryCodeIssued> {
  return client.request<AdoptionDeliveryCodeIssued>(`/adoptions/deliveries/${deliveryId}/code`, {
    method: 'POST',
  });
}

/** Org cancels a pending delivery. */
export function cancelAdoptionDelivery(
  client: ApiClient,
  deliveryId: string,
): Promise<AdoptionDelivery> {
  return client.request<AdoptionDelivery>(`/adoptions/deliveries/${deliveryId}/cancel`, {
    method: 'POST',
  });
}

/** The adopter's deliveries ("Mis animales"). */
export function listMyDeliveries(client: ApiClient): Promise<AdoptionDelivery[]> {
  return client.request<AdoptionDelivery[]>('/adoptions/deliveries/mine');
}

/** One delivery of the adopter (404 if it is not theirs). */
export function getMyDelivery(client: ApiClient, deliveryId: string): Promise<AdoptionDelivery> {
  return client.request<AdoptionDelivery>(`/adoptions/deliveries/mine/${deliveryId}`);
}

/** The adopter confirms the delivery with the 6-digit code. */
export function confirmAdoptionDelivery(
  client: ApiClient,
  deliveryId: string,
  code: string,
): Promise<AdoptionDelivery> {
  return client.request<AdoptionDelivery>(`/adoptions/deliveries/${deliveryId}/confirm`, {
    method: 'POST',
    json: { code },
  });
}
