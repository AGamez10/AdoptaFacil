import type { ReactNode } from 'react';
import styles from './landing-pages.module.scss';

/** Encabezado de las páginas que salen de la landing: un solo `h1`, una
 *  frase y las acciones principales, antes del índice de secciones. */
export function PageIntro({
  eyebrow,
  title,
  children,
  actions,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={styles.intro}>
      <div className={styles.intro__inner}>
        <p className={styles.intro__eyebrow}>{eyebrow}</p>
        <h1 className={styles.intro__title}>{title}</h1>
        <p className={styles.intro__lead}>{children}</p>
        {actions && <div className={styles.intro__actions}>{actions}</div>}
      </div>
    </header>
  );
}
