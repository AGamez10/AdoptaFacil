import type { Prisma } from '@prisma/client';
import {
  ANIMAL_PUBLISH_ROLES,
  MEMBER_PERMISSIONS,
  type MemberPermission,
  ORG_ROLES,
  Role,
} from '@adoptafacil/contracts';

/**
 * Permisos que dependen de la persona y no solo de su cargo (decisión del
 * dueño, 2026-11-22). El RolesGuard deja pasar por cargo; estas funciones
 * deciden lo fino dentro del servicio, en la MISMA transacción con RLS.
 */

/** Cargos de la organización que tiene la persona (tabla `user_roles`). */
export async function orgRolesOf(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
): Promise<Role[]> {
  const rows = await tx.userRole.findMany({
    where: { organizationId, userId },
    select: { role: true },
  });
  return rows.map((row) => row.role as Role).filter((role) => ORG_ROLES.includes(role));
}

/** Permisos expresos vigentes de la persona. */
export async function memberPermissionsOf(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
): Promise<MemberPermission[]> {
  const rows = await tx.memberPermissionGrant.findMany({
    where: { organizationId, userId },
    select: { permission: true },
  });
  return rows
    .map((row) => row.permission as MemberPermission)
    .filter((permission) => MEMBER_PERMISSIONS.includes(permission));
}

/**
 * ¿Puede publicar o retirar del portal la ficha de un animal? Por cargo
 * (propietario, administrador, operador) o, para un veterinario, solo con el
 * permiso expreso `animals.publish` que le dio el propietario o un administrador.
 */
export async function canPublishAnimals(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
): Promise<boolean> {
  const roles = await orgRolesOf(tx, organizationId, userId);
  if (roles.some((role) => (ANIMAL_PUBLISH_ROLES as readonly Role[]).includes(role))) {
    return true;
  }
  if (!roles.includes(Role.Veterinarian)) return false;
  const permissions = await memberPermissionsOf(tx, organizationId, userId);
  return permissions.includes('animals.publish');
}
