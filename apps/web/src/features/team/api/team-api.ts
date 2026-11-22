import type {
  Animal,
  AnimalCareLog,
  CreateAnimalCareLogInput,
  CreateTeamAssignmentInput,
  MyMemberPermissions,
  MyTeamWork,
  TeamAssignee,
  TeamAssignment,
} from '@adoptafacil/contracts';
import type { ApiClient } from '../../../shell/api';

/** "Mi trabajo" (`GET /team/me/work`): tareas y animales a cargo de quien pregunta. */
export function fetchMyWork(client: ApiClient): Promise<MyTeamWork> {
  return client.request<MyTeamWork>('/team/me/work');
}

export function fetchMyPermissions(client: ApiClient): Promise<MyMemberPermissions> {
  return client.request<MyMemberPermissions>('/team/me/permissions');
}

export function completeAssignment(
  client: ApiClient,
  id: string,
  note?: string,
): Promise<TeamAssignment> {
  return client.request<TeamAssignment>(`/team/me/assignments/${id}/complete`, {
    method: 'POST',
    json: note ? { note } : {},
  });
}

export function fetchMyCareLogs(client: ApiClient, animalId: string): Promise<AnimalCareLog[]> {
  return client.request<AnimalCareLog[]>(`/team/me/animals/${animalId}/care-logs`);
}

export function addCareLog(
  client: ApiClient,
  animalId: string,
  input: CreateAnimalCareLogInput,
): Promise<AnimalCareLog> {
  return client.request<AnimalCareLog>(`/team/me/animals/${animalId}/care-logs`, {
    method: 'POST',
    json: input,
  });
}

// --- Quien coordina (propietario, administrador, operador) -----------------------

export function fetchAssignees(client: ApiClient): Promise<TeamAssignee[]> {
  return client.request<TeamAssignee[]>('/team/assignees');
}

export function fetchTeamAssignments(client: ApiClient): Promise<TeamAssignment[]> {
  return client.request<TeamAssignment[]>('/team/assignments');
}

export function createAssignment(
  client: ApiClient,
  input: CreateTeamAssignmentInput,
): Promise<TeamAssignment> {
  return client.request<TeamAssignment>('/team/assignments', { method: 'POST', json: input });
}

export function cancelAssignment(client: ApiClient, id: string): Promise<TeamAssignment> {
  return client.request<TeamAssignment>(`/team/assignments/${id}/cancel`, { method: 'POST' });
}

/** Bitácora de cuidados de un animal, para quien lleva su ficha. */
export function fetchAnimalCareLogs(client: ApiClient, animalId: string): Promise<AnimalCareLog[]> {
  return client.request<AnimalCareLog[]>(`/team/animals/${animalId}/care-logs`);
}

/** Marcar o desmarcar "apto para adopción". */
export function setAdoptionReadiness(
  client: ApiClient,
  animalId: string,
  ready: boolean,
  note?: string,
): Promise<Animal> {
  return client.request<Animal>(`/animals/${animalId}/adoption-readiness`, {
    method: 'POST',
    json: { ready, ...(note ? { note } : {}) },
  });
}
