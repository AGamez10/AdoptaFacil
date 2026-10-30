import { PORTAL_TEMPLATES, type PortalTemplateId } from '@adoptafacil/contracts';
import { ENGINE_TEMPLATE_IDS } from '../registry';

/** Plantillas que se pueden ver de ejemplo y elegir al registrarse: las de la galería pública. */
export const DEMO_TEMPLATE_IDS: readonly PortalTemplateId[] = ['clasica', ...ENGINE_TEMPLATE_IDS];

export function isDemoTemplate(id: string | null | undefined): id is PortalTemplateId {
  return Boolean(id) && (DEMO_TEMPLATE_IDS as readonly string[]).includes(id as string);
}

export function templateName(id: PortalTemplateId): string {
  return PORTAL_TEMPLATES.find((t) => t.id === id)?.name ?? id;
}

export function templateDemoHref(id: PortalTemplateId): string {
  return `/plantillas/${id}`;
}

/** Enlace al registro que conserva la plantilla elegida. */
export function registerWithTemplateHref(id: PortalTemplateId): string {
  return `/register?plantilla=${encodeURIComponent(id)}`;
}
