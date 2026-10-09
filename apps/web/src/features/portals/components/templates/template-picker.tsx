import {
  PORTAL_TEMPLATES,
  PORTAL_TEMPLATE_TIERS_ENFORCED,
  type PortalTemplateId,
  type PortalTemplateInfo,
} from '@adoptafacil/contracts';
import { cn } from '@adoptafacil/ui';
import styles from './template-picker.module.scss';

/**
 * Selector de plantilla del portal (Ola 3). Muestra las cuatro plantillas con
 * una miniatura dibujada (no captura) y su nivel de plan. El nivel es un
 * PARÁMETRO pendiente del hilo de planes (TODO(client)): mientras
 * `PORTAL_TEMPLATE_TIERS_ENFORCED` sea false, ninguna se bloquea.
 */
export interface TemplatePickerProps {
  value: PortalTemplateId;
  onChange: (value: PortalTemplateId) => void;
}

export function tierLabel(template: PortalTemplateInfo): string {
  return template.tier === 'free' ? 'Gratis' : 'Pro';
}

/**
 * Aviso del plan de pago: vende sin bloquear. Mientras los niveles no se
 * cobren (`PORTAL_TEMPLATE_TIERS_ENFORCED`), dice que las Pro están incluidas.
 */
export function TemplateUpsell() {
  return (
    <p className={styles.upsell} data-testid="template-upsell">
      <span className={styles.upsell__badge}>PRO</span>
      <span>
        {PORTAL_TEMPLATE_TIERS_ENFORCED ? (
          <>Las plantillas Pro son parte del plan de pago.</>
        ) : (
          <>
            <strong>Las plantillas Pro están incluidas gratis durante el lanzamiento.</strong> Más
            adelante serán parte del plan de pago, junto con tu dominio propio.
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

export function TemplatePicker({ value, onChange }: TemplatePickerProps) {
  return (
    <fieldset className={styles.picker} data-testid="template-picker">
      <legend className="sr-only">Plantilla del portal</legend>
      {PORTAL_TEMPLATES.map((template) => {
        const selected = template.id === value;
        return (
          <label
            key={template.id}
            className={cn(styles.option, selected && styles['option--selected'])}
            data-testid={`template-option-${template.id}`}
          >
            <input
              type="radio"
              name="portal-template"
              value={template.id}
              checked={selected}
              onChange={() => onChange(template.id)}
              className="sr-only"
            />
            <Thumb id={template.id} />
            <span className={styles.option__head}>
              <span className={styles.option__name}>{template.name}</span>
              <span className={styles.tier} data-tier={template.tier}>
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
