/**
 * Trabajo del equipo por cargo (decisión del dueño, 2026-11-22).
 *
 * - Veterinario: lleva lo clínico y marca "apto para adopción", pero NO publica
 *   (activar la ficha o ponerla en un estado público) salvo que el propietario o
 *   un administrador le dé el permiso expreso `animals.publish`.
 * - Operador: crea cobros de custodia ceñidos a la tarifa del contrato; anular o
 *   reembolsar queda en manos del propietario o un administrador.
 * - Voluntario: panel mínimo con sus tareas, los animales a su cargo (ficha
 *   básica, sin datos de adoptantes ni donantes), la bitácora de cuidados y su
 *   voluntariado (jornadas, horas y certificados).
 */
import type { AnimalSex, AnimalSize, AnimalSpecies, AnimalStatus, ComputedAge } from './animals';
import { Role } from './auth';

// ---------------------------------------------------------------------------
// Publicar animales
// ---------------------------------------------------------------------------

/** Cargos que publican o retiran del portal una ficha por su cargo. */
export const ANIMAL_PUBLISH_ROLES = [Role.Owner, Role.Administrator, Role.Operator] as const;

/**
 * Cargos que marcan un animal "apto para adopción" (o lo desmarcan). No publica:
 * avisa a quien publica que, por salud, el animal está listo.
 */
export const ANIMAL_READINESS_ROLES = [
  Role.Owner,
  Role.Administrator,
  Role.Operator,
  Role.Veterinarian,
] as const;

/** `POST /animals/:id/adoption-readiness`. */
export interface SetAdoptionReadinessInput {
  ready: boolean;
  /** Lo que quien publica debe saber (máx. 500). */
  note?: string;
}

// ---------------------------------------------------------------------------
// Permisos expresos por persona
// ---------------------------------------------------------------------------

/** Permisos que el propietario o un administrador da a UNA persona, por encima
 *  de su cargo. */
export type MemberPermission = 'animals.publish';

export const MEMBER_PERMISSIONS: readonly MemberPermission[] = ['animals.publish'];

/** A qué cargo se le puede dar cada permiso (a los demás no les hace falta o no
 *  corresponde). */
export const MEMBER_PERMISSION_ROLES: Record<MemberPermission, readonly Role[]> = {
  'animals.publish': [Role.Veterinarian],
};

export const MEMBER_PERMISSION_LABELS: Record<MemberPermission, string> = {
  'animals.publish': 'Puede publicar animales en el portal',
};

/** `PUT /org/members/:userId/permissions` (Owner, Administrator): reemplaza
 *  los permisos expresos de la persona. */
export interface SetMemberPermissionsInput {
  permissions: MemberPermission[];
}

/** `GET /team/me/permissions`: lo que la persona puede hacer además de su cargo. */
export interface MyMemberPermissions {
  permissions: MemberPermission[];
}

// ---------------------------------------------------------------------------
// Tareas y animales a cargo
// ---------------------------------------------------------------------------

export type TeamAssignmentKind = 'task' | 'animal_care';
export type TeamAssignmentStatus = 'open' | 'done' | 'cancelled';

export const TEAM_ASSIGNMENT_KIND_LABELS: Record<TeamAssignmentKind, string> = {
  task: 'Tarea',
  animal_care: 'Animal a cargo',
};

export const TEAM_ASSIGNMENT_STATUS_LABELS: Record<TeamAssignmentStatus, string> = {
  open: 'Pendiente',
  done: 'Hecha',
  cancelled: 'Cancelada',
};

/** Quienes reciben tareas y animales a cargo y usan "Mi trabajo": todo el
 *  equipo menos el auditor de solo lectura (y los firmantes, que entran como
 *  auditores), que no ejecuta trabajo operativo. */
export const TEAM_WORK_ROLES = [
  Role.Owner,
  Role.Administrator,
  Role.Operator,
  Role.Veterinarian,
  Role.Volunteer,
  Role.TemporaryCollaborator,
] as const;

/** Cargos que encargan tareas y animales a otras personas del equipo. */
export const TEAM_ASSIGN_ROLES = [Role.Owner, Role.Administrator, Role.Operator] as const;

/** Ficha básica de un animal para quien lo cuida: sin datos de adoptantes,
 *  donantes, responsables de custodia ni historia clínica. */
export interface CareAnimalCard {
  id: string;
  name: string;
  species: AnimalSpecies;
  sex: AnimalSex;
  size: AnimalSize;
  status: AnimalStatus;
  breed?: string;
  computedAge?: ComputedAge;
  description?: string;
  tags: string[];
  photoUrl?: string;
}

export interface TeamAssignment {
  id: string;
  kind: TeamAssignmentKind;
  status: TeamAssignmentStatus;
  title: string;
  details?: string;
  /** `YYYY-MM-DD`. */
  dueDate?: string;
  assigneeUserId: string;
  assigneeName: string;
  animal?: CareAnimalCard;
  createdByName: string;
  /** ISO-8601 UTC. */
  createdAt: string;
  completedAt?: string;
  completionNote?: string;
}

/** `GET /team/assignees`: a quién se le puede encargar algo. */
export interface TeamAssignee {
  userId: string;
  displayName: string;
  roles: Role[];
}

/** `POST /team/assignments` (Owner, Administrator, Operator). */
export interface CreateTeamAssignmentInput {
  assigneeUserId: string;
  kind: TeamAssignmentKind;
  /** Obligatorio en una tarea; en un animal a cargo, por defecto "Cuidar a <nombre>". */
  title?: string;
  details?: string;
  /** `YYYY-MM-DD`. */
  dueDate?: string;
  /** Obligatorio en `animal_care`; opcional en una tarea. */
  animalId?: string;
}

/** `POST /team/me/assignments/:id/complete`. */
export interface CompleteTeamAssignmentInput {
  note?: string;
}

/** `GET /team/me/work`: lo que la persona tiene a su cargo. */
export interface MyTeamWork {
  /** Tareas pendientes y las hechas en los últimos 30 días. */
  assignments: TeamAssignment[];
  /** Animales a su cargo (asignaciones `animal_care` abiertas). */
  animals: CareAnimalCard[];
}

// ---------------------------------------------------------------------------
// Bitácora de cuidados
// ---------------------------------------------------------------------------

export type CareLogKind = 'walk' | 'feeding' | 'cleaning' | 'observation';

export const CARE_LOG_KINDS: readonly CareLogKind[] = [
  'walk',
  'feeding',
  'cleaning',
  'observation',
];

export const CARE_LOG_KIND_LABELS: Record<CareLogKind, string> = {
  walk: 'Paseo',
  feeding: 'Alimentación',
  cleaning: 'Limpieza',
  observation: 'Observación',
};

export interface AnimalCareLog {
  id: string;
  animalId: string;
  kind: CareLogKind;
  note?: string;
  /** ISO-8601 UTC. */
  occurredAt: string;
  authorName: string;
  createdAt: string;
}

/** `POST /team/me/animals/:animalId/care-logs`. */
export interface CreateAnimalCareLogInput {
  kind: CareLogKind;
  /** Obligatoria en una observación (máx. 1000). */
  note?: string;
  /** ISO-8601; por defecto, ahora. No en el futuro ni hace más de 7 días. */
  occurredAt?: string;
}

/** Cargos que leen la bitácora de cuidados de cualquier animal. */
export const CARE_LOG_VIEW_ROLES = [
  Role.Owner,
  Role.Administrator,
  Role.Operator,
  Role.Veterinarian,
  Role.ReadOnlyAuditor,
] as const;

// ---------------------------------------------------------------------------
// Cobros de custodia del operador
// ---------------------------------------------------------------------------

/**
 * Conceptos que siguen la tarifa del contrato: el operador los cobra solo con un
 * contrato emitido o vigente del mismo animal y por el valor exacto pactado.
 */
export const CUSTODY_TARIFF_CONCEPTS = ['boarding_fee', 'food'] as const;

/** Los demás gastos (veterinaria, transporte, otro) el operador los cobra con
 *  su soporte adjunto. */
export const CUSTODY_SUPPORTED_EXPENSE_CONCEPTS = ['veterinary', 'transport', 'other'] as const;

/** Conceptos que el operador no crea: un recargo por mora es decisión del
 *  propietario o un administrador. */
export const CUSTODY_ADMIN_ONLY_CONCEPTS = ['late_fee'] as const;
