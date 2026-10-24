// Module: portals · Contracts owner: @fabian
//
// View-model del PORTAL PÚBLICO rico en `/o/:slug` (§M14). El portal se compone
// de una sección "perfil" (identidad REAL de la organización) más varias
// secciones AGREGADAS (mascotas en adopción, campaña activa, necesita hoy,
// transparencia / libro público). Hasta que existan sus módulos dueños, esas
// secciones se renderizan como placeholders estructurados con su punto de
// integración documentado.
//
// IMPORTANTE — SÓLO TIPOS: `@adoptafacil/contracts` se compila a CommonJS y un
// export de VALOR (enum/const) rompe el build de `web` (rollup no resuelve los
// re-exports CJS; ver deuda "named export CJS" / T-015 en docs/TASKS.md). Por eso
// los estados y tipos van como uniones de string, no como enums en runtime; los
// VALORES en runtime (plantilla de secciones) viven en la feature web.
import type { OrganizationPublic, OrganizationType } from './org';

/**
 * Tipo de organización mostrado en el badge del perfil (§M14, T-030). Anclado al
 * ENUM CANÓNICO `OrganizationType` de @sebastian (módulo `org`), consumido por
 * contrato (M14 no lo redefine). El `| (string & {})` reproduce EXACTAMENTE la
 * forma de `OrganizationPublic.organizationType`, para que el perfil lo herede sin
 * cast y para admitir valores que el cliente agregue antes de que el enum los liste
 * (forward-compat aditiva). Sólo tipo: no emite valor (build CJS a salvo).
 */
export type PortalOrganizationType = OrganizationType | (string & {});

/** Estado de render de una sección del portal en un instante dado. */
export type PortalSectionStatus = 'loading' | 'ready' | 'empty' | 'placeholder' | 'error';

/** Secciones agregadas que componen el portal rico, además del perfil. */
export type PortalSectionKind =
  'pets' | 'products' | 'activeCampaign' | 'needsToday' | 'transparency';

/**
 * Una sección agregada del portal. Hoy nace en `status: 'placeholder'` con su
 * `integrationPoint` documentado; el módulo dueño la cablea (→ 'ready' / 'empty')
 * cuando exista. La sección NO transporta datos de negocio todavía: el view-model
 * es puramente estructural para que la maqueta del portal sea estable.
 */
export interface PortalSection {
  kind: PortalSectionKind;
  /** Título visible de la sección. */
  title: string;
  /** Texto de apoyo mostrado en el empty state mientras no hay datos. */
  description: string;
  /** Estado de render actual. */
  status: PortalSectionStatus;
  /**
   * Punto de integración: módulo/endpoint que alimentará la sección. Es deuda de
   * cableado (docs/TASKS.md) hasta que el módulo dueño exista.
   */
  integrationPoint: string;
}

/**
 * Perfil = identidad pública de la organización. ENVUELVE el contrato público de
 * `org` (`OrganizationPublic`) SIN reproyectarlo: si @sebastian cambia los campos
 * públicos, el perfil los hereda por contrato, sin proyección duplicada en M14.
 */
export interface PortalProfile {
  organization: OrganizationPublic;
  /**
   * Tipo de organización para el badge reservado del perfil. `undefined` mientras
   * `org` no exponga el campo en su proyección pública; el portal renderiza
   * entonces el hueco reservado en lugar de ocultar el badge.
   */
  organizationType?: PortalOrganizationType;
}

/** View-model completo del portal público rico servido en `/o/:slug`. */
export interface PortalView {
  profile: PortalProfile;
  sections: PortalSection[];
}

/**
 * Resultado de resolver un subdominio real del portal
 * (`<subdominio>.adoptafacil.org`) a su slug de organización. Superficie
 * pública mínima — SOLO el slug, nada más — para que el frontend reutilice
 * sin cambios cada endpoint público ya existente que se indexa por slug
 * (`organization_public`, `organization_portal_theme`, animales, campañas...)
 * en vez de duplicar su proyección pública para una segunda llave.
 */
export interface OrganizationSlugLookup {
  slug: string;
}

// ============================================================================
// M14 — PERSONALIZACIÓN POR TOKENS (T-027)
//
// Cada organización personaliza su portal SÓLO mediante un subconjunto SEGURO de
// tokens de marca (NO CSS/HTML arbitrario): así se evita la inyección. El backend
// valida formato y contraste antes de persistir; el portal público los aplica en
// runtime (vía `brandTokensToStyle`/`applyBrandTokens` del design system, T-020).
//
// SÓLO TIPOS (ver nota CJS arriba): la LISTA de tokens editables y las expresiones
// de validación son VALORES y viven en el backend (`apps/api/.../portals`) y en la
// feature web; aquí sólo se declara la forma del contrato.
// ============================================================================

/**
 * Tokens de COLOR que una organización puede personalizar — SÓLO los que de
 * verdad pintan algo en el portal público real (T-PERSONALIZACION-AUDIT):
 * `primary`/`primary-foreground` rebrandean la mayoría de botones/badges del
 * portal; `accent`/`accent-foreground` pintan el badge "Nuevo" del catálogo de
 * animales; `ring` pinta el resplandor de foco del buscador/filtro y del
 * formulario de reseñas. Cada valor es un canal HSL "crudo" `"H S% L%"` (p. ej.
 * `"142 72% 29%"`), idéntico al formato que consume `@adoptafacil/ui`.
 *
 * `secondary`/`secondary-foreground` y el token escalar `radius` SE QUITARON
 * (T-PERSONALIZACION-AUDIT): ninguno de los dos llega a pintar nada en el
 * portal real ni en los componentes compartidos de `packages/ui` — el
 * refactor BEM+SCSS de `packages/ui` dejó esos dos tokens sin ningún
 * consumidor (`Button`/`Badge`/`Card`/`Input` usan sus propias constantes
 * fijas `--r-full`/`--r-md`/`--r-2xl`, y `Badge variant="secondary"` usa un
 * hex fijo, no `--secondary`). Mantenerlos solo le mostraba al dueño del
 * portal un control que no hacía nada.
 */
export type PortalColorToken =
  'primary' | 'primary-foreground' | 'accent' | 'accent-foreground' | 'ring';

/** Unión de todos los tokens que la organización puede sobrescribir. */
export type PortalThemeToken = PortalColorToken;

/**
 * Tema de marca de una organización: mapa PARCIAL de token → valor. Sólo se
 * almacenan/aplican tokens del subconjunto seguro y ya VALIDADOS (formato +
 * contraste). Un tema vacío significa "usar el tema por defecto del design system".
 */
export type PortalTheme = Partial<Record<PortalThemeToken, string>>;

/**
 * Posiciones de layout configurables del portal (S2-PORTAL). Igual que los
 * tokens de color, son un subconjunto SEGURO y acotado (nunca CSS/HTML libre).
 */
export type PortalLogoPosition = 'left' | 'center' | 'right';
export type PortalSocialNavPosition = 'left' | 'right';

/**
 * Plantillas del portal público (Ola 3). Mismo contenido y mismos datos, otra
 * identidad visual y otra estructura. Conjunto cerrado: nunca HTML ni CSS libre.
 */
export const PORTAL_TEMPLATE_IDS = [
  'clasica',
  'editorial',
  'carnet',
  'impacto',
  'orbita',
  'historias',
] as const;
export type PortalTemplateId = (typeof PORTAL_TEMPLATE_IDS)[number];
export const DEFAULT_PORTAL_TEMPLATE: PortalTemplateId = 'clasica';

/** En qué nivel de plan vive una plantilla. */
export type PortalTemplateTier = 'free' | 'paid';

export interface PortalTemplateInfo {
  id: PortalTemplateId;
  name: string;
  tagline: string;
  /** Decisión del cliente (2026-10-16): las 5 plantillas actuales son gratis
   *  en todos los planes; `paid` queda para los futuros diseños "super Pro". */
  tier: PortalTemplateTier;
}

/**
 * Catálogo de plantillas. `tier` es un PARÁMETRO de negocio pendiente
 * (TODO(client)): mientras no existan planes de pago, ninguna plantilla se
 * bloquea y la interfaz solo muestra la etiqueta.
 */
export const PORTAL_TEMPLATES: readonly PortalTemplateInfo[] = [
  {
    id: 'clasica',
    name: 'Clásica',
    tagline: 'Tu portada a todo el ancho y tus animales justo debajo.',
    tier: 'free',
  },
  {
    id: 'editorial',
    name: 'Editorial',
    tagline: 'Como una revista: titulares grandes, mucho aire y foto en arco.',
    tier: 'free',
  },
  {
    id: 'carnet',
    name: 'Carnet',
    tagline: 'Inspirada en el carnet de cada animal: fichas con personalidad.',
    tier: 'free',
  },
  {
    id: 'impacto',
    name: 'Impacto',
    tagline: 'Oscura y directa: el número de animales que buscan hogar manda.',
    tier: 'free',
  },
  {
    id: 'orbita',
    name: 'Órbita',
    tagline: 'Una constelación en 3D que forma una huella y reacciona al cursor.',
    tier: 'free',
  },
  {
    id: 'historias',
    name: 'Historias',
    tagline: 'Tus animales a pantalla completa: se pasan con el dedo, con video de portada.',
    tier: 'paid',
  },
];

/**
 * Ajustes propios de cada plantilla (Ola 3). Conjunto cerrado: la API rechaza
 * cualquier clave o valor fuera de esta lista, y la web arma el formulario a
 * partir de ella. Nunca CSS ni HTML libre.
 */
export type PortalTemplateOptionValue = string | boolean;
export type PortalTemplateOptions = Record<string, PortalTemplateOptionValue>;

export type PortalTemplateOptionDef =
  | { key: string; label: string; kind: 'toggle'; default: boolean }
  | {
      key: string;
      label: string;
      kind: 'choice';
      default: string;
      choices: ReadonlyArray<{ value: string; label: string }>;
    };

export const PORTAL_TEMPLATE_OPTIONS: Readonly<
  Record<PortalTemplateId, readonly PortalTemplateOptionDef[]>
> = {
  clasica: [],
  editorial: [
    {
      key: 'photoShape',
      label: 'Forma de la foto de portada',
      kind: 'choice',
      default: 'arco',
      choices: [
        { value: 'arco', label: 'Arco' },
        { value: 'recta', label: 'Recta' },
        { value: 'circulo', label: 'Círculo' },
      ],
    },
    { key: 'showFeatured', label: 'Mostrar "En esta edición"', kind: 'toggle', default: true },
  ],
  carnet: [
    {
      key: 'pattern',
      label: 'Fondo de la página',
      kind: 'choice',
      default: 'puntos',
      choices: [
        { value: 'puntos', label: 'Puntos' },
        { value: 'huellas', label: 'Huellas' },
        { value: 'liso', label: 'Liso' },
      ],
    },
    { key: 'showMinis', label: 'Mostrar mini carnets de animales', kind: 'toggle', default: true },
  ],
  impacto: [
    { key: 'showMosaic', label: 'Mostrar mosaico de fotos', kind: 'toggle', default: true },
    { key: 'motion', label: 'Cinta de nombres en movimiento', kind: 'toggle', default: true },
  ],
  orbita: [
    {
      key: 'density',
      label: 'Intensidad de la constelación',
      kind: 'choice',
      default: 'media',
      choices: [
        { value: 'suave', label: 'Suave' },
        { value: 'media', label: 'Media' },
        { value: 'intensa', label: 'Intensa' },
      ],
    },
    { key: 'showCount', label: 'Mostrar el número de animales', kind: 'toggle', default: true },
  ],
  historias: [
    {
      key: 'autoAdvance',
      label: 'Pasar a la siguiente historia sola cada pocos segundos',
      kind: 'toggle',
      default: false,
    },
  ],
};

/**
 * Video de portada de la plantilla Historias (opcional). Se sube al
 * almacenamiento público de la organización (StoragePort) y se guarda solo su
 * llave; nunca una URL libre de otro sitio.
 */
export const PORTAL_COVER_VIDEO_TYPES = ['video/mp4', 'video/webm'] as const;
export type PortalCoverVideoType = (typeof PORTAL_COVER_VIDEO_TYPES)[number];

/** Ajustes efectivos: los guardados válidos sobre los valores por defecto. */
export function resolveTemplateOptions(
  template: PortalTemplateId,
  raw: unknown,
): PortalTemplateOptions {
  const defs = PORTAL_TEMPLATE_OPTIONS[template] ?? [];
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: PortalTemplateOptions = {};
  for (const def of defs) {
    const value = source[def.key];
    if (def.kind === 'toggle') {
      out[def.key] = typeof value === 'boolean' ? value : def.default;
    } else {
      out[def.key] =
        typeof value === 'string' && def.choices.some((c) => c.value === value)
          ? value
          : def.default;
    }
  }
  return out;
}

/** ¿Se cobra la plantilla? Hasta que existan planes, nunca se bloquea. */
export const PORTAL_TEMPLATE_TIERS_ENFORCED = false;

/**
 * Diseños completos del portal público (M14, 14 gratuitos). A diferencia de las
 * plantillas de arriba (que cambian la portada del portal clásico), un diseño
 * reemplaza la página entera con las mismas secciones y las mismas reglas de
 * visibilidad. 'clasico' = sin diseño: se ve el portal de siempre con su
 * plantilla. Solo tipo: los valores viven en la API (enum Zod) y en la web.
 */
export type PortalDesignId =
  | 'clasico'
  | 'hogar'
  | 'revista'
  | 'expediente'
  | 'cartel'
  | 'orbita'
  | 'galeria'
  | 'mosaico'
  | 'match'
  | 'estudio'
  | 'cine'
  | 'aurora'
  | 'constelacion'
  | 'portada'
  | 'hilo';

/**
 * Diseños Premium (modo claro y oscuro). APAGADOS por defecto: solo se pueden
 * guardar y pintar cuando la API y la web tienen encendida su variable
 * (PORTAL_PREMIUM_DESIGNS_ENABLED / VITE_PORTAL_PREMIUM_DESIGNS).
 */
export type PortalPremiumDesignId = 'album' | 'linterna' | 'revelado' | 'velitas' | 'terminal';

/** Respuesta de lectura del tema (propio o público). */
export interface PortalThemeConfig {
  tokens: PortalTheme;
  /** Dónde se posiciona el logo sobre el hero (S2-PORTAL). Default: 'left'. */
  logoPosition?: PortalLogoPosition;
  /** De qué lado va el sidebar de redes/contacto (S2-PORTAL). Default: 'right'. */
  socialNavPosition?: PortalSocialNavPosition;
  /** Plantilla del portal (Ola 3). Default: 'clasica'. */
  template?: PortalTemplateId;
  /** Ajustes de esa plantilla (Ola 3), ya resueltos con sus valores por defecto. */
  templateOptions?: PortalTemplateOptions;
  /** Video de portada (plantilla Historias), URL pública lista para `<video>`. */
  coverVideoUrl?: string;
  /** Diseño completo del portal (M14). Default: 'clasico'. */
  design?: PortalDesignId | PortalPremiumDesignId;
}

/** Entrada para crear/actualizar el tema (Owner/Admin). */
export interface UpdatePortalThemeInput {
  tokens: PortalTheme;
  logoPosition?: PortalLogoPosition;
  socialNavPosition?: PortalSocialNavPosition;
  /** Omitida, conserva la plantilla guardada. */
  template?: PortalTemplateId;
  /** Ajustes de la plantilla. Omitidos, se conservan los guardados. */
  templateOptions?: PortalTemplateOptions;
  /**
   * Llave del video de portada en el almacenamiento público de la organización
   * (`public/<orgId>/<archivo>.mp4` o `.webm`). Omitida, se conserva; `null` lo quita.
   */
  coverVideoKey?: string | null;
  /** Omitido, conserva el diseño guardado. */
  design?: PortalDesignId | PortalPremiumDesignId;
}

// ----------------------------------------------------------------------------
// Indicador de transparencia con datos reales (§M14)
//
// "Nivel · % formalización · rendición". Consume el contrato de `org`:
//   - nivel            ← VerificationLevel.level
//   - % formalización  ← DERIVADO de la posición del estado en
//                        FORMALIZATION_SEQUENCE (índice/total). Es DECISIÓN del
//                        documento base, REVISABLE: no es una métrica nueva.
//   - rendición        ← PLACEHOLDER tipado hasta que existan campañas/donaciones
//                        (M05/M06). NO se calcula con datos inventados.
// ----------------------------------------------------------------------------

/**
 * Estado de la rendición de cuentas. `'no-disponible'` es el PLACEHOLDER honesto
 * de hoy: aún no hay fuente de datos, así que no se afirma ni al-día ni atrasada.
 * Los otros valores quedan reservados para cuando M05/M06 alimenten el dato.
 */
export type PortalAccountabilityStatus = 'al-dia' | 'pendiente' | 'atrasada' | 'no-disponible';

/**
 * Rendición de cuentas — PLACEHOLDER tipado. Hoy `status: 'no-disponible'`; el
 * `integrationPoint` documenta el módulo/endpoint que la alimentará. NO se calcula
 * con datos inventados: es el punto de integración listo para M05/M06.
 */
export interface PortalAccountability {
  status: PortalAccountabilityStatus;
  /** Módulo/endpoint que alimentará la rendición cuando exista. */
  integrationPoint: string;
}

/**
 * Datos del indicador de transparencia (§M14). `level` y `formalizationPct` son
 * REALES (derivados del contrato de `org`); `accountability` es un placeholder
 * tipado hasta M05/M06.
 */
export interface PortalTransparency {
  /** Nivel de verificación (contrato `org.VerificationLevel.level`). */
  level: number;
  /**
   * % de formalización DERIVADO de la posición del estado en
   * FORMALIZATION_SEQUENCE (0–100). Decisión del documento base — revisable.
   */
  formalizationPct: number;
  accountability: PortalAccountability;
}
