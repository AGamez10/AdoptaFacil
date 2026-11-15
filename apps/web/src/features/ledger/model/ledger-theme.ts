import type { CSSProperties } from 'react';

/**
 * Apariencia del libro público tomada de la plantilla ACTIVA del portal: el
 * diálogo "Ver libro completo" se viste con el mismo fondo, tinta, tipografías,
 * acento y redondeo que la sección donde el visitante lo abrió. Se lee de los
 * estilos ya calculados por el navegador, así sirve para las 19 plantillas (y
 * para sus modos claro y oscuro) sin que cada diseño declare nada nuevo.
 */
export interface LedgerTheme {
  bg: string;
  ink: string;
  accent: string;
  accentInk: string;
  font: string;
  headFont: string;
  radius: string;
  scheme: 'light' | 'dark';
}

type Rgba = [number, number, number, number];

/** `rgb(…)` / `rgba(…)` (lo que devuelve getComputedStyle) → componentes. */
export function parseColor(value: string | null | undefined): Rgba | null {
  if (!value) return null;
  const m = value.match(
    /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)/i,
  );
  if (!m) return null;
  const a = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return [Number(m[1]), Number(m[2]), Number(m[3]), a];
}

const opaque = (c: Rgba | null): c is Rgba => !!c && c[3] >= 0.6;

/** Luminancia relativa (WCAG) de un color sRGB. */
export function luminance([r, g, b]: Rgba): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const css = ([r, g, b]: Rgba) => `rgb(${r}, ${g}, ${b})`;

/** Primer fondo sólido desde `el` hacia arriba (hasta `stop`, incluido). */
function solidBackground(el: Element | null, stop: Element): Rgba | null {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const c = parseColor(getComputedStyle(node).backgroundColor);
    if (opaque(c)) return c;
    if (node === stop) break;
  }
  return null;
}

/** Color CSS cualquiera (`var(--brand)`, `hsl(…)`) → rgb calculado dentro de `host`. */
function resolveColor(host: Element, value: string): Rgba | null {
  const probe = document.createElement('span');
  probe.style.color = value;
  if (!probe.style.color) return null;
  probe.style.display = 'none';
  host.appendChild(probe);
  const c = parseColor(getComputedStyle(probe).color);
  probe.remove();
  return c;
}

/**
 * Lee la apariencia de la plantilla montada en `root` (la sección del libro
 * se busca dentro, o se pasa en `sectionEl`). Devuelve `null` si no hay nada
 * que leer (sin `getComputedStyle`, o la plantilla aún no pintó).
 */
export function readLedgerTheme(
  root: HTMLElement | null,
  sectionEl?: Element | null,
): LedgerTheme | null {
  if (!root || typeof getComputedStyle !== 'function') return null;
  const section = sectionEl ?? root.querySelector('[data-sec~="libro"]') ?? root;
  const bgC =
    solidBackground(section, root.parentElement ?? root) ??
    parseColor(getComputedStyle(document.body).backgroundColor);
  if (!opaque(bgC)) return null;
  const s = getComputedStyle(section);
  let inkC = parseColor(s.color);
  if (!inkC || contrast(inkC, bgC) < 4.5) {
    inkC = luminance(bgC) > 0.35 ? [20, 20, 24, 1] : [245, 245, 247, 1];
  }

  // Acento: el botón principal de ayuda (todas las plantillas lo tienen) o el
  // enlace del propio libro; si ninguno contrasta con el fondo, la tinta.
  const cta = root.querySelector('#portal-help-cta');
  const ctaBg = cta ? parseColor(getComputedStyle(cta).backgroundColor) : null;
  const ctaInk = cta ? parseColor(getComputedStyle(cta).color) : null;
  const link = section.querySelector('.k-lnk, [data-ledger]');
  const linkC = link ? parseColor(getComputedStyle(link).color) : null;
  const candidates: Array<[Rgba | null, Rgba | null]> = [
    [ctaBg, ctaInk],
    [linkC, null],
    // Color de marca de la organización (portal clásico y respaldo general).
    [resolveColor(section, 'var(--brand)'), null],
    [resolveColor(section, 'hsl(var(--primary))'), null],
  ];
  let accent: Rgba = inkC;
  let accentInk: Rgba = bgC;
  for (const [c, on] of candidates) {
    if (opaque(c) && contrast(c, bgC) >= 1.6 && contrast(c, inkC) >= 1.25) {
      accent = c;
      accentInk =
        on && opaque(on) && contrast(on, c) >= 3
          ? on
          : luminance(c) > 0.4
            ? [20, 20, 24, 1]
            : [255, 255, 255, 1];
      break;
    }
  }

  const head = section.querySelector('h2, h3') ?? root.querySelector('h2, h1');
  // Texto corrido: filas del libro o el subtítulo (nunca el antetítulo, que
  // en varias plantillas usa una tipografía de detalle).
  const body = section.querySelector('.af-led li, .k-sub, li, td') ?? root;
  // Redondeo: el de las tarjetas del propio libro; si no, el de otras tarjetas.
  const card =
    section.querySelector('.af-led dl > div, .x-table, table, dl') ??
    root.querySelector('.k-nd, .k-act, .k-pr, figure, article');
  const radius = card ? getComputedStyle(card).borderTopLeftRadius : '';

  return {
    bg: css(bgC),
    ink: css(inkC),
    accent: css(accent),
    accentInk: css(accentInk),
    font: getComputedStyle(body).fontFamily || s.fontFamily,
    headFont: (head && getComputedStyle(head).fontFamily) || s.fontFamily,
    radius: radius ? `min(${radius}, 22px)` : '14px',
    scheme: luminance(bgC) > 0.35 ? 'light' : 'dark',
  };
}

/** Variables CSS que consume el libro con estilo de plantilla. */
export function ledgerThemeStyle(t: LedgerTheme): CSSProperties {
  return {
    '--led-bg': t.bg,
    '--led-ink': t.ink,
    '--led-acc': t.accent,
    '--led-acc-ink': t.accentInk,
    '--led-font': t.font,
    '--led-head': t.headFont,
    '--led-r': t.radius,
    colorScheme: t.scheme,
  } as CSSProperties;
}
