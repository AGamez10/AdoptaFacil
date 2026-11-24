import type { PortalTemplateId } from '@adoptafacil/contracts';
import type { TemplateDesign } from './engine/types';

/**
 * Diseños del motor de plantillas del portal público. Muestran el mismo
 * contenido que el portal clásico: solo cambia el diseño. La lista de
 * identificadores y si cada uno es gratis o de pago la define el contrato
 * (`PORTAL_TEMPLATE_IDS` y `PORTAL_TEMPLATES[].tier`); aquí solo se mapea cada
 * id a su diseño.
 */
export const ENGINE_TEMPLATE_IDS = [
  'hogar',
  'revista',
  'expediente',
  'cartel',
  'solar',
  'galeria',
  'mosaico',
  'match',
  'estudio',
  'cine',
  'aurora',
  'constelacion',
  'portada',
  'hilo',
  'brisa',
  'bento',
  // Premium (tier 'paid'): se desbloquean con `portalPremiumDesigns` (Crece y Pro).
  'album',
  'linterna',
  'revelado',
  'velitas',
  'terminal',
  'documental',
  'halo',
  'prisma',
  // De temporada (Crece y Pro, solo dentro de su ventana de fechas).
  'navidad',
  'nieve',
] as const satisfies readonly PortalTemplateId[];

export type EngineTemplateId = (typeof ENGINE_TEMPLATE_IDS)[number];

/** Cada diseño se descarga solo cuando un portal lo usa (code-splitting). */
const LOADERS: Record<EngineTemplateId, () => Promise<TemplateDesign>> = {
  hogar: () => import('./designs/hogar').then((x) => x.hogar),
  revista: () => import('./designs/revista').then((x) => x.revista),
  expediente: () => import('./designs/expediente').then((x) => x.expediente),
  cartel: () => import('./designs/cartel').then((x) => x.cartel),
  solar: () => import('./designs/solar').then((x) => x.solar),
  galeria: () => import('./designs/galeria').then((x) => x.galeria),
  mosaico: () => import('./designs/mosaico').then((x) => x.mosaico),
  match: () => import('./designs/match').then((x) => x.match),
  estudio: () => import('./designs/estudio').then((x) => x.estudio),
  cine: () => import('./designs/cine').then((x) => x.cine),
  aurora: () => import('./designs/aurora').then((x) => x.aurora),
  constelacion: () => import('./designs/constelacion').then((x) => x.constelacion),
  portada: () => import('./designs/portada').then((x) => x.portada),
  hilo: () => import('./designs/hilo').then((x) => x.hilo),
  album: () => import('./designs/album').then((x) => x.album),
  linterna: () => import('./designs/linterna').then((x) => x.linterna),
  revelado: () => import('./designs/revelado').then((x) => x.revelado),
  velitas: () => import('./designs/velitas').then((x) => x.velitas),
  terminal: () => import('./designs/terminal').then((x) => x.terminal),
  documental: () => import('./designs/documental').then((x) => x.documental),
  brisa: () => import('./designs/brisa').then((x) => x.brisa),
  bento: () => import('./designs/bento').then((x) => x.bento),
  halo: () => import('./designs/halo').then((x) => x.halo),
  prisma: () => import('./designs/prisma').then((x) => x.prisma),
  navidad: () => import('./designs/navidad').then((x) => x.navidad),
  nieve: () => import('./designs/nieve').then((x) => x.nieve),
};

export function isEngineTemplate(id: string): id is EngineTemplateId {
  return (ENGINE_TEMPLATE_IDS as readonly string[]).includes(id);
}

export function loadDesign(id: EngineTemplateId): Promise<TemplateDesign> {
  return LOADERS[id]();
}
