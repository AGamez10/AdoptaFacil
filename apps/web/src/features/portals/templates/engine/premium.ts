import { COPY, EMPTY, type TplAnimal, type TplModel } from './model';
import type { Kit } from './kit';
import { PREMIUM_KIT_CSS } from './premium-css';
import {
  fmt,
  ic,
  mapEmbed,
  mapLink,
  portrait,
  productArt,
  qs,
  qsa,
  socialLink,
  stars,
  type CatalogFilter,
} from './runtime';
import { unesc } from './safe';
import type { TemplateDesign, TemplateEnv } from './types';

/**
 * Motor de las plantillas Premium. Cada una tiene DOS experiencias (modo claro
 * y modo oscuro) con el mismo contenido y las mismas reglas de visibilidad que
 * el portal clásico. El visitante cambia de modo con el botón de la cabecera;
 * sin elección previa se sigue `prefers-color-scheme`.
 */
export type Mode = 'light' | 'dark';

type DesignId = TemplateDesign['id'];

const SUN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke-linecap="round"/></svg>`;
const MOON = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>`;
export const pic = { ...ic, sun: SUN, moon: MOON };

/* ------------------------------------------------------------ kit de secciones */

/** Secciones del contrato con la estructura `.k-*` del kit Premium. */
export function createPremiumKit(
  m: TplModel,
  kit: Kit,
  mode: Mode,
  modes: Record<Mode, string>,
  catId: string,
) {
  const { ORG, SHOW } = m;
  const hd = (eb: string, title: string, extra = '', sub = '') =>
    `<div class="k-hd"><div class="k-hdt"><p class="k-eb">${eb}</p><h2 class="k-h2">${title}</h2>${sub ? `<p class="k-sub">${sub}</p>` : ''}</div>${extra}</div>`;

  const ACTS = [
    ['Adoptar', 'Elige a uno de ellos y sigue su solicitud de adopción.', `#${catId}`],
    ['Apadrinar', 'Elige a uno de ellos y acompaña sus cuidados.', `#${catId}`],
    ['Donar', 'Apoya el trabajo de la organización.', ORG.donateHref],
  ] as const;

  const P = {
    hd,
    catControls: (id: string, ph?: string) => catControls(id, ph),
    /** Mismo indicador que el portal clásico; solo con nivel de verificación > 0. */
    tbar: () => {
      if (!SHOW.transparencia) return '';
      const t = kit.transparencyParts();
      return `<div class="k-tb" data-sec="transparencia" role="group" aria-label="Transparencia: ${t.level}, ${t.formalization}, ${t.accountability}"><div class="w">${ic.shield}<b>${t.level}</b><span>${t.formalization}</span>${ORG.isEsal ? `<span class="esal">${ic.check}${ORG.formalLabel}</span>` : ''}<span>${t.accountability}</span><span class="ac">${t.note}</span></div></div>`;
    },
    acts: (
      head = hd('Cómo participar', 'Adopta, apadrina o dona'),
      item?: (t: string, d: string, i: number, href: string) => string,
    ) =>
      `<section class="w k-sec" data-sec="acciones">${head}<div class="k-acts">${ACTS.map(
        ([t, d, h], i) =>
          item
            ? item(t, d, i, h)
            : `<a class="k-act" href="${h}"><b>${t}</b><p>${d}</p><span class="k-go">${ic.arrow}</span></a>`,
      ).join('')}</div><p class="k-note">${ic.shield}${COPY.adoptNote}</p></section>`,
    needs: (head = hd('Banco de recursos', 'Necesita hoy')) =>
      `<section class="w k-sec" data-sec="necesidades">${head}${
        m.NEEDS.length
          ? `<div class="k-needs">${m.NEEDS.map(
              (n) =>
                `<div class="k-nd">${n.category ? `<span class="k">${n.category}</span>` : ''}<b>${n.title}</b><div class="k-bar" data-w="${n.pct}"><i></i></div><p><span>${n.got} de ${n.need} ${n.unit}</span><span>${n.pct}%</span></p><a href="${n.href}">Ver y donar</a></div>`,
            ).join('')}</div>`
          : `<p class="k-empty">${EMPTY.necesidades}</p>`
      }</section>`,
    prods: (head = hd('Tienda solidaria', 'Productos'), bg?: string) =>
      `<section class="w k-sec" data-sec="productos">${head}${
        m.PRODUCTS.length
          ? `<div class="k-prods">${m.PRODUCTS.map(
              (p) =>
                `<a class="k-pr" href="${p.href}"><div class="ph">${productArt(p, bg)}</div>${p.category ? `<span class="k">${p.category}</span>` : ''}<b>${p.name}</b><span class="row"><span class="pr">${fmt(p.price)}</span><span class="by">Ver</span></span></a>`,
            ).join('')}</div>`
          : `<p class="k-empty">${EMPTY.productos}</p>`
      }</section>`,
    help: () =>
      `<section class="w k-sec" id="portal-help-cta" data-sec="ayuda"><div class="k-help"><h2>${COPY.helpTitle}</h2><p>${COPY.helpText}</p><a class="k-btn" href="${ORG.donateHref}" data-magnet>${COPY.helpCta} ${ic.arrow}</a></div></section>`,
    about: (head = `<div><p class="k-eb">Quiénes somos</p><h2 class="k-h2">Nosotros</h2></div>`) =>
      SHOW.nosotros
        ? `<section class="w k-sec" data-sec="nosotros"><div class="k-about">${head}<div><p class="tx">${ORG.about}</p>${kit.badgeList()}</div></div></section>`
        : '',
    revs: (
      head = hd(
        'Opiniones',
        'Reseñas',
        `<button type="button" class="k-lnk" data-review>Registrar reseña ${ic.arrow}</button>`,
      ),
    ) =>
      `<section class="w k-sec" data-sec="resenas">${head}${
        m.REVIEWS.length
          ? `<div class="k-revs">${m.REVIEWS.map(
              (r) =>
                `<figure><span class="st" role="img" aria-label="${r.rating} de 5 estrellas">${stars(r.rating)}</span>${r.text ? `<blockquote>${r.text}</blockquote>` : ''}<figcaption>${r.name}${r.date ? ` · ${r.date}` : ''}</figcaption></figure>`,
            ).join('')}</div>`
          : `<p class="k-empty">${EMPTY.resenas}</p>`
      }</section>`,
    ledger: (
      head = hd(
        'Transparencia',
        'Libro público',
        `<button type="button" class="k-lnk" data-ledger>Ver libro completo ${ic.arrow}</button>`,
        COPY.ledgerText,
      ),
    ) =>
      `<section class="w k-sec" data-sec="libro">${head}<p class="k-empty">${EMPTY.libro}</p></section>`,
    contact: () => {
      if (!SHOW.contacto) return '';
      const map = mapEmbed(m);
      return `<section class="w k-sec" data-sec="contacto"><div class="k-contact${map ? '' : ' nomap'}"><div class="info"><p class="k-eb">Visítanos</p><h2 class="k-h2 sm">Contacto</h2>${kit.contactRows('', true)}${mapLink(m, 'k-lnk')}</div>${map ? `<div class="map">${map}</div>` : ''}</div></section>`;
    },
    socials: () =>
      SHOW.redes
        ? `<div class="k-soc" data-sec="redes"><p>${COPY.socialsText}</p><div>${m.SOCIALS.map((x) => socialLink(x, ic[x.key])).join('')}</div></div>`
        : '',
    /** Campaña activa (bloque propio de cada plantilla) o el mismo vacío del clásico. */
    campaign: (active: () => string, head = hd('Campaña activa', 'Sin campaña por ahora')) =>
      m.CAMPAIGN.active
        ? active()
        : `<section class="w k-sec" data-sec="campana">${head}<p class="k-empty">${EMPTY.campana}</p></section>`,
    more: () => kit.moreCampaigns(),
    foot: () =>
      `<footer class="k-foot"><div class="w">${P.socials()}<div class="k-fl"><span>© ${ORG.name}${ORG.place ? ` · ${ORG.place}` : ''}</span><span>Portal hecho con AdoptaFácil</span></div></div></footer>`,
    modeBtn: () => {
      const next: Mode = mode === 'light' ? 'dark' : 'light';
      return `<button type="button" class="k-mode" data-mode-toggle aria-label="Cambiar a ${modes[next].toLowerCase()}">${mode === 'light' ? MOON : SUN}<span>${modes[next]}</span></button>`;
    },
  };
  return P;
}

export type PremiumKit = ReturnType<typeof createPremiumKit>;

/* ------------------------------------------------------------ efectos */

export interface Fx {
  signal: AbortSignal;
  reduce: boolean;
  hover: boolean;
  /** Equipo modesto (pantalla chica o pocos núcleos): menos partículas. */
  low: boolean;
  /** Bucle por cuadro que se pausa fuera de pantalla y con la pestaña oculta. */
  onFrame: (fn: (t: number) => void, el?: Element | null) => void;
  /** Lienzo nítido con densidad limitada; `S.w/S.h` siguen el tamaño real. */
  canvas2d: (cv: HTMLCanvasElement, onResize?: (S: Canvas2D) => void) => Canvas2D | null;
  reveal: TemplateEnv['motion']['reveal'];
  countUp: TemplateEnv['motion']['countUp'];
  magnet: TemplateEnv['motion']['magnet'];
  observe: TemplateEnv['motion']['observe'];
  /** Rellena barras `[data-w]` (variable `--p`) cuando entran en pantalla. */
  fillOnView: (root: ParentNode, sel: string) => void;
}

export interface Canvas2D {
  w: number;
  h: number;
  g: CanvasRenderingContext2D;
}

function createFx(env: TemplateEnv, signal: AbortSignal): Fx {
  const { motion } = env;
  const low =
    (typeof matchMedia === 'function' && matchMedia('(max-width: 760px)').matches) ||
    (navigator.hardwareConcurrency || 8) <= 4;
  const dpr = Math.min(devicePixelRatio || 1, low ? 1.5 : 2);
  const hasIO = typeof IntersectionObserver === 'function';
  const observe: Fx['observe'] = (els, cb, opts) => {
    if (!hasIO || els.length === 0) return;
    const io = new IntersectionObserver((entries) => entries.forEach((en) => cb(en, io)), opts);
    els.forEach((el) => io.observe(el));
    signal.addEventListener('abort', () => io.disconnect());
  };
  // Mismas utilidades que el motor general, pero atadas a la vida de ESTE modo.
  return {
    signal,
    reduce: motion.reduce,
    hover: motion.hover,
    low,
    observe,
    onFrame(fn, el) {
      if (typeof requestAnimationFrame !== 'function') return;
      let on = true;
      if (el) observe([el], (en) => (on = en.isIntersecting), { rootMargin: '80px' });
      let id = 0;
      const loop = (t: number) => {
        id = requestAnimationFrame(loop);
        if (on && !document.hidden) fn(t);
      };
      id = requestAnimationFrame(loop);
      signal.addEventListener('abort', () => cancelAnimationFrame(id));
    },
    canvas2d(cv, onResize) {
      const g = cv.getContext('2d');
      if (!g) return null;
      const S: Canvas2D = { w: 0, h: 0, g };
      const fit = () => {
        const r = cv.getBoundingClientRect();
        S.w = r.width;
        S.h = r.height;
        cv.width = Math.max(1, (r.width * dpr) | 0);
        cv.height = Math.max(1, (r.height * dpr) | 0);
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        onResize?.(S);
      };
      fit();
      if (typeof ResizeObserver === 'function') {
        const ro = new ResizeObserver(fit);
        ro.observe(cv);
        signal.addEventListener('abort', () => ro.disconnect());
      }
      return S;
    },
    reveal(root, sel, opts = {}) {
      if (motion.reduce || !hasIO) return;
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
      if (motion.reduce || !to || !hasIO) {
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
            el.textContent = String(f(to * (1 - Math.pow(1 - k, 4))));
            if (k < 1) requestAnimationFrame(step);
          };
          step(st);
        },
        { threshold: 0.4 },
      );
    },
    magnet(root) {
      if (motion.reduce || !motion.hover) return;
      qsa(root, '[data-magnet]').forEach((b) => {
        b.addEventListener(
          'pointermove',
          (e) => {
            const r = b.getBoundingClientRect();
            b.style.translate = `${((e.clientX - r.left - r.width / 2) * 0.18).toFixed(1)}px ${((e.clientY - r.top - r.height / 2) * 0.28).toFixed(1)}px`;
          },
          { signal },
        );
        b.addEventListener('pointerleave', () => (b.style.translate = ''), { signal });
      });
    },
    fillOnView(root, sel) {
      const els = qsa(root, sel);
      const fill = (el: HTMLElement) => {
        el.style.setProperty('--p', el.dataset.w + '%');
        el.classList.add('on');
      };
      if (!hasIO) return els.forEach(fill);
      observe(
        els,
        (en, io) => {
          if (!en.isIntersecting) return;
          io.unobserve(en.target);
          fill(en.target as HTMLElement);
        },
        { threshold: 0.4 },
      );
    },
  };
}

/* ------------------------------------------------------------ catálogo */

export const catControls = (id: string, ph = 'Busca por nombre, raza o color') =>
  `<div class="k-fbar" id="${id}"><label class="k-q">${ic.search}<span class="sr">Buscar por nombre, raza o especie</span><input id="${id}-q" type="search" placeholder="${ph}" autocomplete="off" data-q></label><div class="k-chips" role="group" aria-label="Filtrar por especie" data-chips></div><label class="k-sort"><span class="sr">Ordenar</span><select id="${id}-s" data-sort><option value="recientes">Recién llegados primero</option><option value="espera">Más tiempo esperando</option><option value="jovenes">Más jóvenes</option><option value="mayores">Mayores primero</option><option value="nombre">Por nombre</option></select></label></div><p class="k-cnt" aria-live="polite" data-cnt></p>`;

export interface CatOptions {
  id: string;
  grid: string;
  more: string;
  page: number;
  moreLabel?: string;
  sort?: CatalogFilter['sort'];
  render: (shown: TplAnimal[], all: TplAnimal[]) => string;
  after?: (host: HTMLElement, shown: TplAnimal[]) => void;
}

/**
 * Catálogo con búsqueda, especie (solo las que existen), orden y páginas: así
 * una organización con 100 animales no pinta 100 tarjetas de una vez.
 */
export function bindCatalog(app: HTMLElement, env: TemplateEnv, fx: Fx, o: CatOptions) {
  const { m, catalog } = env;
  const root = qs(app, '#' + o.id);
  const host = qs(app, o.grid);
  const more = qs<HTMLButtonElement>(app, o.more);
  if (!root || !host || !more) return null;
  const { signal } = fx;
  const f: CatalogFilter = { sp: '', q: '', sort: o.sort || 'recientes', isNew: false };
  let n = o.page;
  const chips = qs(root, '[data-chips]')!;
  const cnt = qs(root.parentElement ?? app, '[data-cnt]');
  const q = qs<HTMLInputElement>(root, '[data-q]')!;
  const CH = (
    [
      ['', 'Todos', m.ANIMALS.length],
      ['perro', 'Perros', m.COUNTS.perros],
      ['gato', 'Gatos', m.COUNTS.gatos],
      ['otro', 'Otros', m.COUNTS.otros],
      ['nuevo', 'Recién llegados', m.COUNTS.nuevos],
    ] as const
  ).filter(([k, , c]) => k === '' || c > 0);
  chips.innerHTML = CH.map(
    ([k, l, c]) =>
      `<button type="button" class="k-chip" data-k="${k}" aria-pressed="${k === ''}">${l}<span>${c}</span></button>`,
  ).join('');
  const paint = (keep = false) => {
    if (!keep) n = o.page;
    if (!m.ANIMALS.length) {
      host.innerHTML = `<p class="k-empty">${EMPTY.animales}</p>`;
      more.hidden = true;
      if (cnt) cnt.textContent = '';
      return;
    }
    const L = catalog.query(f);
    const k = Math.min(n, L.length);
    host.innerHTML = L.length
      ? o.render(L.slice(0, k), L)
      : `<div class="k-empty">Ningún animal coincide con esa búsqueda. <button type="button" class="k-lnk" data-clear>Ver todos ${ic.arrow}</button></div>`;
    if (cnt)
      cnt.innerHTML = `Viendo <b>${k}</b> de <b>${L.length}</b>${f.sp || f.q || f.isNew ? ` · ${m.ANIMALS.length} en total` : ' animales en adopción'}`;
    more.hidden = k >= L.length;
    more.innerHTML = `${o.moreLabel || 'Ver'} ${Math.min(o.page, L.length - k)} más <span>quedan ${L.length - k}</span>`;
    o.after?.(host, L.slice(0, k));
  };
  const press = (b: Element | null) =>
    qsa(chips, '.k-chip').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  chips.addEventListener(
    'click',
    (e) => {
      const b = (e.target as Element).closest<HTMLElement>('.k-chip');
      if (!b) return;
      press(b);
      f.sp = b.dataset.k === 'nuevo' ? '' : b.dataset.k;
      f.isNew = b.dataset.k === 'nuevo';
      paint();
    },
    { signal },
  );
  let t = 0;
  q.addEventListener(
    'input',
    () => {
      clearTimeout(t);
      t = window.setTimeout(() => {
        f.q = q.value;
        paint();
      }, 140);
    },
    { signal },
  );
  qs<HTMLSelectElement>(root, '[data-sort]')!.addEventListener(
    'change',
    (e) => {
      f.sort = (e.target as HTMLSelectElement).value as CatalogFilter['sort'];
      paint();
    },
    { signal },
  );
  more.addEventListener(
    'click',
    () => {
      n += o.page;
      paint(true);
    },
    { signal },
  );
  host.addEventListener(
    'click',
    (e) => {
      if (!(e.target as Element).closest('[data-clear]')) return;
      f.sp = '';
      f.q = '';
      f.isNew = false;
      q.value = '';
      press(qs(chips, '.k-chip'));
      paint();
    },
    { signal },
  );
  paint();
  return { paint, f };
}

/* ------------------------------------------------------------ utilidades */

/** Código de barras determinista por id (decorativo). */
export function barcode(seed: string, w = 120, h = 34, c = 'currentColor'): string {
  let s = [...seed].reduce((t, ch) => (t * 31 + ch.charCodeAt(0)) % 2147483647, 7) || 7;
  let x = 0;
  let out = '';
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  while (x < w - 2) {
    const bw = 1 + ((r() * 3) | 0);
    if (r() > 0.38) out += `<rect x="${x}" y="0" width="${bw}" height="${h}"/>`;
    x += bw + 1;
  }
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" fill="${c}" aria-hidden="true">${out}</svg>`;
}

/** Retrato decorativo (el nombre ya va en el texto de la tarjeta). */
export const deco = (a: TplAnimal, opt: Parameters<typeof portrait>[1] = {}) =>
  portrait(a, { decor: true, ...opt });

/** Texto plano (para `aria-label` armados en el navegador). */
export const plain = unesc;

/** Preferencias guardadas por portal (láminas vistas, marcas). Nunca rompen si no hay storage. */
export function stored(key: string): Set<string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(key) || '[]');
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function store(key: string, set: Set<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    /* sin almacenamiento: se pierde solo la preferencia */
  }
}

/* ------------------------------------------------------------ plantilla */

export interface PremiumCtx {
  m: TplModel;
  kit: Kit;
  P: PremiumKit;
  mode: Mode;
}

export interface PremiumInitCtx extends PremiumCtx {
  env: TemplateEnv;
  fx: Fx;
  /** Catálogo paginado ligado a este modo. */
  cat: (o: CatOptions) => ReturnType<typeof bindCatalog>;
}

export type CatFn = PremiumInitCtx['cat'];

export interface PremiumSpec {
  id: DesignId;
  fonts: string;
  css: string;
  /** Nombre visible de cada experiencia (p. ej. "Láminas" / "Holográfica"). */
  modes: Record<Mode, string>;
  /** Id del catálogo (destino de "Adoptar" y "Apadrinar"). */
  catId: string;
  html: (c: PremiumCtx) => string;
  init?: (app: HTMLElement, c: PremiumInitCtx) => void;
}

const MODE_KEY = 'af-tpl-mode:';

function preferredMode(id: DesignId): Mode {
  try {
    const v = localStorage.getItem(MODE_KEY + id);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* sin almacenamiento */
  }
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

type ViewTransitionDoc = Document & {
  startViewTransition?: (cb: () => void) => { ready: Promise<void> };
};

export function premiumDesign(spec: PremiumSpec): TemplateDesign {
  const ctx = (m: TplModel, kit: Kit, mode: Mode): PremiumCtx => ({
    m,
    kit,
    mode,
    P: createPremiumKit(m, kit, mode, spec.modes, spec.catId),
  });
  return {
    id: spec.id,
    fonts: spec.fonts,
    css: PREMIUM_KIT_CSS + spec.css,
    premium: true,
    // Sin `init` (pruebas, primer pintado) se muestra el modo claro.
    html: (m, kit) => spec.html(ctx(m, kit, 'light')),
    init(app, env) {
      const { signal } = env.motion;
      app.classList.add('pk');
      let mode: Mode = preferredMode(spec.id);
      let live: AbortController | null = null;
      const mount = (rerender: boolean) => {
        live?.abort();
        live = new AbortController();
        const sub = live;
        signal.addEventListener('abort', () => sub.abort(), { once: true });
        const c = ctx(env.m, env.kit, mode);
        app.dataset.mode = mode;
        if (rerender) app.innerHTML = spec.html(c);
        const fx = createFx(env, sub.signal);
        try {
          spec.init?.(app, { ...c, env, fx, cat: (o) => bindCatalog(app, env, fx, o) });
        } catch (error) {
          console.error('[portal-template]', spec.id, mode, error);
        }
      };
      mount(mode !== 'light');
      const setMode = (next: Mode, x: number, y: number, save: boolean) => {
        if (next === mode) return;
        mode = next;
        if (save) {
          try {
            localStorage.setItem(MODE_KEY + spec.id, next);
          } catch {
            /* sin almacenamiento */
          }
        }
        const keep = scrollY;
        const go = () => {
          mount(true);
          scrollTo(0, keep);
        };
        const doc = document as ViewTransitionDoc;
        if (!doc.startViewTransition || env.motion.reduce) return go();
        const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
        doc
          .startViewTransition(go)
          .ready.then(() =>
            document.documentElement.animate(
              { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
              {
                duration: 750,
                easing: 'cubic-bezier(.65,0,.35,1)',
                pseudoElement: '::view-transition-new(root)',
              },
            ),
          )
          .catch(() => undefined);
      };
      app.addEventListener(
        'click',
        (e) => {
          const b = (e.target as Element).closest('[data-mode-toggle]');
          if (!b) return;
          const r = b.getBoundingClientRect();
          setMode(
            mode === 'light' ? 'dark' : 'light',
            r.left + r.width / 2,
            r.top + r.height / 2,
            true,
          );
        },
        { signal },
      );
      // Sin elección del visitante, se sigue el tema del sistema en vivo.
      if (typeof matchMedia === 'function') {
        const mq = matchMedia('(prefers-color-scheme: dark)');
        mq.addEventListener?.(
          'change',
          (e) => {
            try {
              if (localStorage.getItem(MODE_KEY + spec.id)) return;
            } catch {
              /* sin almacenamiento */
            }
            setMode(e.matches ? 'dark' : 'light', innerWidth / 2, 0, false);
          },
          { signal },
        );
      }
    },
  };
}
