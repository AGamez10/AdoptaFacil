import type { ReactNode } from 'react';
import type { AnimalSummary, OrganizationPublic } from '@adoptafacil/contracts';
import { cn } from '@adoptafacil/ui';
import {
  ageLabel,
  isRecentlyPublished,
  SEX_LABELS,
  SIZE_LABELS,
  SPECIES_LABELS,
  STATUS_LABELS,
} from '../model/animals-catalog';
import styles from '../pages/public-animal-detail-page.module.scss';

export type PublicAnimalOrg = Pick<
  OrganizationPublic,
  'id' | 'name' | 'logoUrl' | 'description' | 'location' | 'nit'
>;

export const ADOPTION_STEPS = [
  'Envías tu solicitud en línea, con tu cuenta.',
  'La organización te contacta y conoce tu hogar.',
  'Firman un contrato claro y empieza su nueva vida.',
];

export interface PublicAnimalDetailArticleProps {
  animal: AnimalSummary;
  org: PublicAnimalOrg | null;
  city?: string;
  /** Botones de la ficha ("Solicitar adopción", "Apadrinar", "Donar"). */
  actions: ReactNode;
}

/**
 * La ficha pública del animal tal como la ve quien visita el portal: foto,
 * datos en fichas de color, la organización que lo cuida y los pasos para
 * adoptar. La usan la página `/o/:slug/animales/:ref` y la vista de ejemplo de
 * las plantillas (que la abre en un diálogo, sin salir de la página).
 */
export function PublicAnimalDetailArticle({
  animal,
  org,
  city,
  actions,
}: PublicAnimalDetailArticleProps) {
  const age = ageLabel(animal.computedAge);
  const facts = [
    { label: 'Especie', value: SPECIES_LABELS[animal.species], tone: 'mint' },
    { label: 'Sexo', value: SEX_LABELS[animal.sex], tone: 'sun' },
    { label: 'Tamaño', value: SIZE_LABELS[animal.size], tone: 'sky' },
    ...(age ? [{ label: 'Edad aproximada', value: age, tone: 'coral' }] : []),
  ];

  return (
    <article className={styles.detail} data-testid="public-animal-detail">
      <div className={styles.media}>
        {animal.photoUrl ? (
          <img
            src={animal.photoUrl}
            alt={`${animal.name}${animal.breed ? `, ${animal.breed}` : ''}`}
            className={styles.media__photo}
            {...{ fetchpriority: 'high' }}
          />
        ) : (
          <div className={styles.media__empty}>
            <span>Sin foto todavía</span>
          </div>
        )}
        <div className={styles.media__badges}>
          {isRecentlyPublished(animal.createdAt) && <span className={styles.badge}>Nuevo</span>}
          <span className={cn(styles.badge, styles['badge--glass'])}>
            {STATUS_LABELS[animal.status]}
          </span>
        </div>
      </div>

      <div className={styles.info}>
        <h1 className={styles.name}>{animal.name}</h1>
        <p className={styles.subtitle}>
          {[animal.breed, city].filter(Boolean).join(' · ') || 'Busca un hogar para toda la vida'}
        </p>

        <dl className={styles.facts}>
          {facts.map((fact) => (
            <div key={fact.label} className={styles.fact} data-tone={fact.tone}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>

        <div className={styles.actions}>{actions}</div>

        {org && (
          <section className={styles.org} aria-label="Organización responsable">
            {org.logoUrl ? (
              <img src={org.logoUrl} alt="" className={styles.org__logo} />
            ) : (
              <span className={styles.org__logo} aria-hidden="true">
                {org.name.charAt(0)}
              </span>
            )}
            <div className={styles.org__body}>
              <p className={styles.org__eyebrow}>Lo cuida</p>
              <p className={styles.org__name}>{org.name}</p>
              {org.location?.city && <p className={styles.org__meta}>{org.location.city}</p>}
            </div>
          </section>
        )}

        <section className={styles.steps} aria-labelledby="adopt-steps-title">
          <h2 id="adopt-steps-title" className={styles.steps__title}>
            Así es adoptar a {animal.name}
          </h2>
          <ol className={styles.steps__list}>
            {ADOPTION_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      </div>
    </article>
  );
}
