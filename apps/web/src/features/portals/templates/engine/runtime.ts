import { EMPTY, type TplAnimal, type TplModel, type TplProduct } from './model';

/**
 * Utilidades compartidas por las 14 plantillas: íconos, retratos ilustrados de
 * respaldo, formato de dinero, animaciones y el motor de filtros del catálogo.
 * Nada aquí toca datos sin sanear: reciben el `TplModel` ya escapado.
 */

export const fmt = (n: number): string => '$' + Math.round(n).toLocaleString('es-CO');

export const stars = (n: number): string => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);

export const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const canHover = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(hover: hover)').matches;

const svg = (body: string, attrs = 'fill="none" stroke="currentColor" stroke-width="2"') =>
  `<svg viewBox="0 0 24 24" ${attrs} aria-hidden="true">${body}</svg>`;

export const paw = (c = 'currentColor'): string =>
  `<svg viewBox="0 0 48 48" fill="${c}" aria-hidden="true"><ellipse cx="24" cy="31" rx="11" ry="9"/><ellipse cx="9" cy="21" rx="4.6" ry="6"/><ellipse cx="19" cy="12" rx="4.6" ry="6.4"/><ellipse cx="29" cy="12" rx="4.6" ry="6.4"/><ellipse cx="39" cy="21" rx="4.6" ry="6"/></svg>`;

export const ic = {
  paw: paw(),
  check: svg(
    '<path d="M5 12.5l4.5 4.5L19 7.5" stroke-linecap="round" stroke-linejoin="round"/>',
    'fill="none" stroke="currentColor" stroke-width="2.4"',
  ),
  arrow: svg(
    '<path d="M5 12h14M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/>',
    'fill="none" stroke="currentColor" stroke-width="2.2"',
  ),
  back: svg(
    '<path d="M19 12H5M11 6l-6 6 6 6" stroke-linecap="round" stroke-linejoin="round"/>',
    'fill="none" stroke="currentColor" stroke-width="2.2"',
  ),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5" stroke-linecap="round"/>'),
  heart: svg(
    '<path d="M12 21s-7.5-4.6-9.5-9.3C1 8 3.4 4.5 7 4.5c2 0 3.6 1.1 5 2.8 1.4-1.7 3-2.8 5-2.8 3.6 0 6 3.5 4.5 7.2C19.5 16.4 12 21 12 21z"/>',
    'fill="currentColor"',
  ),
  x: svg(
    '<path d="M6 6l12 12M18 6L6 18" stroke-linecap="round"/>',
    'fill="none" stroke="currentColor" stroke-width="2.4"',
  ),
  close: svg('<path d="M6 6l12 12M18 6L6 18" stroke-linecap="round"/>'),
  instagram: svg(
    '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/>',
  ),
  facebook: svg(
    '<path d="M14 8h3V4h-3c-2.8 0-4.5 1.8-4.5 4.6V11H7v4h2.5v7h4v-7h3l.5-4h-3.5V8.8c0-.5.3-.8.5-.8z"/>',
    'fill="currentColor"',
  ),
  tiktok: svg(
    '<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5" stroke-linecap="round"/><path d="M14 3c.4 2.6 2.2 4.4 5 4.6" stroke-linecap="round"/>',
  ),
  whatsapp: svg(
    '<path d="M4 20l1.3-3.8A8 8 0 1 1 8 19z" stroke-linejoin="round"/><path d="M9 9.5c.3 2 2.2 4.1 4.6 4.6l1-1.1 1.8.8c-.2 1.2-1.1 1.8-2.2 1.7-3.2-.4-5.9-3-6.3-6.3-.1-1.1.5-2 1.7-2.2l.8 1.8z" fill="currentColor" stroke="none"/>',
  ),
  website: svg(
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"/>',
  ),
  email: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
  pin: svg(
    '<path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12zm0-9a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/>',
    'fill="currentColor"',
  ),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2" stroke-linecap="round"/>'),
  phone: svg(
    '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" stroke-linejoin="round"/>',
  ),
  shield: svg(
    '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" stroke-linejoin="round"/><path d="M8.5 12l2.5 2.5 4.5-5" stroke-linecap="round" stroke-linejoin="round"/>',
  ),
  book: svg(
    '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" stroke-linejoin="round"/><path d="M4 21V5M8 7h7M8 11h7"/>',
  ),
  bag: svg(
    '<path d="M5 8h14l-1 13H6z" stroke-linejoin="round"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  ),
  star: svg(
    '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    'fill="currentColor"',
  ),
} as const;

export type IconKey = keyof typeof ic;

/** "Llegó hace N días" a partir de la fecha REAL de publicación. */
export const sinceLabel = (a: Pick<TplAnimal, 'days'>): string => {
  const d = a.days;
  if (d === 0) return 'Publicado hoy';
  if (d === 1) return 'Publicado ayer';
  if (d < 30) return `Publicado hace ${d} días`;
  if (d < 60) return 'Publicado hace un mes';
  return `Publicado hace ${Math.round(d / 30)} meses`;
};

/* ---------------------------------------------------------------- retratos */

function figure(a: TplAnimal): string {
  const pt = a.pattern;
  if (a.sp === 'gato')
    return `<g>
      <path d="M22 44 L27 14 L44 31 Z" fill="${a.fig}"/><path d="M78 44 L73 14 L56 31 Z" fill="${a.fig}"/>
      <path d="M26.5 37 L29 22 L38 31 Z" fill="${a.light ? '#F1C9C4' : 'rgba(255,255,255,.1)'}"/><path d="M73.5 37 L71 22 L62 31 Z" fill="${a.light ? '#F1C9C4' : 'rgba(255,255,255,.1)'}"/>
      <ellipse cx="50" cy="52" rx="30" ry="27" fill="${a.fig}"/>
      ${pt === 'stripes' ? `<path d="M44 26 L47 36 M50 25 L50 36 M56 26 L53 36 M22 50 L30 52 M21 58 L30 58 M78 50 L70 52 M79 58 L70 58" stroke="${a.ear}" stroke-width="2.6" stroke-linecap="round"/>` : ''}
      ${pt === 'patch' ? `<ellipse cx="62" cy="44" rx="12" ry="10" fill="${a.ear}" opacity=".85"/>` : ''}
      <path d="M8 120 C10 84 28 74 50 74 C72 74 90 84 92 120 Z" fill="${a.fig}"/>
      ${pt === 'mask' ? `<path d="M36 60 Q50 74 64 60 L64 70 Q50 82 36 70 Z" fill="${a.snout}"/>` : ''}
      <ellipse cx="39" cy="50" rx="4.6" ry="5.6" fill="${a.eye}"/><ellipse cx="61" cy="50" rx="4.6" ry="5.6" fill="${a.eye}"/>
      <ellipse cx="39" cy="50.5" rx="1.3" ry="4.2" fill="#0A0A0A"/><ellipse cx="61" cy="50.5" rx="1.3" ry="4.2" fill="#0A0A0A"/>
      <path d="M46.5 59 L53.5 59 L50 63 Z" fill="${a.light ? '#D9958C' : '#E7A9A0'}"/>
      <path d="M30 60 L18 58 M30 63 L18 65 M70 60 L82 58 M70 63 L82 65" stroke="${a.light ? 'rgba(0,0,0,.18)' : 'rgba(255,255,255,.22)'}" stroke-width=".8"/>
    </g>`;
  if (a.sp === 'otro')
    return `<g transform="translate(26 30) scale(1)" fill="${a.fig}">${paw(a.fig).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g>`;
  const ears =
    a.ears === 'pointy'
      ? `<path d="M26 40 L24 12 L44 28 Z" fill="${a.ear}"/><path d="M74 40 L76 12 L56 28 Z" fill="${a.ear}"/>`
      : `<path d="M24 34 C14 36 10 54 15 68 C18 74 25 72 27 64 C29 54 29 42 24 34 Z" fill="${a.ear}"/><path d="M76 34 C86 36 90 54 85 68 C82 74 75 72 73 64 C71 54 71 42 76 34 Z" fill="${a.ear}"/>`;
  return `<g>
      ${a.ears === 'pointy' ? ears : ''}
      <ellipse cx="50" cy="50" rx="27" ry="28" fill="${a.fig}"/>
      ${pt === 'patch' ? `<ellipse cx="38" cy="45" rx="10" ry="11" fill="${a.ear}" opacity=".9"/>` : ''}
      ${a.ears !== 'pointy' ? ears : ''}
      <ellipse cx="50" cy="63" rx="15" ry="12" fill="${a.snout}"/>
      ${pt === 'mask' ? `<path d="M50 24 L50 52" stroke="${a.snout}" stroke-width="9" stroke-linecap="round"/>` : ''}
      <path d="M8 120 C10 86 28 76 50 76 C72 76 90 86 92 120 Z" fill="${a.fig}"/>
      <circle cx="40" cy="47" r="3.4" fill="${a.eye}"/><circle cx="60" cy="47" r="3.4" fill="${a.eye}"/>
      <circle cx="41" cy="46" r="1" fill="#fff" opacity=".7"/><circle cx="61" cy="46" r="1" fill="#fff" opacity=".7"/>
      <ellipse cx="50" cy="58" rx="5" ry="3.6" fill="#1A120C"/>
      <path d="M50 61.5 L50 66 M45 67 Q50 70 55 67" stroke="#1A120C" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    </g>`;
}

export interface PortraitOptions {
  dx?: number;
  dy?: number;
  s?: number;
  bg?: string;
  k?: string;
  decor?: boolean;
  bare?: boolean;
  fit?: string;
  /** Fuerza la ilustración aunque haya foto (p. ej. para texturas WebGL). */
  illustration?: boolean;
}

let PID = 0;

/**
 * Retrato del animal: la FOTO real cuando la organización la subió; si no, una
 * ilustración de respaldo (misma idea que el portal clásico, que pinta un
 * marcador en vez de inventar una foto). `a.photo` ya viene saneada y escapada.
 */
export function portrait(a: TplAnimal, opt: PortraitOptions = {}): string {
  if (a.photo && !opt.illustration) {
    return `<img class="portrait portrait--photo" src="${a.photo}" alt="${opt.decor ? '' : `Foto de ${a.name}`}" loading="lazy" decoding="async" referrerpolicy="no-referrer"${opt.decor ? ' aria-hidden="true"' : ''}>`;
  }
  const id = 'tp' + ++PID;
  const dx = opt.dx ?? 12;
  const dy = opt.dy ?? 22;
  const s = opt.s ?? 1;
  const bg = opt.bg || a.bg;
  return `<svg class="portrait" viewBox="0 0 100 100" preserveAspectRatio="${opt.fit || 'xMidYMid slice'}" ${opt.decor ? 'aria-hidden="true"' : `role="img" aria-label="Ilustración de ${a.name} mientras la organización sube su foto"`}>
    <defs><radialGradient id="${id}" cx="28%" cy="18%" r="65%"><stop offset="0" stop-color="#fff" stop-opacity="${a.light ? 0.7 : 0.22}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
    ${opt.bare ? '' : `<rect width="100" height="100" fill="${bg}"/><rect width="100" height="100" fill="url(#${id})"/>`}
    <g transform="translate(${dx} ${dy}) scale(${s})">${figure(a)}</g></svg>`;
}

/** Ilustración de producto (respaldo hasta que el producto tenga foto). */
export function productArt(p: TplProduct, bg?: string): string {
  if (p.img) {
    return `<img class="portrait portrait--photo" src="${p.img}" alt="${p.name}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
  }
  const ink = 'rgba(0,0,0,.72)';
  const f = p.tint;
  const shapes: Record<TplProduct['art'], string> = {
    shirt: `<path d="M30 28l12-8h16l12 8 10 14-10 6-5-5v37H35V43l-5 5-10-6z" fill="${f}"/><path d="M42 20c2 6 14 6 16 0" fill="none" stroke="${ink}" stroke-width="2"/>`,
    collar: `<ellipse cx="50" cy="52" rx="28" ry="22" fill="none" stroke="${f}" stroke-width="9"/><ellipse cx="50" cy="52" rx="28" ry="22" fill="none" stroke="${ink}" stroke-width="1.5" stroke-dasharray="3 4"/><circle cx="50" cy="80" r="8" fill="#F4B942"/><rect x="44" y="70" width="12" height="6" rx="2" fill="${ink}"/>`,
    mug: `<rect x="28" y="30" width="38" height="44" rx="6" fill="${f}"/><path d="M66 40h6a8 8 0 0 1 0 16h-6" fill="none" stroke="${f}" stroke-width="6"/><path d="M38 22c0-4 4-4 4-8M48 22c0-4 4-4 4-8" stroke="${ink}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".4"/>`,
    cal: `<rect x="26" y="24" width="48" height="54" rx="5" fill="#fff"/><rect x="26" y="24" width="48" height="14" rx="5" fill="${f}"/><path d="M36 20v8M64 20v8" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`,
    bag: `<path d="M26 36h48l-4 44H30z" fill="${f}"/><path d="M38 36v-6a12 12 0 0 1 24 0v6" fill="none" stroke="${ink}" stroke-width="3"/><g transform="translate(40 50) scale(.42)" fill="${ink}" opacity=".7"><ellipse cx="24" cy="31" rx="11" ry="9"/><ellipse cx="9" cy="21" rx="4.6" ry="6"/><ellipse cx="19" cy="12" rx="4.6" ry="6.4"/><ellipse cx="29" cy="12" rx="4.6" ry="6.4"/><ellipse cx="39" cy="21" rx="4.6" ry="6"/></g>`,
  };
  return `<svg class="portrait" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><rect width="100" height="100" fill="${bg || 'transparent'}"/>${shapes[p.art]}</svg>`;
}

/**
 * Mapa del contacto: el MISMO embed de Google Maps que el portal clásico (URL ya
 * validada contra hosts de Google y saneada). Sin embed no se pinta nada.
 */
export function mapEmbed(m: TplModel, cls = 'tpl-map'): string {
  const src = m.ORG.contact.mapEmbed;
  if (!src) return '';
  return `<iframe class="${cls}" title="Ubicación en el mapa" src="${src}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>`;
}

/** Enlace "Abrir en Google Maps" (solo con un enlace http(s) real cargado). */
export function mapLink(m: TplModel, cls: string, label = 'Abrir en Google Maps'): string {
  const href = m.ORG.contact.mapHref;
  if (!href) return '';
  return `<a class="${cls}" href="${href}" target="_blank" rel="noopener noreferrer">${m.ORG.contact.mapEmbed ? label : 'Ver en mapa'} ${ic.arrow}</a>`;
}

/** Enlaces de redes (todas las URL ya saneadas). */
export function socialLink(x: TplModel['SOCIALS'][number], inner: string, cls = ''): string {
  return `<a${cls ? ` class="${cls}"` : ''} href="${x.url}"${x.external ? ' target="_blank" rel="noopener noreferrer"' : ''} aria-label="${x.label}: ${x.handle}">${inner}</a>`;
}

/* ------------------------------------------------------- motor de catálogo */

export interface CatalogFilter {
  q?: string;
  sp?: string;
  size?: string;
  stage?: string;
  sex?: string;
  isNew?: boolean;
  sort?: 'recientes' | 'nombre' | 'jovenes' | 'mayores' | 'espera';
}

export const FACETS = {
  sp: [
    ['perro', 'Perros'],
    ['gato', 'Gatos'],
    ['otro', 'Otros'],
  ],
  size: [
    ['Pequeño', 'Pequeño'],
    ['Mediano', 'Mediano'],
    ['Grande', 'Grande'],
  ],
  stage: [
    ['Cachorro', 'Cachorro'],
    ['Gatito', 'Gatito'],
    ['Joven', 'Joven'],
    ['Adulto', 'Adulto'],
    ['Senior', 'Senior'],
  ],
  sex: [
    ['Hembra', 'Hembra'],
    ['Macho', 'Macho'],
  ],
} as const;

export const norm = (t: string): string =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export function createCatalog(animals: readonly TplAnimal[]) {
  function query(f: CatalogFilter = {}): TplAnimal[] {
    const q = norm(f.q || '');
    const list = animals.filter(
      (a) =>
        (!f.sp || a.sp === f.sp) &&
        (!f.size || a.size === f.size) &&
        (!f.stage || a.stage === f.stage) &&
        (!f.sex || a.sex === f.sex) &&
        (!f.isNew || a.isNew) &&
        (!q || norm(`${a.name} ${a.breed} ${a.spLabel} ${a.stage}`).includes(q)),
    );
    const sorts: Record<
      NonNullable<CatalogFilter['sort']>,
      (a: TplAnimal, b: TplAnimal) => number
    > = {
      recientes: (a, b) => a.days - b.days,
      nombre: (a, b) => a.name.localeCompare(b.name, 'es'),
      jovenes: (a, b) => a.months - b.months,
      mayores: (a, b) => b.months - a.months,
      espera: (a, b) => b.days - a.days,
    };
    return list.sort(sorts[f.sort || 'recientes']);
  }
  const facetCount = (f: CatalogFilter, key: keyof CatalogFilter, val: string | boolean) =>
    query({ ...f, [key]: val }).length;
  /** Facetas con al menos un animal: nunca se ofrece un filtro que dé 0 siempre. */
  const facet = <K extends keyof typeof FACETS>(key: K) =>
    FACETS[key].filter(([v]) =>
      animals.some((a) => (a as unknown as Record<string, unknown>)[key] === v),
    );
  return { query, facetCount, facet };
}

/* ------------------------------------------------------- animación / DOM */

export function qs<T extends Element = HTMLElement>(root: ParentNode, sel: string): T | null {
  return root.querySelector<T>(sel as never) as T | null;
}

export function qsa<T extends Element = HTMLElement>(root: ParentNode, sel: string): T[] {
  return Array.from(root.querySelectorAll(sel)) as T[];
}

export interface Motion {
  signal: AbortSignal;
  /** requestAnimationFrame en bucle, cancelado al desmontar y pausado en segundo plano. */
  onFrame: (fn: (t: number) => void) => void;
  reveal: (
    root: ParentNode,
    sel: string,
    opts?: { t?: number; stagger?: number; mod?: number },
  ) => void;
  countUp: (
    el: Element | null,
    to: number,
    f?: (v: number) => string | number,
    dur?: number,
  ) => void;
  magnet: (root: ParentNode) => void;
  /** IntersectionObserver desconectado al desmontar. */
  observe: (
    els: Element[],
    cb: (entry: IntersectionObserverEntry, io: IntersectionObserver) => void,
    opts?: IntersectionObserverInit,
  ) => void;
  reduce: boolean;
  hover: boolean;
}

export function createMotion(signal: AbortSignal): Motion {
  const reduce = prefersReducedMotion();
  const hover = canHover();
  const hasIO = typeof IntersectionObserver === 'function';
  const raf = typeof requestAnimationFrame === 'function';

  const observe: Motion['observe'] = (els, cb, opts) => {
    if (!hasIO || els.length === 0) return;
    const io = new IntersectionObserver((entries) => entries.forEach((en) => cb(en, io)), opts);
    els.forEach((el) => io.observe(el));
    signal.addEventListener('abort', () => io.disconnect());
  };

  return {
    signal,
    reduce,
    hover,
    observe,
    onFrame(fn) {
      if (!raf) return;
      let id = 0;
      const loop = (t: number) => {
        id = requestAnimationFrame(loop);
        if (!document.hidden) fn(t);
      };
      id = requestAnimationFrame(loop);
      signal.addEventListener('abort', () => cancelAnimationFrame(id));
    },
    reveal(root, sel, opts = {}) {
      if (reduce || !hasIO) return;
      const vh = innerHeight;
      const els = qsa(root, sel).filter((el) => el.getBoundingClientRect().top > vh * 0.92);
      els.forEach((el, i) => {
        el.classList.add('is-pre');
        el.style.transitionDelay = (opts.stagger ?? 0) * (i % (opts.mod ?? 4)) + 'ms';
      });
      observe(
        els,
        (en, io) => {
          if (en.isIntersecting) {
            en.target.classList.add('is-in');
            io.unobserve(en.target);
          }
        },
        { threshold: opts.t ?? 0.12 },
      );
    },
    countUp(el, to, f = (v) => Math.round(v), dur = 1400) {
      if (!el) return;
      if (reduce || !to || !hasIO || !raf) {
        el.textContent = String(f(to));
        return;
      }
      observe(
        [el],
        (en, io) => {
          if (!en.isIntersecting) return;
          io.disconnect();
          const st = performance.now();
          const step = (n: number) => {
            if (signal.aborted) return;
            const k = Math.min(1, (n - st) / dur);
            const e = 1 - Math.pow(1 - k, 4);
            el.textContent = String(f(to * e));
            if (k < 1) requestAnimationFrame(step);
          };
          step(st);
        },
        { threshold: 0.4 },
      );
    },
    magnet(root) {
      if (reduce || !hover) return;
      qsa(root, '[data-magnet]').forEach((b) => {
        b.addEventListener(
          'pointermove',
          (e) => {
            const r = b.getBoundingClientRect();
            b.style.transform = `translate(${((e.clientX - r.left - r.width / 2) * 0.2).toFixed(1)}px,${((e.clientY - r.top - r.height / 2) * 0.3).toFixed(1)}px)`;
          },
          { signal },
        );
        b.addEventListener(
          'pointerleave',
          () => {
            b.style.transform = '';
          },
          { signal },
        );
      });
    },
  };
}

/* ------------------------------------------------------- textos derivados */

/** "12 perros y gatos" / "1 gata" / "5 animales" según las especies REALES. */
export function countPhrase(m: TplModel): string {
  const { total, perros, gatos, otros } = m.COUNTS;
  if (total === 0) return 'Ningún animal';
  const one = total === 1;
  if (otros === 0 && gatos === 0) return `${total} ${one ? 'perro' : 'perros'}`;
  if (otros === 0 && perros === 0) return `${total} ${one ? 'gato' : 'gatos'}`;
  if (otros === 0) return `${total} perros y gatos`;
  return `${total} ${one ? 'animal' : 'animales'}`;
}

/** Verbo concordado con `countPhrase` ("busca"/"buscan"). */
export const verb = (m: TplModel, singular: string, plural: string): string =>
  m.COUNTS.total <= 1 ? singular : plural;

/** Frase de respaldo del hero cuando la organización no escribió descripción. */
export function availLine(m: TplModel, word = 'hogar'): string {
  if (m.COUNTS.total === 0) return EMPTY.animales;
  return `${countPhrase(m)} ${verb(m, 'busca', 'buscan')} ${word}${inCity(m)}.`;
}

/** " en Bogotá" solo si la organización registró su ciudad. */
export const inCity = (m: TplModel): string => (m.ORG.city ? ` en ${m.ORG.city}` : '');

/**
 * Imagen de la campaña: la portada real de la organización si existe; si no, un
 * panel con el color de marca. Nunca se asocia la campaña a un animal concreto
 * (el contrato de campañas no tiene ese vínculo).
 */
export function campaignArt(m: TplModel, cls = 'tpl-art'): string {
  if (m.ORG.cover) {
    return `<img class="portrait portrait--photo" src="${m.ORG.cover}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" aria-hidden="true">`;
  }
  return `<div class="${cls}" aria-hidden="true" style="position:absolute;inset:0;display:grid;place-items:center;background:var(--brand);color:var(--brand-ink)"><span style="width:38%;opacity:.35">${paw()}</span></div>`;
}

/** Logo real (si existe) o iniciales, para cabeceras y pies. */
export function logoMark(m: TplModel, cls = 'tpl-logo-img'): string {
  return m.ORG.logo
    ? `<img${cls ? ` class="${cls}"` : ''} src="${m.ORG.logo}" alt="Logo de ${m.ORG.name}" decoding="async" referrerpolicy="no-referrer">`
    : m.ORG.initials;
}
