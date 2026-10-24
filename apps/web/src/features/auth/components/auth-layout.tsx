import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  buttonVariants,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cn,
  Logo,
} from '@adoptafacil/ui';
import { CatMascot, DogMascot } from '../../landing/components/illustrations';
import styles from './auth-layout.module.scss';

export interface AuthLayoutProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Footer content (navigation links between auth screens). */
  footer?: ReactNode;
  /** Widen the card for the multi-field registration forms. */
  wide?: boolean;
}

/**
 * Centered, responsive shell for the public auth screens. Carries the brand and
 * a consistent card frame so login/register/forgot/reset look like one flow.
 *
 * F-LANDING-02: a "Volver al inicio" exit to the general portal (`/`, F-LANDING-01)
 * lives here once, so every screen that uses this layout (login, register,
 * forgot, reset) gets it for free instead of duplicating it per page. It is a
 * plain navigation link to an EXISTING public route — it does not touch the
 * returnTo mechanism (RequireAuth/LoginPage's `state.from`), which keeps working
 * unchanged: this is an additional way OUT, not a replacement for it.
 *
 * F1-03+: styled as a SECONDARY (outline) button — visible as a button, but it
 * never competes with the screen's actual primary action (the sólido submit
 * button inside `children`), same hierarchy as the other return-to-home links.
 */
const PROMISES = [
  'Solicitudes y contratos de adopción claros',
  'Tus datos protegidos, solo ves lo que te corresponde',
  'Gratis para personas y organizaciones',
];

export function AuthLayout({ title, description, children, footer, wide }: AuthLayoutProps) {
  return (
    <div className={styles.shell}>
      {/* Panel de marca (rediseño 2026-10): en escritorio ocupa la mitad
          izquierda; en celular es una franja corta sobre el formulario. */}
      <aside className={styles.brand} aria-hidden="true">
        <div className={styles.brand__inner}>
          <p className={styles.brand__title}>
            Cada adopción empieza con <span>un buen comienzo.</span>
          </p>
          <ul className={styles.brand__list}>
            {PROMISES.map((promise) => (
              <li key={promise}>{promise}</li>
            ))}
          </ul>
          <div className={styles.brand__art}>
            <DogMascot className={styles.brand__dog} />
            <CatMascot className={styles.brand__cat} />
          </div>
        </div>
      </aside>

      <main className={styles.main}>
        <div className={cn(styles.column, wide && styles['column--wide'])}>
          <Link
            to="/"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), styles.back)}
          >
            ← Volver al inicio
          </Link>
          <Card className={styles.card}>
            <CardHeader className={cn(styles.header, 'text-center')}>
              <Link to="/" aria-label="Ir al inicio" className="inline-flex">
                <Logo variant="full" size="sm" />
              </Link>
              <CardTitle className={styles.title}>{title}</CardTitle>
              {description && <CardDescription>{description}</CardDescription>}
            </CardHeader>
            <CardContent className="space-y-4">{children}</CardContent>
            {footer && (
              <CardFooter className="justify-center border-t pt-4 text-center text-sm text-muted-foreground">
                <div className="w-full space-y-1">{footer}</div>
              </CardFooter>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
