import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import styles from './tooltip.module.scss';

/**
 * Tooltip CSS-only feature-local (refactor visual M03): `packages/ui` no
 * tiene `Tooltip` todavía (confirmado por inventario — cero archivos, cero
 * exports). Agregarlo ahí es zona compartida con Fabián, así que por ahora
 * vive aquí, igual que `org-tabs.tsx` en el módulo de organización.
 * TODO(shared-ui): si se necesita en otro módulo, pedirle a Fabián promoverlo
 * a `packages/ui` en vez de mantener esta copia.
 */
export interface TooltipProps {
  label: string;
  children: ReactNode;
  /** `end`: alinea el globo con el borde derecho del botón (no se sale de la pantalla). */
  align?: 'center' | 'end';
}

export function Tooltip({ label, children, align = 'center' }: TooltipProps) {
  const id = useId();
  if (!isValidElement(children)) return <>{children}</>;
  const trigger = cloneElement(children as ReactElement<{ 'aria-describedby'?: string }>, {
    'aria-describedby': id,
  });
  return (
    <span className={styles.tooltip}>
      {trigger}
      <span
        role="tooltip"
        id={id}
        className={
          align === 'end'
            ? `${styles['tooltip__bubble']} ${styles['tooltip__bubble--end']}`
            : styles['tooltip__bubble']
        }
      >
        {label}
      </span>
    </span>
  );
}
