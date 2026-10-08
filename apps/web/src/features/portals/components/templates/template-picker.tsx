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
  if (template.tier === 'free') return 'Gratis';
  return PORTAL_TEMPLATE_TIERS_ENFORCED
    ? 'Plan de pago'
    : 'Plan de pago · gratis durante el lanzamiento';
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
