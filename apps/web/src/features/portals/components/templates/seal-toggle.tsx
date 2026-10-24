import { Link } from 'react-router-dom';
import styles from './template-picker.module.scss';

export interface SealToggleProps {
  /** La elección guardada (o recién cambiada) de la organización. */
  hideSeal: boolean;
  /** Si el plan vigente permite quitar el sello (`portalRemoveSeal`). */
  available: boolean;
  onChange: (hideSeal: boolean) => void;
}

/**
 * Sello "Hecho con AdoptaFácil" del pie del portal (planes Crece y Pro). Solo
 * quita esa línea: los enlaces a Términos, Datos personales, Qué es AdoptaFácil
 * y Reportar siguen siempre en el pie.
 */
export function SealToggle({ hideSeal, available, onChange }: SealToggleProps) {
  return (
    <div className="space-y-1.5" data-testid="seal-toggle">
      <label className={styles.toggle} aria-disabled={!available || undefined}>
        <input
          type="checkbox"
          role="switch"
          checked={available && hideSeal}
          disabled={!available}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className={styles.toggle__track} aria-hidden="true" />
        <span>Quitar el sello &quot;Hecho con AdoptaFácil&quot; del pie</span>
      </label>
      <p className="text-xs text-muted-foreground">
        {available ? (
          'Los enlaces legales del pie (Términos, Datos personales y Reportar) siempre se muestran.'
        ) : hideSeal ? (
          <>
            Tu elección quedó guardada: el sello se vuelve a quitar solo cuando tengas un plan que
            lo incluya. <Link to="/organizacion/plan">Ver planes</Link>
          </>
        ) : (
          <>
            Disponible en los planes Crece y Pro. <Link to="/organizacion/plan">Ver planes</Link>
          </>
        )}
      </p>
    </div>
  );
}
