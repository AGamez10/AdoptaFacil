// ============================================================================
// Cargo de una invitación, en palabras de la persona invitada. Un solo texto
// para el correo de invitación y para la pantalla /invitacion, así lo que la
// persona lee antes de crear su cuenta es exactamente lo que el correo
// prometió. Cada función sale de lo que el rol puede hacer HOY en la API
// (`@Roles` de cada controlador): si un permiso cambia, cambia esta lista.
// ============================================================================

import { Role } from './auth';

export type InvitationSignerRole = 'accountant' | 'fiscal_reviewer';

export interface InvitationRoleCopy {
  /** Nombre del cargo, p. ej. "Veterinario/a". */
  label: string;
  /** Una frase sobre el cargo. */
  summary: string;
  /** Lo que la persona podrá hacer, una función por elemento. */
  duties: string[];
}

const ORG_ROLE_COPY: Partial<Record<Role, InvitationRoleCopy>> = {
  [Role.Owner]: {
    label: 'Propietario/a (representante legal)',
    summary: 'Tendrás el control total de la organización y responderás por ella.',
    duties: [
      'Invitar y retirar personas del equipo y decidir el cargo de cada una',
      'Gestionar animales, adopciones, campañas, voluntariado y el portal público',
      'Configurar las cuentas para recibir donaciones y revisar lo recaudado',
      'Firmar reportes, certificados y documentos legales de la organización',
    ],
  },
  [Role.Administrator]: {
    label: 'Administrador/a',
    summary: 'Llevarás la operación diaria de la organización con casi todos los permisos.',
    duties: [
      'Invitar personas al equipo (salvo propietarios)',
      'Gestionar animales, adopciones, campañas y voluntariado',
      'Revisar donaciones, apadrinamientos, contabilidad y reportes',
      'Configurar el portal público y las cuentas para recibir donaciones',
    ],
  },
  [Role.Operator]: {
    label: 'Operador/a',
    summary: 'Te encargarás del trabajo del día a día con los animales y las adopciones.',
    duties: [
      'Registrar animales y actualizar sus fichas e historia clínica',
      'Evaluar solicitudes de adopción, contratos, entregas y seguimientos',
      'Crear campañas, publicar evidencias y necesidades de recursos',
      'Consultar las donaciones recibidas',
    ],
  },
  [Role.Veterinarian]: {
    label: 'Veterinario/a',
    summary: 'Cuidarás la salud de los animales de la organización.',
    duties: [
      'Registrar y actualizar la historia clínica, vacunas y tratamientos',
      'Atender los recordatorios de salud de cada animal',
      'Registrar la evaluación de comportamiento antes de una adopción',
      'Actualizar las fichas de los animales',
    ],
  },
  [Role.ReadOnlyAuditor]: {
    label: 'Auditor/a de solo lectura',
    summary: 'Podrás revisar la información de la organización sin cambiar nada.',
    duties: [
      'Consultar animales, campañas, voluntariado y reportes',
      'Revisar la contabilidad, las donaciones de campañas y los apadrinamientos',
      'No podrás crear, editar ni borrar información',
    ],
  },
  [Role.Volunteer]: {
    label: 'Voluntario/a',
    summary: 'Harás parte del equipo de voluntariado de la organización.',
    duties: [
      'Tener tu cuenta dentro del equipo de la organización',
      'Ver el estado de la organización y la vista previa de su portal',
      'La organización te asignará tus tareas; este cargo no da acceso a datos de animales, donantes ni adoptantes',
    ],
  },
  [Role.TemporaryCollaborator]: {
    label: 'Colaborador/a temporal',
    summary: 'Apoyarás a la organización por un tiempo definido.',
    duties: [
      'Tener tu cuenta dentro del equipo de la organización',
      'Ver el estado de la organización y la vista previa de su portal',
      'Este cargo no da acceso a datos de animales, donantes ni adoptantes',
    ],
  },
  [Role.PlatformAdmin]: {
    label: 'Administrador/a de plataforma',
    summary: 'Harás parte del equipo que opera AdoptaFácil.',
    duties: [
      'Revisar y aprobar organizaciones y sus documentos',
      'Moderar la comunidad y atender reportes',
      'Revisar conciliaciones y pagos a organizaciones',
      'Toda acción queda registrada y las sensibles necesitan una segunda aprobación',
    ],
  },
  [Role.PlatformSuperAdmin]: {
    label: 'Superadministrador/a de plataforma',
    summary: 'Tendrás el nivel más alto de acceso a la operación de AdoptaFácil.',
    duties: [
      'Todo lo que hace un administrador de plataforma',
      'Liderar el equipo de plataforma: altas, bajas y reasignación de tareas',
      'Aprobar o rechazar las acciones sensibles que pidan otros miembros del equipo',
      'Toda acción queda registrada y las sensibles necesitan una segunda aprobación',
    ],
  },
};

const SIGNER_COPY: Record<InvitationSignerRole, InvitationRoleCopy> = {
  accountant: {
    label: 'Contador/a',
    summary:
      'Revisarás la información financiera y firmarás los reportes que piden firma de contador.',
    duties: [
      'Revisar la contabilidad, las donaciones y los reportes en modo de solo lectura',
      'Autorizar con tu propia firma los reportes que requieren contador',
      'Nadie puede firmar a tu nombre: cada firma te la pedimos a ti',
      'No podrás crear, editar ni borrar información',
    ],
  },
  fiscal_reviewer: {
    label: 'Revisor/a fiscal',
    summary:
      'Revisarás la información financiera y firmarás los reportes que piden revisor fiscal.',
    duties: [
      'Revisar la contabilidad, las donaciones y los reportes en modo de solo lectura',
      'Autorizar con tu propia firma los reportes que requieren revisor fiscal',
      'Nadie puede firmar a tu nombre: cada firma te la pedimos a ti',
      'No podrás crear, editar ni borrar información',
    ],
  },
};

/** Cargo genérico si llega un rol sin texto (nunca debería pasar). */
const FALLBACK_COPY: InvitationRoleCopy = {
  label: 'Miembro del equipo',
  summary: 'Harás parte del equipo de la organización.',
  duties: ['Tener tu cuenta dentro del equipo de la organización'],
};

/**
 * Cargo que verá la persona invitada. Un firmante (contador / revisor fiscal)
 * entra con el rol de auditor de solo lectura, pero su cargo es el de firmante.
 */
export function invitationRoleCopy(
  role: Role | string,
  signerRole?: InvitationSignerRole | null,
): InvitationRoleCopy {
  if (signerRole && SIGNER_COPY[signerRole]) return SIGNER_COPY[signerRole];
  return ORG_ROLE_COPY[role as Role] ?? FALLBACK_COPY;
}
