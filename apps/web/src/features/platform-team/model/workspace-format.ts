import {
  Role,
  type SensitiveActionRequest,
  type SensitiveActionStatus,
  type SensitiveActionType,
  type WorkspaceTicketStatus,
} from '@adoptafacil/contracts';

/** UTC from the API → Colombia time, only for display (invariant #4). */
export function colombiaDateTime(isoUtc: string | null | undefined): string {
  if (!isoUtc) return '—';
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) return isoUtc;
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export const TICKET_STATUS_LABEL: Record<WorkspaceTicketStatus, string> = {
  open: 'Sin tomar',
  in_progress: 'En revisión',
  waiting_org: 'Esperando a la organización',
  resolved: 'Cerrada',
};

export const APPROVAL_STATUS_LABEL: Record<SensitiveActionStatus, string> = {
  pending: 'Esperando aprobación',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  cancelled: 'Cancelada',
  expired: 'Vencida',
};

export const ACTION_TYPE_LABEL: Record<SensitiveActionType, string> = {
  'staff.invite': 'Invitar a una persona al equipo',
  'staff.role_grant': 'Dar un rol de plataforma',
  'staff.role_revoke': 'Quitar un rol de plataforma',
  'staff.mfa_reset': 'Reiniciar la verificación en dos pasos',
  'audit.export': 'Exportar la bitácora del equipo',
};

export const ROLE_LABEL: Partial<Record<Role, string>> = {
  [Role.PlatformSuperAdmin]: 'Líder (PlatformSuperAdmin)',
  [Role.PlatformAdmin]: 'Analista (PlatformAdmin)',
};

export function roleLabel(role: string): string {
  return ROLE_LABEL[role as Role] ?? role;
}

/** One line a person can read: what the request will do. */
export function describeApproval(
  request: Pick<SensitiveActionRequest, 'type' | 'payload'>,
  nameOf: (userId: string) => string,
): string {
  const payload = request.payload as unknown as Record<string, string>;
  switch (request.type) {
    case 'staff.invite':
      return `Invitar a ${payload.email} como ${roleLabel(payload.role)}`;
    case 'staff.role_grant':
      return `Dar ${roleLabel(payload.role)} a ${nameOf(payload.userId)}`;
    case 'staff.role_revoke':
      return `Quitar ${roleLabel(payload.role)} a ${nameOf(payload.userId)}`;
    case 'staff.mfa_reset':
      return `Reiniciar la verificación en dos pasos de ${nameOf(payload.userId)}`;
    case 'audit.export':
      return `Exportar la bitácora del ${payload.from} al ${payload.to}`;
    default:
      return ACTION_TYPE_LABEL[request.type] ?? request.type;
  }
}

/** Human message for the API's machine-readable codes. */
export function workspaceErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  const status = (error as { status?: number } | null)?.status;
  switch (code) {
    case 'MFA_INVALID_CODE':
      return 'El código no es válido o ya se usó. Espera el siguiente código de tu app.';
    case 'MFA_LOCKED':
      return 'Demasiados códigos incorrectos. Espera 15 minutos e inténtalo de nuevo.';
    case 'FOUR_EYES':
      return 'Esta acción la tiene que aprobar otra persona líder de tu equipo.';
    case 'TICKET_CHANGED':
      return 'Alguien cambió esta tarea mientras la mirabas. Recargamos la lista.';
    case 'TICKET_TAKEN':
      return 'Otra persona del equipo ya tomó esta tarea.';
    default:
      break;
  }
  if (status === 409) return 'Esto ya cambió. Recarga e inténtalo de nuevo.';
  if (status === 410) return 'La solicitud venció.';
  if (status === 403) return 'No tienes permiso para hacer esto.';
  return error instanceof Error && error.message
    ? error.message
    : 'Algo salió mal. Inténtalo de nuevo.';
}
