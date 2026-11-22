import type { TplAnimal, TplModel } from './model';
import { bindCatalog, scopedTransition, type CatOptions } from './premium';
import { portrait, qsa } from './runtime';
import type { TemplateEnv } from './types';

/**
 * Piezas de la serie moderna (Brisa, Bento, Halo, Prisma). Todo lo visual se
 * apoya en CSS actual con mejora progresiva: animaciones ligadas al scroll
 * (`animation-timeline`), container queries, `:has()`, `content-visibility` y
 * transiciones de vista acotadas al catálogo. Donde el navegador no tiene una
 * de esas APIs, el contenido se ve completo y quieto; nunca falta nada.
 */

/** ¿El navegador anima con el scroll de forma nativa? (incluye `animation-range`). */
export function supportsScrollTimeline(): boolean {
  return (
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('(animation-timeline: view()) and (animation-range: entry)')
  );
}

/**
 * Las entradas al hacer scroll van en CSS (`.rv` con `animation-timeline: view()`).
 * Solo donde no existe se usa el respaldo con IntersectionObserver del motor.
 */
export function revealFallback(app: HTMLElement, env: TemplateEnv, sel: string): void {
  if (supportsScrollTimeline()) return;
  env.motion.reveal(app, sel, { stagger: 70 });
}

/**
 * Imagen principal del portal (candidata a LCP): se pide con prioridad alta y
 * nunca en diferido. Los retratos del resto de la página siguen en `lazy`.
 */
export function leadImage(src: string, alt: string, cls = 'portrait portrait--photo'): string {
  return `<img class="${cls}" src="${src}" alt="${alt}" fetchpriority="high" decoding="async" referrerpolicy="no-referrer">`;
}

/** Retrato del animal; el primero de la portada puede pedirse con prioridad. */
export function animalArt(
  a: TplAnimal,
  opt: { lead?: boolean; decor?: boolean; dx?: number; dy?: number; s?: number } = {},
): string {
  if (a.photo && opt.lead) return leadImage(a.photo, opt.decor ? '' : `Foto de ${a.name}`);
  return portrait(a, { decor: opt.decor, dx: opt.dx ?? 8, dy: opt.dy ?? 18, s: opt.s ?? 1.04 });
}

/** La imagen que abre la portada: la foto de portada de la organización o un animal con foto. */
export function leadSource(m: TplModel): { kind: 'cover' | 'animal' | 'none'; animal?: TplAnimal } {
  if (m.ORG.cover) return { kind: 'cover' };
  const withPhoto = m.ANIMALS.find((a) => a.photo);
  if (withPhoto) return { kind: 'animal', animal: withPhoto };
  if (m.ANIMALS[0]) return { kind: 'animal', animal: m.ANIMALS[0] };
  return { kind: 'none' };
}

/**
 * Catálogo paginado (búsqueda, especie, orden y "ver más") para las plantillas
 * de la serie: el primer bloque ya viene pintado en el HTML (se ve sin esperar
 * al JavaScript) y cada cambio que pide el visitante se anima con una
 * transición de vista acotada al catálogo.
 */
export function modernCatalog(
  app: HTMLElement,
  env: TemplateEnv,
  o: Omit<CatOptions, 'transition'> & { signal?: AbortSignal },
) {
  return bindCatalog(
    app,
    env,
    { signal: o.signal ?? env.motion.signal },
    {
      ...o,
      transition: scopedTransition,
    },
  );
}

/** Etiqueta corta "Perra · 2 años". */
export const meta = (a: TplAnimal): string => `${a.spLabel}${a.hasAge ? ` · ${a.age}` : ''}`;

/** Pone `--i` (orden) en cada elemento, para escalonar entradas en CSS. */
export function stagger(root: ParentNode, sel: string, mod = 4): void {
  qsa(root, sel).forEach((el, i) => el.style.setProperty('--i', String(i % mod)));
}
