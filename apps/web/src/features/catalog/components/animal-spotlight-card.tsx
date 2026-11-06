import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { PublicAnimalSummary } from '@adoptafacil/contracts';
import { cn } from '@adoptafacil/ui';
import {
  SEX_LABELS,
  SIZE_LABELS,
  SPECIES_LABELS,
  ageLabel,
  isRecentlyPublished,
  publicAnimalDetailHref,
} from '../../portals/model/animals-catalog';
import styles from './animal-spotlight-card.module.scss';

export interface AnimalSpotlightCardProps {
  animal: PublicAnimalSummary;
  /** `rail` = tarjeta alta para filas deslizables; `grid` = listado. */
  layout?: 'rail' | 'grid';
  /** La primera tarjeta visible se carga con prioridad (mejora el LCP). */
  priority?: boolean;
  className?: string;
}

/** Huella como relleno cuando el animal no tiene foto o la foto falla. */
function PhotoFallback({ name }: { name: string }) {
  return (
    <div className={styles.card__fallback} role="img" aria-label={`${name}, sin foto todavía`}>
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <ellipse cx="24" cy="31" rx="11" ry="9" fill="currentColor" />
        <ellipse cx="10" cy="20" rx="5" ry="6.5" fill="currentColor" />
        <ellipse cx="38" cy="20" rx="5" ry="6.5" fill="currentColor" />
        <ellipse cx="18" cy="10" rx="4.5" ry="6" fill="currentColor" />
        <ellipse cx="30" cy="10" rx="4.5" ry="6" fill="currentColor" />
      </svg>
    </div>
  );
}

/**
 * Tarjeta grande de un animal del catálogo general (marca v3): foto
 * protagonista, nombre fuerte y datos en fichas. Toda la tarjeta es un enlace
 * a su ficha pública. Solo campos públicos de `PublicAnimalSummary`.
 */
export function AnimalSpotlightCard({
  animal,
  layout = 'grid',
  priority = false,
  className,
}: AnimalSpotlightCardProps) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const age = ageLabel(animal.computedAge);
  const isNew = isRecentlyPublished(animal.createdAt);
  const facts = [SPECIES_LABELS[animal.species], age, SIZE_LABELS[animal.size]].filter(
    (value): value is string => Boolean(value),
  );
  const sex = animal.sex !== 'unknown' ? SEX_LABELS[animal.sex] : null;
  const { organization } = animal;

  return (
    <article
      className={cn(styles.card, layout === 'rail' && styles['card--rail'], className)}
      data-testid="animal-spotlight-card"
    >
      <Link
        to={publicAnimalDetailHref(organization.slug, animal)}
        state={{ animal }}
        className={styles.card__link}
        aria-label={`Conoce a ${animal.name}${age ? `, ${age}` : ''}${
          organization.city ? `, en ${organization.city}` : ''
        }`}
      >
        <div className={styles.card__media}>
          {animal.photoUrl && !photoFailed ? (
            <img
              src={animal.photoUrl}
              alt={`${animal.name}${animal.breed ? `, ${animal.breed}` : ''}`}
              className={styles.card__photo}
              loading={priority ? 'eager' : 'lazy'}
              decoding="async"
              {...(priority ? { fetchpriority: 'high' } : {})}
              onError={() => setPhotoFailed(true)}
            />
          ) : (
            <PhotoFallback name={animal.name} />
          )}
          <div className={styles.card__badges}>
            {isNew && <span className={styles.card__badge}>Nuevo</span>}
            {organization.city && (
              <span className={cn(styles.card__badge, styles['card__badge--glass'])}>
                {organization.city}
              </span>
            )}
          </div>
        </div>
        <div className={styles.card__body}>
          <div className={styles.card__titleRow}>
            <h3 className={styles.card__name}>{animal.name}</h3>
            {sex && <span className={styles.card__sex}>{sex}</span>}
          </div>
          {animal.breed && <p className={styles.card__breed}>{animal.breed}</p>}
          <ul className={styles.card__facts} aria-label="Datos">
            {facts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
          <p className={styles.card__org}>
            <span className={styles.card__orgDot} aria-hidden="true" />
            {organization.name}
          </p>
        </div>
      </Link>
    </article>
  );
}
