import { useEffect, useState } from 'react';
import { ANIMAL_PUBLISH_ROLES, Role } from '@adoptafacil/contracts';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { fetchMyPermissions } from '../api/team-api';

/**
 * ¿Puede esta sesión publicar o retirar animales del portal? Por cargo
 * (propietario, administrador, operador) o, el veterinario, con el permiso
 * expreso que le dio el propietario o un administrador. La API decide igual
 * (`canPublishAnimals`); esto solo evita ofrecer un botón que respondería 403.
 */
export function useCanPublishAnimals(): boolean {
  const client = useApiClient();
  const { hasAnyRole, hasRole } = useSession();
  const byRole = hasAnyRole(...ANIMAL_PUBLISH_ROLES);
  const isVet = hasRole(Role.Veterinarian);
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    if (byRole || !isVet) return;
    let active = true;
    fetchMyPermissions(client)
      .then((res) => {
        if (active) setGranted(res.permissions.includes('animals.publish'));
      })
      .catch(() => {
        // Sin respuesta, no se ofrece publicar: la API lo negaría igual.
      });
    return () => {
      active = false;
    };
  }, [client, byRole, isVet]);

  return byRole || granted;
}
