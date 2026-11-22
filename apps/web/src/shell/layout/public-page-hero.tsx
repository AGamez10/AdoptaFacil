import type { ReactNode } from 'react';
import { cn } from '@adoptafacil/ui';
import styles from './public-page-hero.module.scss';

export type PublicHeroTone = 'cream' | 'mint' | 'sun' | 'sky' | 'coral';

/**
 * Encabezado estándar de una página pública: franja de color, eyebrow, un
 * solo `h1` y una frase. `children` va debajo (buscador, filtros, acciones).
 */
export function PublicPageHero({
  eyebrow,
  title,
  lead,
  tone = 'cream',
  children,
  titleId,
}: {
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
  tone?: PublicHeroTone;
  children?: ReactNode;
  titleId?: string;
}) {
  return (
    <header className={styles.hero} data-tone={tone}>
      <div className={styles.container}>
        {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
        <h1 id={titleId} className={styles.title}>
          {title}
        </h1>
        {lead && <p className={styles.lead}>{lead}</p>}
        {children && <div className={styles.extra}>{children}</div>}
      </div>
    </header>
  );
}

/** Cuerpo de una página pública, alineado con el encabezado. */
export function PublicPageBody({
  children,
  narrow = false,
  className,
}: {
  children: ReactNode;
  narrow?: boolean;
  className?: string;
}) {
  return (
    <div className={cn(styles.container, styles.body, className)} data-narrow={narrow || undefined}>
      {children}
    </div>
  );
}
