import { OrganizationStatus } from '@adoptafacil/contracts';
import type { BadgeVariant } from '@adoptafacil/ui';

/** How each operational status (R2-1) reads in the UI. */
export const ORGANIZATION_STATUS_VIEW: Record<
  OrganizationStatus,
  { label: string; badge: BadgeVariant; ownerHint: string }
> = {
  [OrganizationStatus.Draft]: {
    label: 'Borrador',
    badge: 'secondary',
    ownerHint:
      'Tu portal aún no es público. Completa tu perfil y envía la organización a revisión cuando estés listo.',
  },
  [OrganizationStatus.PendingReview]: {
    label: 'En revisión',
    badge: 'info',
    ownerHint:
      'El equipo de AdoptaFácil está revisando tu organización. Tu portal se publicará cuando la aprueben.',
  },
  [OrganizationStatus.Observed]: {
    label: 'Con observaciones',
    badge: 'warning',
    ownerHint: 'Corrige lo que te pidieron y vuelve a enviar a revisión.',
  },
  [OrganizationStatus.Approved]: {
    label: 'Aprobada',
    badge: 'success',
    ownerHint: 'Tu portal es público y tus animales aparecen en el catálogo.',
  },
  [OrganizationStatus.Rejected]: {
    label: 'Rechazada',
    badge: 'destructive',
    ownerHint: 'La revisión no fue aprobada. Revisa el motivo o escríbenos.',
  },
  [OrganizationStatus.Suspended]: {
    label: 'Suspendida',
    badge: 'destructive',
    ownerHint: 'Tu organización está suspendida. Escríbenos para resolverlo.',
  },
};
