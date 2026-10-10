import type {
  AuthTokens,
  CreateSensitiveActionInput,
  MfaEnrollment,
  MfaStatus,
  SensitiveActionRequest,
  WorkspaceActivityItem,
  WorkspaceMe,
  WorkspaceTeamMember,
  WorkspaceTicket,
  WorkspaceTicketDetail,
  WorkspaceTicketStatus,
} from '@adoptafacil/contracts';
import type { ApiClient } from '../../../shell/api';

/** Typed calls of the platform team workspace (F19) and the staff second factor. */
export function workspaceApi(client: ApiClient) {
  const post = <T>(path: string, json: unknown = {}) =>
    client.request<T>(path, { method: 'POST', json });
  return {
    mfaStatus: () => client.request<MfaStatus>('/auth/mfa/status'),
    startEnrollment: (password: string) => post<MfaEnrollment>('/auth/mfa/enroll', { password }),
    confirmEnrollment: (code: string) => post<AuthTokens>('/auth/mfa/enroll/confirm', { code }),
    verify: (code: string) => post<AuthTokens>('/auth/mfa/verify', { code }),

    me: () => client.request<WorkspaceMe>('/platform/workspace/me'),
    team: () => client.request<WorkspaceTeamMember[]>('/platform/workspace/team'),
    activity: (limit = 50) =>
      client.request<WorkspaceActivityItem[]>(`/platform/workspace/activity?limit=${limit}`),

    tickets: () => client.request<WorkspaceTicket[]>('/platform/workspace/tickets'),
    ticket: (id: string) =>
      client.request<WorkspaceTicketDetail>(`/platform/workspace/tickets/${id}`),
    take: (id: string, expectedVersion: number) =>
      post<WorkspaceTicket>(`/platform/workspace/tickets/${id}/take`, { expectedVersion }),
    release: (id: string, expectedVersion: number) =>
      post<WorkspaceTicket>(`/platform/workspace/tickets/${id}/release`, { expectedVersion }),
    changeStatus: (
      id: string,
      expectedVersion: number,
      status: WorkspaceTicketStatus,
      note?: string,
    ) =>
      post<WorkspaceTicket>(`/platform/workspace/tickets/${id}/status`, {
        expectedVersion,
        status,
        ...(note ? { note } : {}),
      }),
    addNote: (id: string, note: string) =>
      post<WorkspaceTicket>(`/platform/workspace/tickets/${id}/notes`, { note }),

    approvals: () => client.request<SensitiveActionRequest[]>('/platform/workspace/approvals'),
    requestApproval: (input: CreateSensitiveActionInput) =>
      post<SensitiveActionRequest>('/platform/workspace/approvals', input),
    approve: (id: string, code: string, note?: string) =>
      post<SensitiveActionRequest>(`/platform/workspace/approvals/${id}/approve`, {
        code,
        ...(note ? { note } : {}),
      }),
    reject: (id: string, note: string) =>
      post<SensitiveActionRequest>(`/platform/workspace/approvals/${id}/reject`, { note }),
    cancel: (id: string) =>
      post<SensitiveActionRequest>(`/platform/workspace/approvals/${id}/cancel`),
    downloadExport: (id: string) =>
      client.requestBlob(`/platform/workspace/approvals/${id}/export.csv`),
  };
}

export type WorkspaceApi = ReturnType<typeof workspaceApi>;
