// ============================================================================
// Equipo de la organización (pantalla "Miembros"). Contrato aditivo.
//
// Los cargos son FIJOS (ORG_ROLES): la organización elige el cargo de cada
// persona, no arma permisos a la medida. Lo que puede hacer cada cargo lo
// describe `invitationRoleCopy` (sale de los `@Roles` reales de la API).
// Los firmantes (contador, revisor fiscal) NO ocupan puesto del plan y se
// gestionan en "Firmantes", no aquí.
// ============================================================================

import { Role } from './auth';

/** Cargos que se pueden dar al invitar desde "Miembros". El propietario no se
 *  invita: un propietario existente puede pasar a otra persona a propietario. */
export const INVITABLE_ORG_ROLES: readonly Role[] = [
  Role.Administrator,
  Role.Operator,
  Role.Veterinarian,
  Role.Volunteer,
  Role.TemporaryCollaborator,
  Role.ReadOnlyAuditor,
];

/** Una persona del equipo, tal como la ven el propietario y los administradores. */
export interface OrgTeamMember {
  userId: string;
  displayName: string;
  email: string;
  /** Cargos vigentes. Vacío = la persona fue retirada y ya no tiene acceso. */
  roles: Role[];
  /** Firmante vinculado (contador / revisor fiscal): se gestiona en "Firmantes"
   *  y no ocupa puesto del plan. */
  signerRole?: 'accountant' | 'fiscal_reviewer';
  /** ISO-8601 UTC: cuándo se creó su cuenta en la organización. */
  joinedAt: string;
}

/** Puestos del plan: personas con cargo (sin firmantes) + invitaciones pendientes. */
export interface OrgSeatUsage {
  /** Personas con al menos un cargo, sin contar firmantes. */
  used: number;
  /** Invitaciones de miembros (no de firmantes) aún pendientes: ocupan puesto al aceptarse. */
  pendingInvitations: number;
  /** Tope del plan vigente; `null` = sin límite (o planes sin aplicar). */
  limit: number | null;
  /** Nombre del plan vigente, p. ej. "Gratis". */
  planName: string;
}

/** `GET /org/members` (Owner, Administrator). */
export interface OrgTeamView {
  /** Personas con cargo, primero los propietarios. */
  members: OrgTeamMember[];
  /** Personas retiradas (sin cargo): pueden recuperar el acceso con un cargo. */
  formerMembers: OrgTeamMember[];
  seats: OrgSeatUsage;
}

/** `PUT /org/members/:userId/role` — deja a la persona con UN solo cargo. */
export interface ChangeMemberRoleInput {
  role: Role;
}
