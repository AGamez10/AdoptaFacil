import { Link } from 'react-router-dom';
import {
  PLAN_CATALOG,
  PLAN_KEYS,
  PORTAL_TEMPLATES,
  planIncludes,
  type PortalTemplateId,
  type PortalTemplateInfo,
} from '@adoptafacil/contracts';
import { cn } from '@adoptafacil/ui';
import styles from './template-picker.module.scss';

/**
 * Selector de plantilla del portal (Ola 3). Muestra las plantillas con una
 * miniatura dibujada (no captura): primero las gratuitas y después, en una
 * sola sección marcada, las Pro. Las de pago se bloquean
 * solo cuando la API dice que el plan vigente no las incluye
 * (`premiumAvailable` en false: planes encendidos y fuera del lanzamiento).
 */
export interface TemplatePickerProps {
  value: PortalTemplateId;
  onChange: (value: PortalTemplateId) => void;
  /** Si el plan vigente incluye las plantillas de pago. Por defecto, sí. */
  premiumAvailable?: boolean;
  /** Plantilla Pro guardada que hoy no se muestra (el portal usa una gratuita). */
  lockedTemplate?: PortalTemplateId;
}

export function tierLabel(template: PortalTemplateInfo): string {
  return template.tier === 'free' ? 'Gratis' : 'Pro';
}

/** Planes que incluyen las plantillas Pro, en el orden del catálogo ("Crece y Pro"). */
export function premiumPlanNames(joiner: 'y' | 'o' = 'y'): string {
  const names = PLAN_KEYS.filter((key) => planIncludes(key, 'portalPremiumDesigns')).map(
    (key) => PLAN_CATALOG[key].name,
  );
  if (names.length <= 1) return names[0] ?? 'Pro';
  return `${names.slice(0, -1).join(', ')} ${joiner} ${names[names.length - 1]}`;
}

export interface TemplateUpsellProps {
  /** Si el plan vigente incluye las plantillas de pago. Por defecto, sí. */
  premiumAvailable?: boolean;
  /** Plantilla de pago guardada que hoy no se muestra (el portal usa una gratuita). */
  lockedTemplate?: PortalTemplateId;
}

/**
 * Estado del plan dentro de la sección Pro. Durante el lanzamiento (o con un
 * plan pagado) vende sin bloquear; sin plan, explica que las Pro son del plan
 * de pago y, si el portal volvió a una gratuita, cómo recuperar la elegida.
 * La autoridad real es el servidor (403 `PLAN_REQUIRED` al guardar una Pro).
 */
export function TemplateUpsell({ premiumAvailable = true, lockedTemplate }: TemplateUpsellProps) {
  const lockedName = PORTAL_TEMPLATES.find((t) => t.id === lockedTemplate)?.name;
  return (
    <p className={styles.pro__status} data-testid="template-upsell">
      {lockedName ? (
        <>
          <strong>Tu portal volvió a la plantilla Clásica</strong> porque tu plan ya no incluye{' '}
          {lockedName}. Tu diseño quedó guardado: vuelve solo cuando actives un plan.{' '}
          <Link to="/organizacion/plan">Ver planes</Link>
        </>
      ) : premiumAvailable ? (
        <>
          <strong>Incluidas gratis mientras dure el lanzamiento.</strong> Después necesitarás un
          plan {premiumPlanNames('o')}; si no lo activas, tu portal pasa solo a una plantilla
          gratuita.
        </>
      ) : (
        <>
          <strong>Tu plan actual no las incluye.</strong> Puedes verlas, pero para usarlas necesitas
          un plan {premiumPlanNames('o')}. <Link to="/organizacion/plan">Ver planes</Link>
        </>
      )}
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

function LockIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

interface OptionProps {
  template: PortalTemplateInfo;
  selected: boolean;
  locked: boolean;
  onChange: (value: PortalTemplateId) => void;
}

function TemplateOption({ template, selected, locked, onChange }: OptionProps) {
  return (
    <label
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
      <span className={styles.option__media}>
        <Thumb id={template.id} />
        {locked && (
          <span className={styles.option__lock}>
            <LockIcon />
            Requiere plan
          </span>
        )}
      </span>
      <span className={styles.option__head}>
        <span className={styles.option__name}>{template.name}</span>
        <span className={styles.tier} data-tier={template.tier}>
          {tierLabel(template)}
        </span>
      </span>
      <span className={styles.option__tagline}>{template.tagline}</span>
    </label>
  );
}

/**
 * Un solo grupo de radios con dos bloques: las gratuitas y, una sola vez, la
 * sección "Plantillas Pro" con su etiqueta, el plan que las incluye y, sin ese
 * plan, el bloqueo. El bloqueo aquí es solo de interfaz; el servidor rechaza
 * igual una plantilla Pro sin plan.
 */
export function TemplatePicker({
  value,
  onChange,
  premiumAvailable = true,
  lockedTemplate,
}: TemplatePickerProps) {
  const free = PORTAL_TEMPLATES.filter((template) => template.tier === 'free');
  const paid = PORTAL_TEMPLATES.filter((template) => template.tier === 'paid');
  return (
    <fieldset className={styles.picker} data-testid="template-picker">
      <legend className="sr-only">Plantilla del portal</legend>
      <div className={styles.grid} data-testid="template-group-free">
        {free.map((template) => (
          <TemplateOption
            key={template.id}
            template={template}
            selected={template.id === value}
            locked={false}
            onChange={onChange}
          />
        ))}
      </div>
      {paid.length > 0 && (
        <section
          className={styles.pro}
          data-testid="template-group-pro"
          data-locked={!premiumAvailable || undefined}
          aria-labelledby="template-pro-title"
        >
          <header className={styles.pro__head}>
            <span className={styles.pro__badge}>PRO</span>
            <span className={styles.pro__text}>
              <span id="template-pro-title" className={styles.pro__title}>
                Plantillas Pro
              </span>
              <span className={styles.pro__plans}>
                Incluidas en los planes {premiumPlanNames()}
              </span>
            </span>
          </header>
          <TemplateUpsell premiumAvailable={premiumAvailable} lockedTemplate={lockedTemplate} />
          <div className={styles.grid}>
            {paid.map((template) => (
              <TemplateOption
                key={template.id}
                template={template}
                selected={template.id === value}
                locked={!premiumAvailable}
                onChange={onChange}
              />
            ))}
          </div>
        </section>
      )}
    </fieldset>
  );
}
