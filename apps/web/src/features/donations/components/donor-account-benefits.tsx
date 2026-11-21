import { useId } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { buttonVariants, cn } from '@adoptafacil/ui';
import { accessPathWithReturn, returnPathOf } from '../../../shell/auth';
import { IconCheck } from '../../landing/components/landing-icons';
import styles from './donor-account-benefits.module.scss';

/** Lo que gana un donante con cuenta. Solo funciones que existen hoy. */
export const DONOR_ACCOUNT_BENEFITS: readonly { title: string; detail: string }[] = [
  {
    title: 'Tu historial y tus recibos en un solo lugar',
    detail: 'Sin cuenta, solo tienes el enlace del correo, que vence a los 30 días.',
  },
  {
    title: 'Tus certificados siempre a mano',
    detail: 'Descárgalos cuando los necesites, por ejemplo para tu declaración de renta.',
  },
  {
    title: 'Donas más rápido la próxima vez',
    detail: 'Tus datos quedan guardados y no tienes que escribirlos de nuevo.',
  },
  {
    title: 'Sigue tus adopciones y tu voluntariado',
    detail: 'Tus solicitudes y tus ofertas de ayuda, con su estado al día.',
  },
];

export interface DonorAccountBenefitsProps {
  /** `panel`: tarjeta completa. `compact`: solo la lista y un enlace (al lado del formulario). */
  variant?: 'panel' | 'compact';
  /** A dónde volver tras crear la cuenta o iniciar sesión (por defecto, aquí mismo). */
  returnTo?: string;
  title?: string;
  /** Aclaración opcional bajo los botones. */
  note?: string;
  className?: string;
}

/**
 * Invita al visitante a crear su cuenta SIN bloquear la donación (requisito
 * del cliente: donar nunca exige cuenta). Explica qué gana, en concreto.
 */
export function DonorAccountBenefits({
  variant = 'panel',
  returnTo,
  title = '¿Por qué crear tu cuenta gratis?',
  note,
  className,
}: DonorAccountBenefitsProps) {
  const location = useLocation();
  const back = returnTo ?? returnPathOf(location);
  const titleId = useId();
  return (
    <section
      className={cn(
        styles.benefits,
        variant === 'compact' && styles['benefits--compact'],
        className,
      )}
      aria-labelledby={titleId}
      data-testid="donor-account-benefits"
    >
      <p className={styles.benefits__eyebrow}>Opcional · Puedes donar sin cuenta</p>
      <h2 id={titleId} className={styles.benefits__title}>
        {title}
      </h2>
      <ul className={styles.benefits__list}>
        {DONOR_ACCOUNT_BENEFITS.map((benefit) => (
          <li key={benefit.title} className={styles.benefits__item}>
            <span className={styles.benefits__check} aria-hidden>
              <IconCheck width={14} height={14} />
            </span>
            <span>
              <span className={styles['benefits__item-title']}>{benefit.title}</span>
              {variant === 'panel' && (
                <span className={styles['benefits__item-detail']}>{benefit.detail}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <div className={styles.benefits__actions}>
        <Link
          to={accessPathWithReturn('/register', back)}
          className={cn(buttonVariants({ size: variant === 'panel' ? 'default' : 'sm' }))}
          data-testid="donor-benefits-register"
        >
          Crear cuenta gratis
        </Link>
        <Link
          to={accessPathWithReturn('/login', back)}
          className={styles.benefits__login}
          data-testid="donor-benefits-login"
        >
          Ya tengo cuenta
        </Link>
      </div>
      {note && <p className={styles.benefits__note}>{note}</p>}
    </section>
  );
}
