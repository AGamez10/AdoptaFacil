import type { PortalPremiumDesignId, PortalDesignId } from '@adoptafacil/contracts';
import type { TemplateDesign } from './engine/types';

/**
 * Catálogo de plantillas del portal público (M14). TODAS son gratuitas y TODAS
 * muestran el mismo contenido que el portal clásico: solo cambia el diseño.
 * Misma lista que `PORTAL_TEMPLATE_IDS` en la API (el contrato `PortalDesignId`
 * obliga a que ambas coincidan).
 */
export interface TemplateInfo {
  id: PortalDesignId;
  name: string;
  description: string;
  series: 'Original' | 'Serie 1' | 'Serie 2';
  /** Animaciones 3D (con respaldo cuando el navegador no tiene WebGL). */
  webgl?: boolean;
  /** Colores de la miniatura en el selector. */
  swatch: [string, string];
}

export const TEMPLATE_CATALOG: readonly TemplateInfo[] = [
  {
    id: 'clasico',
    name: 'Clásico',
    series: 'Original',
    description: 'El diseño original del portal.',
    swatch: ['#FFFFFF', '#1F7A6D'],
  },
  {
    id: 'hogar',
    name: 'Hogar',
    series: 'Serie 1',
    description: 'Cálida y fotográfica, con historias en el hero y carrusel.',
    swatch: ['#FBF5EE', '#1D1B19'],
  },
  {
    id: 'revista',
    name: 'Revista',
    series: 'Serie 1',
    description: 'Editorial, con tipografía serif y retratos grandes.',
    swatch: ['#F6F3EE', '#141414'],
  },
  {
    id: 'expediente',
    name: 'Expediente',
    series: 'Serie 1',
    description: 'Ficha técnica y transparente, estilo documento.',
    swatch: ['#F2F2EF', '#0E0E0E'],
  },
  {
    id: 'cartel',
    name: 'Cartel',
    series: 'Serie 1',
    description: 'Afiche tipográfico en negro y amarillo.',
    swatch: ['#F3F1EC', '#FFD23F'],
  },
  {
    id: 'orbita',
    name: 'Órbita',
    series: 'Serie 1',
    description: 'Sistema solar 3D: cada animal es un planeta.',
    webgl: true,
    swatch: ['#04060C', '#7C9CFF'],
  },
  {
    id: 'galeria',
    name: 'Galería',
    series: 'Serie 2',
    description: 'Muro de retratos enmarcados que se arrastra.',
    swatch: ['#101010', '#F3F1EC'],
  },
  {
    id: 'mosaico',
    name: 'Mosaico',
    series: 'Serie 2',
    description: 'Cuadrícula viva de retratos y bloques de color.',
    swatch: ['#F4F1EA', '#111111'],
  },
  {
    id: 'match',
    name: 'Match',
    series: 'Serie 2',
    description: 'Tarjetas para deslizar y encontrar compañero.',
    swatch: ['#FFF7F2', '#FF5A5F'],
  },
  {
    id: 'estudio',
    name: 'Estudio',
    series: 'Serie 2',
    description: 'Minimalista, de estudio fotográfico.',
    swatch: ['#FAFAFA', '#0A0A0A'],
  },
  {
    id: 'cine',
    name: 'Cine',
    series: 'Serie 2',
    description: 'Oscura y cinematográfica, como una cartelera.',
    swatch: ['#0B0B0C', '#F2E8D5'],
  },
  {
    id: 'aurora',
    name: 'Aurora',
    series: 'Serie 2',
    description: 'Luces de aurora en 3D detrás del contenido.',
    webgl: true,
    swatch: ['#070A14', '#7EE2B8'],
  },
  {
    id: 'constelacion',
    name: 'Constelación',
    series: 'Serie 2',
    description: 'Todos los animales en una esfera 3D que se gira.',
    webgl: true,
    swatch: ['#05070D', '#9CB4FF'],
  },
  {
    id: 'portada',
    name: 'Portada',
    series: 'Serie 2',
    description: 'Revista de portada, con índice y retratos en horizontal.',
    swatch: ['#F3EFE6', '#121212'],
  },
  {
    id: 'hilo',
    name: 'Hilo',
    series: 'Serie 2',
    description: 'Neo-brutalista: un hilo recorre la página y stickers con física.',
    swatch: ['#FFF6E5', '#121212'],
  },
];

/**
 * Plantillas Premium (dos experiencias cada una: modo claro y modo oscuro).
 * APAGADAS mientras no exista un plan de pago activo: no aparecen en el
 * selector, la API no deja guardarlas y, si llegaran del endpoint público, el
 * portal pinta el clásico. Se encienden SOLO con `VITE_PORTAL_PREMIUM_DESIGNS=true`
 * en la web y `PORTAL_PREMIUM_DESIGNS_ENABLED=true` en la API (localhost y demo).
 */
export const PREMIUM_TEMPLATES_ENABLED = import.meta.env.VITE_PORTAL_PREMIUM_DESIGNS === 'true';

export interface PremiumTemplateInfo {
  id: PortalPremiumDesignId;
  name: string;
  description: string;
  /** Nombre de cada experiencia. */
  modes: { light: string; dark: string };
  swatch: [string, string];
}

export const PREMIUM_CATALOG: readonly PremiumTemplateInfo[] = [
  {
    id: 'album',
    name: 'Álbum',
    modes: { light: 'Láminas', dark: 'Holográfica' },
    description: 'Álbum de láminas con sobres para abrir, y cartas holográficas en modo oscuro.',
    swatch: ['#EEF3FA', '#FFD23F'],
  },
  {
    id: 'linterna',
    name: 'Linterna',
    modes: { light: 'Mañana', dark: 'Noche' },
    description: 'Amanece en el refugio; de noche, una linterna descubre quién espera.',
    swatch: ['#FFF4E0', '#05070D'],
  },
  {
    id: 'revelado',
    name: 'Revelado',
    modes: { light: 'Mesa de luz', dark: 'Cuarto oscuro' },
    description: 'Negativos con lupa y, en modo oscuro, copias que se revelan bajo luz roja.',
    swatch: ['#F4F1EA', '#B3261E'],
  },
  {
    id: 'velitas',
    name: 'Velitas',
    modes: { light: 'Papel', dark: 'Velitas' },
    description: 'Cerros de papel recortado y banderines; de noche, faroles y una vela por animal.',
    swatch: ['#EEF4EE', '#F2A541'],
  },
  {
    id: 'terminal',
    name: 'Terminal',
    modes: { light: 'Pases', dark: 'Tablero' },
    description: 'Pases de abordar hacia un hogar y un tablero de salidas con letras que giran.',
    swatch: ['#F3F4F6', '#FFC72C'],
  },
];

type FreeDesignId = Exclude<PortalDesignId, 'clasico'>;
type DesignId = FreeDesignId | PortalPremiumDesignId;

/** Cada plantilla se descarga solo cuando un portal la usa (code-splitting). */
const LOADERS: Record<FreeDesignId, () => Promise<TemplateDesign>> = {
  hogar: () => import('./designs/hogar').then((x) => x.hogar),
  revista: () => import('./designs/revista').then((x) => x.revista),
  expediente: () => import('./designs/expediente').then((x) => x.expediente),
  cartel: () => import('./designs/cartel').then((x) => x.cartel),
  orbita: () => import('./designs/orbita').then((x) => x.orbita),
  galeria: () => import('./designs/galeria').then((x) => x.galeria),
  mosaico: () => import('./designs/mosaico').then((x) => x.mosaico),
  match: () => import('./designs/match').then((x) => x.match),
  estudio: () => import('./designs/estudio').then((x) => x.estudio),
  cine: () => import('./designs/cine').then((x) => x.cine),
  aurora: () => import('./designs/aurora').then((x) => x.aurora),
  constelacion: () => import('./designs/constelacion').then((x) => x.constelacion),
  portada: () => import('./designs/portada').then((x) => x.portada),
  hilo: () => import('./designs/hilo').then((x) => x.hilo),
};

const PREMIUM_LOADERS: Record<PortalPremiumDesignId, () => Promise<TemplateDesign>> = {
  album: () => import('./designs/album').then((x) => x.album),
  linterna: () => import('./designs/linterna').then((x) => x.linterna),
  revelado: () => import('./designs/revelado').then((x) => x.revelado),
  velitas: () => import('./designs/velitas').then((x) => x.velitas),
  terminal: () => import('./designs/terminal').then((x) => x.terminal),
};

/** Premium sin la puerta (solo para pruebas y vistas previas internas). */
export function loadPremiumDesign(id: PortalPremiumDesignId): Promise<TemplateDesign> {
  return PREMIUM_LOADERS[id]();
}

export function isDesignId(id: PortalDesignId | PortalPremiumDesignId): id is FreeDesignId {
  return id !== 'clasico' && id in LOADERS;
}

export function loadDesign(id: DesignId): Promise<TemplateDesign> {
  if (id in PREMIUM_LOADERS) {
    // Puerta apagada: sin plan activo una Premium nunca se descarga ni se pinta.
    if (!PREMIUM_TEMPLATES_ENABLED) return Promise.reject(new Error('premium-disabled'));
    return PREMIUM_LOADERS[id as PortalPremiumDesignId]();
  }
  return LOADERS[id as FreeDesignId]();
}

/** Normaliza lo que venga del endpoint público: desconocido ⇒ 'clasico'. */
export function safeDesignId(value: unknown): PortalDesignId | PortalPremiumDesignId {
  if (typeof value !== 'string') return 'clasico';
  if (TEMPLATE_CATALOG.some((t) => t.id === value)) return value as PortalDesignId;
  if (PREMIUM_TEMPLATES_ENABLED && PREMIUM_CATALOG.some((t) => t.id === value)) {
    return value as PortalPremiumDesignId;
  }
  return 'clasico';
}
