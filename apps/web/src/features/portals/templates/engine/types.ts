import type { PortalPremiumDesignId, PortalDesignId } from '@adoptafacil/contracts';
import type { Kit } from './kit';
import type { TplModel } from './model';
import type { Motion, createCatalog } from './runtime';

export type ThreeModule = typeof import('three');

/** Lo que recibe el `init` de una plantilla al montarse sobre datos reales. */
export interface TemplateEnv {
  m: TplModel;
  kit: Kit;
  motion: Motion;
  catalog: ReturnType<typeof createCatalog>;
  /** Three.js (solo para plantillas `webgl`, y solo si el navegador tiene WebGL). */
  THREE: ThreeModule | null;
  /** Color de marca actual en hex (#rrggbb), leído de los tokens de la organización. */
  brand: () => string;
  /** Navegación SPA a una ruta interna (detalle del animal, campaña, etc.). */
  go: (href: string) => void;
}

/** Una plantilla visual del portal público. */
export interface TemplateDesign {
  id: Exclude<PortalDesignId, 'clasico'> | PortalPremiumDesignId;
  /** CSS de la plantilla, acotado a `.tpl-<id>`. */
  css: string;
  /** Familias de Google Fonts (parámetro `family=` ya armado). */
  fonts?: string;
  /** Usa la paleta del kit compartido (`.kit`). */
  kit?: boolean;
  /** Necesita WebGL/Three.js (tiene respaldo sin WebGL). */
  webgl?: boolean;
  /** Plantilla de pago (dos experiencias, claro y oscuro). Ver `PREMIUM_TEMPLATES_ENABLED`. */
  premium?: boolean;
  html: (m: TplModel, kit: Kit) => string;
  init?: (app: HTMLElement, env: TemplateEnv) => void;
}
