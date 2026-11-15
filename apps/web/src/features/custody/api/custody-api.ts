import { useMemo } from 'react';
import type {
  AnimalReportFilters,
  AnimalReportPreview,
  CreateCustodyChargeInput,
  CreateCustodyEventInput,
  CreateCustodyReleaseInput,
  CustodyAccountSummary,
  CustodyCharge,
  CustodyContract,
  CustodyContractPrefill,
  CustodyContractTemplate,
  CustodyDocument,
  CustodyEvent,
  CustodyIntake,
  CustodyOverview,
  CustodyRelease,
  CustodyResponsible,
  GrantCustodyExtensionInput,
  RegisterCustodyPaymentInput,
  SaveCustodyContractInput,
  SaveCustodyContractTemplateInput,
  SaveCustodyIntakeInput,
  UpsertCustodyResponsibleInput,
} from '@adoptafacil/contracts';
import { useApiClient } from '../../../shell/api';

type Client = ReturnType<typeof useApiClient>;

/** Cuerpo multipart: los campos como texto y, si hay, el archivo en `file`. */
function toForm(fields: object, file?: File | null): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') continue;
    form.set(key, String(value));
  }
  if (file) form.set('file', file);
  return form;
}

export function reportQuery(filters: AnimalReportFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === '' || value === false) continue;
    params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

function createCustodyApi(client: Client) {
  const post = <T>(path: string, json?: unknown) =>
    client.request<T>(path, { method: 'POST', json: json ?? {} });
  const put = <T>(path: string, json: unknown) => client.request<T>(path, { method: 'PUT', json });
  const animal = (id: string) => `/custody/animals/${id}`;

  return {
    // Animal
    overview: (animalId: string) => client.request<CustodyOverview>(`${animal(animalId)}/overview`),
    timeline: (animalId: string) => client.request<CustodyEvent[]>(`${animal(animalId)}/timeline`),
    documents: (animalId: string) =>
      client.request<CustodyDocument[]>(`${animal(animalId)}/documents`),
    intakes: (animalId: string) => client.request<CustodyIntake[]>(`${animal(animalId)}/intakes`),
    createIntake: (animalId: string, input: SaveCustodyIntakeInput) =>
      post<CustodyIntake>(`${animal(animalId)}/intakes`, input),
    updateIntake: (id: string, input: SaveCustodyIntakeInput) =>
      put<CustodyIntake>(`/custody/intakes/${id}`, input),
    addIntakePhoto: (id: string, file: File) =>
      client.request<CustodyDocument>(`/custody/intakes/${id}/photos`, {
        method: 'POST',
        body: toForm({}, file),
      }),
    finalizeIntake: (id: string) =>
      post<{ intake: CustodyIntake; document: CustodyDocument }>(`/custody/intakes/${id}/finalize`),
    createRelease: (animalId: string, input: CreateCustodyReleaseInput) =>
      post<{ release: CustodyRelease; document: CustodyDocument }>(
        `${animal(animalId)}/${
          input.releaseType === 'handover_to_authority' ? 'authority-handover' : 'releases'
        }`,
        input,
      ),
    createEvent: (animalId: string, input: CreateCustodyEventInput) =>
      post<CustodyEvent>(`${animal(animalId)}/events`, input),
    uploadDocument: (animalId: string, fields: object, file: File) =>
      client.request<CustodyDocument>(`${animal(animalId)}/documents`, {
        method: 'POST',
        body: toForm(fields, file),
      }),
    individualReport: (animalId: string) => post<CustodyDocument>(`${animal(animalId)}/report`),
    documentBlob: (id: string) => client.requestBlob(`/custody/documents/${id}/file`),

    // Responsables
    responsibles: (search?: string) =>
      client.request<CustodyResponsible[]>(
        `/custody/responsibles${search ? `?search=${encodeURIComponent(search)}` : ''}`,
      ),
    createResponsible: (input: UpsertCustodyResponsibleInput) =>
      post<CustodyResponsible>('/custody/responsibles', input),
    updateResponsible: (id: string, input: UpsertCustodyResponsibleInput) =>
      put<CustodyResponsible>(`/custody/responsibles/${id}`, input),
    statementBlob: (id: string) => client.requestBlob(`/custody/responsibles/${id}/statement`),

    // Plantillas y contratos
    templates: () => client.request<CustodyContractTemplate[]>('/custody/contract-templates'),
    templateVersions: (key: string) =>
      client.request<CustodyContractTemplate[]>(`/custody/contract-templates/${key}/versions`),
    createTemplate: (input: SaveCustodyContractTemplateInput) =>
      post<CustodyContractTemplate>('/custody/contract-templates', input),
    updateTemplate: (key: string, input: SaveCustodyContractTemplateInput) =>
      put<CustodyContractTemplate>(`/custody/contract-templates/${key}`, input),
    archiveTemplate: (key: string) => post<void>(`/custody/contract-templates/${key}/archive`),
    prefill: (animalId: string) =>
      client.request<CustodyContractPrefill>(`${animal(animalId)}/contract-prefill`),
    contracts: (animalId?: string) =>
      client.request<CustodyContract[]>(
        `/custody/contracts${animalId ? `?animalId=${animalId}` : ''}`,
      ),
    createContract: (input: SaveCustodyContractInput) =>
      post<CustodyContract>('/custody/contracts', input),
    updateContract: (id: string, input: SaveCustodyContractInput) =>
      put<CustodyContract>(`/custody/contracts/${id}`, input),
    contractPreviewBlob: (id: string) => client.requestBlob(`/custody/contracts/${id}/preview`),
    issueContract: (id: string) =>
      post<{ contract: CustodyContract; document: CustodyDocument }>(
        `/custody/contracts/${id}/issue`,
        { confirm: true },
      ),
    endContract: (id: string, reason: string) =>
      post<CustodyContract>(`/custody/contracts/${id}/end`, { reason }),
    cancelContract: (id: string, reason: string) =>
      post<CustodyContract>(`/custody/contracts/${id}/cancel`, { reason }),

    // Cuenta
    summary: () => client.request<CustodyAccountSummary>('/custody/account/summary'),
    charges: (filter: { animalId?: string; responsibleId?: string } = {}) => {
      const params = new URLSearchParams();
      if (filter.animalId) params.set('animalId', filter.animalId);
      if (filter.responsibleId) params.set('responsibleId', filter.responsibleId);
      const text = params.toString();
      return client.request<CustodyCharge[]>(`/custody/charges${text ? `?${text}` : ''}`);
    },
    createCharge: (input: CreateCustodyChargeInput, file?: File | null) =>
      client.request<CustodyCharge>('/custody/charges', {
        method: 'POST',
        body: toForm(input, file),
      }),
    cancelCharge: (id: string, reason: string) =>
      post<CustodyCharge>(`/custody/charges/${id}/cancel`, { reason }),
    grantExtension: (id: string, input: GrantCustodyExtensionInput) =>
      post<CustodyCharge>(`/custody/charges/${id}/extensions`, input),
    registerPayment: (id: string, input: RegisterCustodyPaymentInput, file?: File | null) =>
      client.request<CustodyCharge>(`/custody/charges/${id}/payments`, {
        method: 'POST',
        body: toForm(input, file),
      }),
    voidPayment: (id: string, reason: string) =>
      post<CustodyCharge>(`/custody/payments/${id}/void`, { reason }),
    startCollection: (id: string, note: string) =>
      post<CustodyCharge>(`/custody/charges/${id}/collection`, {
        note,
        humanReviewConfirmed: true,
      }),

    // Reportes
    reportPreview: (filters: AnimalReportFilters) =>
      client.request<AnimalReportPreview>(`/custody/reports/animals${reportQuery(filters)}`),
    reportBlob: (format: 'pdf' | 'csv' | 'xlsx', filters: AnimalReportFilters) =>
      client.requestBlob(`/custody/reports/animals/${format}${reportQuery(filters)}`),
  };
}

export type CustodyApi = ReturnType<typeof createCustodyApi>;

export function useCustodyApi(): CustodyApi {
  const client = useApiClient();
  return useMemo(() => createCustodyApi(client), [client]);
}

/** Abre un archivo descargado en una pestaña nueva (PDF e imágenes se ven en línea). */
export function openBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Descarga un archivo con nombre (CSV y Excel). */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
