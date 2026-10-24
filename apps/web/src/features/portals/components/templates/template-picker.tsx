import { Link } from 'react-router-dom';
import {
  PORTAL_TEMPLATES,
  type PortalTemplateId,
  type PortalTemplateInfo,
} from '@adoptafacil/contracts';
import { cn } from '@adoptafacil/ui';
import styles from './template-picker.module.scss';

/**
 * Selector de plantilla del portal (Ola 3). Muestra las plantillas con una
 * miniatura dibujada (no captura) y su nivel de plan. Las de pago se bloquean
 * solo cuando la API dice que el plan vigente no las incluye
 * (`premiumAvailable` en false: planes encendidos y fuera del lanzamiento).
 */
export interface TemplatePickerProps {
  value: PortalTemplateId;
  onChange: (value: PortalTemplateId) => void;
  /** Si el plan vigente incluye las plantillas de pago. Por defecto, sí. */
  premiumAvailable?: boolean;
}

export function tierLabel(template: PortalTemplateInfo): string {
  return template.tier === 'free' ? 'Gratis' : 'Pro';
}

export interface TemplateUpsellProps {
  /** Si el plan vigente incluye las plantillas de pago. Por defecto, sí. */
  premiumAvailable?: boolean;
  /** Plantilla de pago guardada que hoy no se muestra (el portal usa una gratuita). */
  lockedTemplate?: PortalTemplateId;
}

/**
 * Aviso del plan de pago. Durante el lanzamiento (o con un plan pagado) vende
 * sin bloquear; sin plan, explica que las Pro son del plan de pago y, si el
 * portal volvió a una gratuita, cómo recuperar la elegida.
 */
export function TemplateUpsell({ premiumAvailable = true, lockedTemplate }: TemplateUpsellProps) {
  // Sin plantillas de pago no hay nada que vender.
  if (!PORTAL_TEMPLATES.some((template) => template.tier === 'paid')) return null;
  const lockedName = PORTAL_TEMPLATES.find((t) => t.id === lockedTemplate)?.name;
  return (
    <p className={styles.upsell} data-testid="template-upsell">
      <span className={styles.upsell__badge}>PRO</span>
      <span>
        {lockedName ? (
          <>
            <strong>Tu portal volvió a la plantilla Clásica</strong> porque tu plan ya no incluye{' '}
            {lockedName}. Tu diseño quedó guardado: vuelve solo cuando actives un plan.{' '}
            <Link to="/organizacion/plan">Ver planes</Link>
          </>
        ) : premiumAvailable ? (
          <>
            <strong>Las plantillas Pro están incluidas gratis mientras dure el lanzamiento.</strong>{' '}
            Después serán parte del plan mensual; si no lo activas, tu portal pasa solo a una
            plantilla gratuita.
          </>
        ) : (
          <>
            Las plantillas Pro son parte del plan mensual.{' '}
            <Link to="/organizacion/plan">Ver planes</Link>
          </>
        )}
      </span>
    </p>
  );
}

function Thumb({ id }: { id: PortalTemplateId }) {
  return (
    <span className={styles.thumb} data-thumb={id} aria-hidden="true">
      <span className={styles.thumb__hero}>
        <span />
        <span />
        <span />
      </span>
      <span className={styles.thumb__grid}>
        <span />
        <span />
        <span />
      </span>
    </span>
  );
}

export function TemplatePicker({ value, onChange, premiumAvailable = true }: TemplatePickerProps) {
  return (
    <fieldset className={styles.picker} data-testid="template-picker">
      <legend className="sr-only">Plantilla del portal</legend>
      {PORTAL_TEMPLATES.map((template) => {
        const selected = template.id === value;
        const locked = template.tier === 'paid' && !premiumAvailable;
        return (
          <label
            key={template.id}
            className={cn(
              styles.option,
              selected && styles['option--selected'],
              locked && styles['option--locked'],
            )}
            data-testid={`template-option-${template.id}`}
            data-locked={locked || undefined}
          >
            <input
              type="radio"
              name="portal-template"
              value={template.id}
              checked={selected}
              disabled={locked}
              onChange={() => onChange(template.id)}
              className="sr-only"
            />
            <Thumb id={template.id} />
            <span className={styles.option__head}>
              <span className={styles.option__name}>{template.name}</span>
              <span className={styles.tier} data-tier={template.tier}>
                {locked ? '🔒 ' : ''}
                {tierLabel(template)}
              </span>
            </span>
            <span className={styles.option__tagline}>{template.tagline}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
