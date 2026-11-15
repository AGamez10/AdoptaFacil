import { Link } from 'react-router-dom';
import type { VolunteerOpportunityPublic } from '@adoptafacil/contracts';
import { Badge } from '@adoptafacil/ui';
import { formatBogota, volunteerSignupHref } from '../model/volunteering-view';
import styles from './volunteer-opportunity-card.module.scss';

export interface VolunteerOpportunityCardProps {
  opportunity: VolunteerOpportunityPublic;
  /** La jornada que la persona eligió en otra pantalla (se resalta). */
  highlighted?: boolean;
}

/**
 * Tarjeta pública de una oportunidad de voluntariado ACTIVA (RF18, M08). Solo
 * columnas públicas del contrato. Verla no pide cuenta; «Quiero participar»
 * lleva a `/voluntariado?oportunidad=<id>&inscribirme=1` (bajo `RequireAuth`):
 * un visitante sin sesión entra o crea su cuenta y vuelve a confirmar ESTA
 * jornada a un clic.
 */
export function VolunteerOpportunityCard({
  opportunity,
  highlighted,
}: VolunteerOpportunityCardProps) {
  return (
    <article
      id={`oportunidad-${opportunity.id}`}
      aria-current={highlighted ? 'true' : undefined}
      className={`${styles.card}${highlighted ? ' ring-2 ring-primary' : ''}`}
      data-testid="volunteer-opportunity-card"
    >
      <div className={styles.meta}>
        <Badge variant="secondary">{opportunity.category}</Badge>
        {opportunity.appliesToStudentService && <Badge variant="outline">Servicio social</Badge>}
        <span className="text-xs text-muted-foreground">{opportunity.organizationName}</span>
      </div>
      <h3 className={styles.title}>{opportunity.title}</h3>
      {opportunity.description && <p className={styles.description}>{opportunity.description}</p>}
      <p className={styles.details}>
        {formatBogota(opportunity.startDate)} – {formatBogota(opportunity.endDate)} ·{' '}
        {opportunity.location}
        {typeof opportunity.capacity === 'number' && ` · ${opportunity.capacity} cupos`}
      </p>
      <Link to={volunteerSignupHref(opportunity.id)} className={styles.cta}>
        Quiero participar
      </Link>
    </article>
  );
}
