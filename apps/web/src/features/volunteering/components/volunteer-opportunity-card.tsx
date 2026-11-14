import { Link } from 'react-router-dom';
import type { VolunteerOpportunityPublic } from '@adoptafacil/contracts';
import { Badge } from '@adoptafacil/ui';
import { formatBogota } from '../model/volunteering-view';
import styles from './volunteer-opportunity-card.module.scss';

export interface VolunteerOpportunityCardProps {
  opportunity: VolunteerOpportunityPublic;
}

/**
 * Tarjeta pública de una oportunidad de voluntariado ACTIVA (RF18, M08). Solo
 * columnas públicas del contrato. El botón lleva a `/voluntariado`, que está
 * bajo `RequireAuth`: un visitante sin sesión pasa por el login y vuelve ahí
 * para inscribirse (la inscripción exige cuenta y perfil completo).
 */
export function VolunteerOpportunityCard({ opportunity }: VolunteerOpportunityCardProps) {
  return (
    <article className={styles.card} data-testid="volunteer-opportunity-card">
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
      <Link to="/voluntariado" className={styles.cta}>
        Quiero participar
      </Link>
    </article>
  );
}
