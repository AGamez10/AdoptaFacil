import {
  OrganizationStatus,
  Role,
  type Organization,
  type OrganizationStatusView,
} from '@adoptafacil/contracts';
import type { ApiClient } from '../../../shell/api';

export interface PortalReadinessItem {
  key: string;
  label: string;
  done: boolean;
  /** Dónde se completa (pestaña de "Mi organización"), si aplica. */
  tab?: string;
  /** Obligatorio para que el portal sea público; si no, solo lo hace verse completo. */
  required: boolean;
}

/**
 * Qué falta para que el portal público muestre algo. Lo OBLIGATORIO es lo que
 * la base de datos exige de verdad (`public_org_*`: el perfil necesita
 * dirección pública —slug— y la organización debe estar aprobada por la
 * plataforma); lo demás es lo que hace que el portal se vea completo.
 */
export function portalReadiness(
  org: Organization,
  status: OrganizationStatus | null,
): PortalReadinessItem[] {
  return [
    {
      key: 'slug',
      label: 'Dirección de tu portal público',
      done: Boolean(org.slug?.trim()),
      tab: 'institucional',
      required: true,
    },
    {
      key: 'review',
      label:
        status === OrganizationStatus.PendingReview
          ? 'Revisión de AdoptaFácil (en curso)'
          : 'Enviar tu organización a revisión y que la aprueben',
      done: status === OrganizationStatus.Approved,
      required: true,
    },
    {
      key: 'description',
      label: 'Descripción corta',
      done: Boolean(org.description?.trim()),
      tab: 'institucional',
      required: false,
    },
    {
      key: 'city',
      label: 'Departamento y ciudad',
      done: Boolean(org.location?.city?.trim()),
      tab: 'ubicacion',
      required: false,
    },
    {
      key: 'contact',
      label: 'Un medio de contacto (correo, WhatsApp o teléfono)',
      done: Boolean(org.contactEmail?.trim() || org.whatsapp?.trim() || org.phone?.trim()),
      tab: 'contacto',
      required: false,
    },
    {
      key: 'logo',
      label: 'Logo y foto de portada',
      done: Boolean(org.logoUrl?.trim() && org.coverPhotos?.[0]?.trim()),
      tab: 'imagenes',
      required: false,
    },
    {
      key: 'about',
      label: 'Quiénes somos',
      done: Boolean(org.aboutUs?.trim()),
      tab: 'nosotros',
      required: false,
    },
  ];
}

/**
 * La organización tiene algo que hacer ella misma antes de que su portal sea
 * público: le falta la dirección pública, o aún no la envía a revisión (o se
 * la devolvieron con observaciones). "En revisión" no cuenta: ahí ya no
 * depende de ella.
 */
export function needsOrgSetup(org: Organization, status: OrganizationStatus | null): boolean {
  if (!org.slug?.trim()) return true;
  return status === OrganizationStatus.Draft || status === OrganizationStatus.Observed;
}

/**
 * Destino después de iniciar sesión o registrarse sin una ruta pedida: quien
 * gestiona una organización (dueño o administrador) que aún no puede publicar
 * su portal va primero a "Mi organización". Cualquier otra cuenta (o un error)
 * sigue a su inicio.
 */
export async function landingAfterSignIn(client: ApiClient): Promise<string> {
  try {
    const roles = await client.request<Role[]>('/rbac/my-roles');
    if (!roles?.some((role) => role === Role.Owner || role === Role.Administrator)) return '/';
    const [org, status] = await Promise.all([
      client.request<Organization>('/org/profile'),
      client
        .request<OrganizationStatusView>('/org/status')
        .then((view) => view?.status ?? null)
        .catch(() => null),
    ]);
    return org?.id && needsOrgSetup(org, status) ? '/organizacion' : '/';
  } catch {
    return '/';
  }
}
