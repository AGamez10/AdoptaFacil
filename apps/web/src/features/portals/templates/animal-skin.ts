import type { CSSProperties } from 'react';
import { preferredMode } from './engine/premium';
import type { TemplateDesign } from './engine/types';

/**
 * Apariencia de la ficha del animal tomada de la plantilla del portal: fondo,
 * tinta, tipografías, acento, forma de las tarjetas (fondo, borde, sombra y
 * redondeo). Sale de las variables `--lg-*` que TODAS las plantillas ya
 * declaran para su libro público (kit, Premium y las de diseño propio), así una
 * plantilla nueva viste su ficha sin declarar nada más.
 *
 * Se lee con una sonda oculta que lleva las clases de la plantilla, y el
 * resultado se aplica como variables `--fd-*` sobre un contenedor propio de la
 * ficha. Así el CSS de la plantilla (p. ej. `.tpl-x a{color:inherit}`) nunca
 * toca los botones ni el resto de la ficha.
 *
 * Decoración propia de una plantilla: su CSS puede apuntar a
 * `[data-animal-skin="<id>"]` (y `[data-mode]` en las Premium) y a las partes
 * `[data-fd-part="media|name|facts|fact|actions|org|steps"]` de la ficha.
 */
export interface AnimalSkin {
  template: TemplateDesign['id'];
  mode?: 'light' | 'dark';
  scheme: 'light' | 'dark';
  /** Variables `--fd-*` para el contenedor de la ficha. */
  style: CSSProperties;
}

/** Clases del contenedor raíz de una plantilla (las mismas del portal). */
export function templateRootClass(design: TemplateDesign): string {
  return `af-tpl tpl-${design.id}${design.kit ? ' kit' : ''}${design.premium ? ' pk' : ''}`;
}

/** Modo con el que se ve la plantilla (solo las Premium tienen dos). */
export function templateMode(design: TemplateDesign): 'light' | 'dark' | undefined {
  return design.premium ? preferredMode(design.id) : undefined;
}

type Rgb = [number, number, number, number];

function parseRgb(value: string): Rgb | null {
  const m = value.match(
    /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)/i,
  );
  if (!m) return null;
  const a = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return [Number(m[1]), Number(m[2]), Number(m[3]), a];
}

function luminance([r, g, b]: Rgb): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

const KEYWORDS = new Set(['', 'inherit', 'initial', 'unset', 'revert', 'revert-layer']);

/**
 * Lee la apariencia de `design` (en `mode`, para las Premium). Necesita la hoja
 * de la plantilla ya montada (`useTemplateAssets`). `null` si no hay DOM o la
 * plantilla no pinta un fondo sólido (la ficha se queda con el diseño de la app).
 */
export function readAnimalSkin(
  design: TemplateDesign,
  mode: 'light' | 'dark' | undefined,
  brandStyle: Record<string, string> = {},
): AnimalSkin | null {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return null;
  const probe = document.createElement('div');
  probe.className = templateRootClass(design);
  if (mode) probe.dataset.mode = mode;
  probe.setAttribute('aria-hidden', 'true');
  for (const [key, value] of Object.entries(brandStyle)) probe.style.setProperty(key, value);
  probe.style.cssText +=
    ';position:absolute;left:-9999px;top:0;width:1px;height:1px;min-height:0;overflow:hidden;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  try {
    const cs = getComputedStyle(probe);
    const v = (name: string) => cs.getPropertyValue(name).trim();
    const bg = parseRgb(cs.backgroundColor);
    if (!bg || bg[3] < 0.6) return null;
    const font = cs.fontFamily;
    const fd = KEYWORDS.has(v('--lg-fd')) ? font : v('--lg-fd');
    const ink = cs.color;
    const soft = v('--lg-soft') || `color-mix(in srgb, ${ink} 68%, ${cs.backgroundColor})`;
    const line = v('--lg-line') || `color-mix(in srgb, ${ink} 14%, transparent)`;
    const acc = v('--lg-acc') || ink;
    const accInk = v('--lg-acc-ink') || cs.backgroundColor;
    const image = cs.backgroundImage && cs.backgroundImage !== 'none' ? cs.backgroundImage : '';
    const scheme = luminance(bg) > 0.35 ? 'light' : 'dark';
    const style: Record<string, string> = {
      '--fd-bg': cs.backgroundColor,
      '--fd-bg-image': image || 'none',
      '--fd-ink': ink,
      '--fd-soft': soft,
      '--fd-line': line,
      '--fd-font': font,
      '--fd-head': fd,
      '--fd-head-w': v('--lg-fw') || '700',
      '--fd-head-ls': v('--lg-ls') || 'normal',
      '--fd-card': v('--lg-card') || `color-mix(in srgb, ${ink} 4%, transparent)`,
      '--fd-card-bd': v('--lg-bd') || `1px solid ${line}`,
      '--fd-card-sh': v('--lg-sh') || 'none',
      '--fd-r': v('--lg-r') ? `min(${v('--lg-r')}, 28px)` : '18px',
      '--fd-acc': acc,
      '--fd-acc-ink': accInk,
      '--fd-hi': v('--lg-hi') || acc,
      // El botón de cerrar del diálogo usa --text-muted.
      '--text-muted': soft,
      colorScheme: scheme,
    };
    return { template: design.id, mode, scheme, style: style as CSSProperties };
  } finally {
    probe.remove();
  }
}
