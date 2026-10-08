import type { ReactNode } from 'react';
import type { PortalLogoPosition, PortalProfile } from '@adoptafacil/contracts';
import { cn } from '@adoptafacil/ui';
import { OrgTypeBadge } from './org-type-badge';
import styles from './portal-profile-section.module.scss';

export interface PortalProfileSectionProps {
  profile: PortalProfile;
  /** Total de animales adoptables (conteo real del catálogo público), si ya cargó. */
  animalCount?: number;
  /** Posición del logo (S2-PORTAL). Default: 'left'. */
  logoPosition?: PortalLogoPosition;
  /** Acciones principales del hero (ver `PortalHeaderActions`). */
  actions?: ReactNode;
}

const HEADING_ID = 'portal-profile-heading';

/**
 * Documentos que la PLATAFORMA aprobó (criterio `<tipo>:approved` del nivel
 * de verificación, calculado en `modules/org/verification.ts` solo con
 * documentos aprobados y vigentes). Es la única señal de confianza que el
 * portal muestra: el estado de formalización (ESAL, RTE…) hoy lo declara la
 * propia organización (hallazgo SEC-003, tarea R2-2), así que no se pinta
 * como sello hasta que lo decida un PlatformAdmin.
 */
const REVIEWED_DOCUMENT_LABELS: Record<string, string> = {
  'rut:approved': 'RUT revisado por AdoptaFácil',
  'existence_representation_certificate:approved': 'Existencia y representación revisada',
};

export function reviewedDocumentBadges(criteria: readonly string[] | undefined): string[] {
  return (criteria ?? [])
    .map((criterion) => REVIEWED_DOCUMENT_LABELS[criterion])
    .filter((label): label is string => Boolean(label));
}

/** Iniciales (máx. 2) para el avatar de respaldo cuando no hay logo. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');
}

const ShieldCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 3.5l7 2.8V11c0 4.5-3 8-7 9.5-4-1.5-7-5-7-9.5V6.3l7-2.8zM9 12l2 2 4-4"
    />
  </svg>
);

const Pin = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0C18.5 15.4 12 21 12 21z"
    />
    <circle cx="12" cy="10" r="2.3" />
  </svg>
);

/**
 * Hero del portal público (Ola 3, R3-5 · F6). Portada a todo el ancho con
 * velo para que el texto siempre sea legible sobre cualquier foto, logo de la
 * organización, nombre (único h1), una frase, ubicación, el conteo REAL de
 * animales disponibles y la acción principal. Un solo objetivo por pantalla:
 * conocer a los animales. Lee solo `profile.organization` (proyección pública
 * del backend); jamás datos privados.
 */
export function PortalProfileSection({
  profile,
  animalCount,
  logoPosition = 'left',
  actions,
}: PortalProfileSectionProps) {
  const { organization: org, organizationType } = profile;
  const cover = org.coverPhotos?.[0];
  const location = [org.location?.city, org.location?.department].filter(Boolean).join(', ');
  const reviewed = reviewedDocumentBadges(org.verificationLevel?.criteria);

  return (
    <section aria-labelledby={HEADING_ID} className={styles.hero} data-logo={logoPosition}>
      <div className={styles.hero__media} aria-hidden="true">
        {cover ? (
          <img src={cover} alt="" className={styles.hero__image} />
        ) : (
          <div className={styles.hero__imageFallback} />
        )}
        <div className={styles.hero__veil} />
      </div>

      <div className={styles.hero__content}>
        <div className={styles.hero__identity}>
          {org.logoUrl ? (
            <img src={org.logoUrl} alt={`Logo de ${org.name}`} className={styles.hero__logo} />
          ) : (
            <div aria-hidden className={cn(styles.hero__logo, styles['hero__logo--fallback'])}>
              {initials(org.name)}
            </div>
          )}
          <div className={styles.hero__badges}>
            <OrgTypeBadge organizationType={organizationType} />
          </div>
        </div>

        <h1 id={HEADING_ID} className={styles.hero__name}>
          {org.name}
        </h1>

        {org.description && <p className={styles.hero__description}>{org.description}</p>}

        <ul className={styles.hero__facts}>
          {location && (
            <li>
              <Pin />
              {location}
            </li>
          )}
          {typeof animalCount === 'number' && (
            <li data-testid="portal-animal-count">
              <strong>{animalCount}</strong>{' '}
              {animalCount === 1 ? 'animal busca hogar' : 'animales buscan hogar'}
            </li>
          )}
          {org.nit && <li>NIT {org.nit}</li>}
        </ul>

        {reviewed.length > 0 && (
          <ul className={styles.hero__trust} aria-label="Documentos revisados por la plataforma">
            {reviewed.map((label) => (
              <li key={label}>
                <ShieldCheck />
                {label}
              </li>
            ))}
          </ul>
        )}

        {actions}
      </div>
    </section>
  );
}
