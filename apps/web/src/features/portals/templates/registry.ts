import type { PortalTemplateId } from '@adoptafacil/contracts';
import type { TemplateDesign } from './engine/types';

/**
 * Catálogo de plantillas del portal público (M14). TODAS son gratuitas y TODAS
 * muestran el mismo contenido que el portal clásico: solo cambia el diseño.
 * Misma lista que `PORTAL_TEMPLATE_IDS` en la API (el contrato `PortalTemplateId`
 * obliga a que ambas coincidan).
 */
export interface TemplateInfo {
  id: PortalTemplateId;
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

type DesignId = Exclude<PortalTemplateId, 'clasico'>;

/** Cada plantilla se descarga solo cuando un portal la usa (code-splitting). */
const LOADERS: Record<DesignId, () => Promise<TemplateDesign>> = {
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

export function isDesignId(id: PortalTemplateId): id is DesignId {
  return id !== 'clasico' && id in LOADERS;
}

export function loadDesign(id: DesignId): Promise<TemplateDesign> {
  return LOADERS[id]();
}

/** Normaliza lo que venga del endpoint público: desconocido ⇒ 'clasico'. */
export function safeTemplateId(value: unknown): PortalTemplateId {
  return typeof value === 'string' && TEMPLATE_CATALOG.some((t) => t.id === value)
    ? (value as PortalTemplateId)
    : 'clasico';
}
