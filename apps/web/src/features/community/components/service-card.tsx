import { Link } from 'react-router-dom';
import { ServiceCategory, type ServiceListingPublic } from '@adoptafacil/contracts';
import { SERVICE_CATEGORY_SINGULAR, initials, ratingLabel } from '../model/directory-view';

/** Banda de color por tipo de servicio (tokens de marca, nunca colores crudos). */
export const CATEGORY_TONE: Record<ServiceCategory, string> = {
  [ServiceCategory.Veterinary]: 'bg-brand-teal/15 text-brand-teal-dark',
  [ServiceCategory.Grooming]: 'bg-brand-coral/15 text-brand-navy',
  [ServiceCategory.Walking]: 'bg-brand-gold/20 text-brand-navy',
  [ServiceCategory.PetShop]: 'bg-brand-navy/10 text-brand-navy',
};

export interface ServiceCardProps {
  service: ServiceListingPublic;
}

/**
 * Tarjeta del directorio de servicios (Comunidad). Una banda de color por
 * tipo, el sello "Perfil revisado" (todo perfil público pasó por la
 * moderación de la plataforma), la calificación y una acción clara.
 */
export function ServiceCard({ service }: ServiceCardProps) {
  return (
    <article
      data-testid="service-card"
      className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:shadow-md"
    >
      <div
        className={`relative flex h-28 items-center justify-center ${CATEGORY_TONE[service.category]}`}
      >
        <span className="absolute left-3 top-3 rounded-md bg-card/90 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-foreground">
          Perfil revisado
        </span>
        <span
          aria-hidden="true"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-card text-xl font-bold shadow-sm"
        >
          {initials(service.name)}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {SERVICE_CATEGORY_SINGULAR[service.category]} · {service.city}
        </p>
        <h3 className="text-lg font-bold leading-tight">{service.name}</h3>
        <p className="text-sm text-muted-foreground">
          {ratingLabel(service.ratingAverage, service.ratingCount)}
        </p>
        {service.description && (
          <p className="line-clamp-2 text-sm text-foreground/80">{service.description}</p>
        )}
        <div className="mt-auto pt-3">
          <Link
            to={`/servicios/${encodeURIComponent(service.id)}`}
            className="block rounded-lg border-2 border-primary py-2 text-center text-sm font-semibold text-primary transition hover:bg-primary hover:text-primary-foreground"
          >
            Ver perfil y contacto
          </Link>
        </div>
      </div>
    </article>
  );
}
