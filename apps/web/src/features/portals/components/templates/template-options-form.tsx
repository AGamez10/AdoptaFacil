import {
  PORTAL_TEMPLATE_OPTIONS,
  type PortalTemplateId,
  type PortalTemplateOptions,
} from '@adoptafacil/contracts';
import { cn } from '@adoptafacil/ui';
import styles from './template-picker.module.scss';

export interface TemplateOptionsFormProps {
  template: PortalTemplateId;
  value: PortalTemplateOptions;
  onChange: (value: PortalTemplateOptions) => void;
}

/**
 * Ajustes propios de la plantilla elegida (Ola 3), armados desde la lista
 * cerrada del contrato: interruptores y opciones, nunca CSS libre.
 */
export function TemplateOptionsForm({ template, value, onChange }: TemplateOptionsFormProps) {
  const defs = PORTAL_TEMPLATE_OPTIONS[template];
  if (defs.length === 0) return null;
  const set = (key: string, next: string | boolean) => onChange({ ...value, [key]: next });

  return (
    <div className={styles.options} data-testid="template-options">
      {defs.map((def) =>
        def.kind === 'toggle' ? (
          <label key={def.key} className={styles.toggle}>
            <input
              type="checkbox"
              role="switch"
              checked={value[def.key] === true}
              onChange={(event) => set(def.key, event.target.checked)}
            />
            <span className={styles.toggle__track} aria-hidden="true" />
            <span>{def.label}</span>
          </label>
        ) : (
          <fieldset key={def.key} className={styles.choice}>
            <legend>{def.label}</legend>
            <div className={styles.choice__row}>
              {def.choices.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  aria-pressed={value[def.key] === choice.value}
                  onClick={() => set(def.key, choice.value)}
                  className={cn(
                    styles.choice__btn,
                    value[def.key] === choice.value && styles['choice__btn--active'],
                  )}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </fieldset>
        ),
      )}
    </div>
  );
}
