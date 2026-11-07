import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@adoptafacil/ui';
import { AlertTriangleIcon, PawIcon, ShieldIcon, type IconProps } from '../icons';
import styles from './error-screen.module.scss';

/**
 * Tipos de error que la navegación puede encontrar. Cada uno tiene su código,
 * su ícono y su texto por defecto; quien lo usa puede cambiar título y texto.
 *
 *   not-found → la ruta o el recurso no existe (404)
 *   forbidden → existe, pero esta cuenta no tiene permiso (403)
 *   server    → falló algo al mostrar la página (500 en el cliente)
 *   offline   → el navegador no tiene conexión
 *   update    → se publicó una versión nueva y faltan archivos de la anterior
 */
export type ErrorKind = 'not-found' | 'forbidden' | 'server' | 'offline' | 'update';

export interface ErrorAction {
  label: string;
  /** Enlace interno (React Router). Solo dentro de un router. */
  to?: string;
  /** Enlace de navegación completa (sirve sin router: último recurso). */
  href?: string;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
}

export interface ErrorSuggestion {
  label: string;
  description: string;
  to: string;
}

export interface ErrorScreenProps {
  kind: ErrorKind;
  title?: string;
  message?: ReactNode;
  actions?: ErrorAction[];
  /** Atajos útiles (por ejemplo, en la 404 pública). Requieren router. */
  suggestions?: ErrorSuggestion[];
  /** Versión para el área de contenido del panel (título más pequeño). */
  compact?: boolean;
  /** Mueve el foco al título al montar, para que el lector de pantalla lo anuncie. */
  autoFocus?: boolean;
}

const DEFAULTS: Record<ErrorKind, { code: string; title: string; message: string }> = {
  'not-found': {
    code: 'Error 404',
    title: 'Página no encontrada',
    message:
      'Puede que el enlace esté mal escrito o que la página ya no exista. Te ayudamos a volver al camino.',
  },
  forbidden: {
    code: 'Error 403',
    title: 'Sin acceso',
    message: 'No tienes los permisos necesarios para ver esta sección.',
  },
  server: {
    code: 'Error 500',
    title: 'Algo salió mal',
    message:
      'Tuvimos un problema al mostrar esta página. Intenta de nuevo; si sigue pasando, escríbenos y lo revisamos.',
  },
  offline: {
    code: 'Sin conexión',
    title: 'No hay conexión a internet',
    message: 'Revisa tu conexión y vuelve a intentarlo. No se perdió nada de lo que ya guardaste.',
  },
  update: {
    code: 'Versión nueva',
    title: 'Hay una versión nueva de AdoptaFácil',
    message: 'Actualizamos la plataforma mientras navegabas. Recarga la página para seguir.',
  },
};

function RefreshIcon(props: IconProps) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable={false}
      {...props}
    >
      <path d="M20 11a8 8 0 0 0-14.9-4" />
      <path d="M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 14.9 4" />
      <path d="M20 20v-4h-4" />
    </svg>
  );
}

function KindIcon({ kind }: { kind: ErrorKind }) {
  if (kind === 'not-found') return <PawIcon />;
  if (kind === 'forbidden') return <ShieldIcon />;
  if (kind === 'update') return <RefreshIcon />;
  return <AlertTriangleIcon />;
}

function Action({ action }: { action: ErrorAction }) {
  const className = cn(
    styles.action,
    action.variant === 'secondary' ? styles['action--secondary'] : styles['action--primary'],
  );
  if (action.to) {
    return (
      <Link to={action.to} className={className} onClick={action.onClick}>
        {action.label}
      </Link>
    );
  }
  if (action.href) {
    return (
      <a href={action.href} className={className} onClick={action.onClick}>
        {action.label}
      </a>
    );
  }
  return (
    <button type="button" className={className} onClick={action.onClick}>
      {action.label}
    </button>
  );
}

/**
 * Bloque visual común a todas las pantallas de error: ícono, código, título,
 * explicación en lenguaje claro y caminos de salida. Nunca deja a la persona
 * en un callejón sin salida: siempre hay al menos una acción.
 */
export function ErrorScreen({
  kind,
  title,
  message,
  actions = [],
  suggestions = [],
  compact = false,
  autoFocus = true,
}: ErrorScreenProps) {
  const defaults = DEFAULTS[kind];
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const isFailure = kind === 'server' || kind === 'offline' || kind === 'update';

  useEffect(() => {
    if (autoFocus) headingRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const Heading = compact ? 'h2' : 'h1';

  return (
    <section
      className={styles.screen}
      data-kind={kind}
      data-compact={compact ? 'true' : undefined}
      data-testid={`error-screen-${kind}`}
      role={isFailure ? 'alert' : undefined}
      aria-labelledby={titleId}
    >
      <span className={styles.badge} aria-hidden="true">
        <KindIcon kind={kind} />
      </span>
      <p className={styles.eyebrow}>{defaults.code}</p>
      <Heading id={titleId} ref={headingRef} tabIndex={-1} className={styles.title}>
        {title ?? defaults.title}
      </Heading>
      <p className={styles.message}>{message ?? defaults.message}</p>
      {actions.length > 0 && (
        <div className={styles.actions}>
          {actions.map((action) => (
            <Action key={action.label} action={action} />
          ))}
        </div>
      )}
      {suggestions.length > 0 && (
        <nav className={styles.suggestions} aria-label="Lugares que te pueden servir">
          <p className={styles.suggestions__title}>Quizás buscabas</p>
          <ul className={styles.suggestions__list}>
            {suggestions.map((item) => (
              <li key={item.to}>
                <Link to={item.to} className={styles.suggestions__link}>
                  <strong>{item.label}</strong>
                  <span>{item.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </section>
  );
}
