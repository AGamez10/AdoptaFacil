import {
  DEFAULT_PORTAL_TEMPLATE,
  type PortalTemplateId,
  type PortalThemeConfig,
} from '@adoptafacil/contracts';
import type { ApiClient } from '../../../shell/api';
import { isDemoTemplate } from '../../portals/templates/demo/demo-templates';

/**
 * Plantilla elegida en la vista de ejemplo (`/plantillas/:id`) antes de
 * registrarse. Llega en la URL (`/register?plantilla=<id>`) y se recuerda en
 * `sessionStorage` (solo esta pestaña) por si la persona va y vuelve de otra
 * pantalla antes de terminar el registro. Es una preferencia, no un dato
 * personal: si el almacenamiento no está disponible, solo vale la URL.
 */
const KEY = 'af.signupTemplate';

export function readSignupTemplate(search: URLSearchParams): PortalTemplateId | null {
  const fromUrl = search.get('plantilla');
  if (isDemoTemplate(fromUrl)) {
    try {
      sessionStorage.setItem(KEY, fromUrl);
    } catch {
      // Sin almacenamiento la URL basta.
    }
    return fromUrl;
  }
  try {
    const stored = sessionStorage.getItem(KEY);
    return isDemoTemplate(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function forgetSignupTemplate(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nada que limpiar.
  }
}

/**
 * Deja la plantilla elegida como la del portal de la organización recién
 * creada. Nunca pisa una plantilla que ya no sea la de fábrica. Conserva los
 * colores que el servidor ya tiene (el PUT exige `tokens`).
 */
export async function applySignupTemplate(
  client: ApiClient,
  template: PortalTemplateId,
): Promise<void> {
  const current = await client.request<PortalThemeConfig>('/portals/theme');
  const existing = current.template ?? DEFAULT_PORTAL_TEMPLATE;
  if (existing !== DEFAULT_PORTAL_TEMPLATE || template === DEFAULT_PORTAL_TEMPLATE) return;
  await client.request<PortalThemeConfig>('/portals/theme', {
    method: 'PUT',
    json: { tokens: current.tokens ?? {}, template },
  });
}
