import { COPY, EMPTY, type TplModel } from './model';
import {
  fmt,
  ic,
  mapEmbed,
  mapLink,
  portrait,
  productArt,
  qsa,
  socialLink,
  stars,
  type Motion,
} from './runtime';

/**
 * Secciones del contrato del portal público, en HTML saneado, con el MISMO
 * contenido y las MISMAS reglas que `OrgPublicPage` (clásico). Las plantillas de
 * la Serie 1 las usan tal cual (vestidas con `--k-*`); las de la Serie 2 usan
 * piezas sueltas (`badges`, `transparency`, `moreCampaigns`...).
 *
 * Toda sección lleva `data-sec="<id>"`: la prueba de contrato verifica que cada
 * plantilla pinte las 12 (o las oculte exactamente cuando la regla lo pide).
 */
export function createKit(m: TplModel) {
  const { ORG, SHOW } = m;

  const hd = (eb: string, title: string, extra = '') =>
    `<div class="k-hd"><div><p class="k-eb">${eb}</p><h2 class="k-h2">${title}</h2></div>${extra}</div>`;

  /** Texto del indicador de transparencia (mismo dato que el portal clásico). */
  const transparencyParts = () => ({
    level: `Nivel ${ORG.level}${ORG.levelLabel ? ` · ${ORG.levelLabel}` : ''}`,
    formalization: `${ORG.formalization}% formalización`,
    accountability: `Rendición: ${ORG.accountabilityLabel}`,
    note: COPY.accountability,
  });

  const badgeList = (cls = 'k-bdg') =>
    m.BADGES.length
      ? `<div class="${cls}">${m.BADGES.map((b) => `<span class="${b.ok ? 'ok' : ''}">${b.ok ? ic.check : ic.clock}${b.t}</span>`).join('')}</div>`
      : '';

  /** Campañas activas adicionales (el portal clásico las lista todas). */
  const moreCampaigns = (cls = 'tpl-more') =>
    m.CAMPAIGNS.length > 1
      ? `<ul class="${cls}">${m.CAMPAIGNS.slice(1)
          .map(
            (c) =>
              `<li><a href="${c.href}"><b>${c.title}</b><span>${c.pct}% · ${fmt(c.raised)} de ${fmt(c.goal)} · vence ${c.deadline}</span></a></li>`,
          )
          .join('')}</ul>`
      : '';

  const kit = {
    hd,
    badgeList,
    transparencyParts,
    moreCampaigns,
    /** Cuadrícula de animales (para mostrar a TODOS cuando el diseño destaca solo unos pocos). */
    grid: (list = m.ANIMALS, cls = 'k-grid') =>
      list.length
        ? `<div class="${cls}">${list
            .map(
              (x) =>
                `<a class="k-an" href="${x.href}"><span class="ph">${portrait(x, { k: 'kg', dx: 8, dy: 22, s: 1 })}</span><b>${x.name}</b><span>${x.spLabel} · ${x.age} · ${x.sizeLabel}</span></a>`,
            )
            .join('')}</div>`
        : '',
    tbar: () => {
      if (!SHOW.transparencia) return '';
      const t = transparencyParts();
      return `<div class="k-tb" data-sec="transparencia" role="group" aria-label="Transparencia: ${t.level}, ${t.formalization}, ${t.accountability}"><div class="w">${ic.shield}<b>${t.level}</b><span>${t.formalization}</span><span>${t.accountability}</span><span class="ac">${t.note}</span></div></div>`;
    },
    acts: (
      links: [string, string, string] = ['#animales', '#animales', ORG.donateHref],
      head = hd('Cómo participar', 'Adopta, apadrina o dona'),
    ) =>
      `<section class="w k-sec" data-sec="acciones">${head}<div class="k-acts">${(
        [
          ['Adoptar', 'Elige a uno de ellos y sigue su solicitud de adopción.'],
          ['Apadrinar', 'Elige a uno de ellos y acompaña sus cuidados.'],
          ['Donar', 'Apoya el trabajo de la organización.'],
        ] as const
      )
        .map(
          ([t, d], i) =>
            `<a class="k-act" href="${links[i]}"><span class="n">0${i + 1}</span><b>${t}</b><p>${d}</p></a>`,
        )
        .join('')}</div><p class="k-note">${COPY.adoptNote}</p></section>`,
    needs: (head = hd('Banco de recursos', 'Necesita hoy')) =>
      `<section class="w k-sec" data-sec="necesidades">${head}${
        m.NEEDS.length
          ? `<div class="k-needs">${m.NEEDS.map(
              (n) =>
                `<div class="k-nd">${n.category ? `<span class="k">${n.category}</span>` : ''}<b>${n.title}</b><div class="bar"><i data-w="${n.pct}"></i></div><p><span>${n.got} de ${n.need} ${n.unit}</span><span>${n.pct}%</span></p><a href="${n.href}">Ver y donar</a></div>`,
            ).join('')}</div>`
          : `<p class="k-empty">${EMPTY.necesidades}</p>`
      }</section>`,
    prods: (head = hd('Tienda solidaria', 'Productos')) =>
      `<section class="w k-sec" data-sec="productos">${head}${
        m.PRODUCTS.length
          ? `<div class="k-prods">${m.PRODUCTS.map(
              (p) =>
                `<a class="k-pr" href="${p.href}"><div class="ph">${productArt(p)}</div>${p.category ? `<span class="k">${p.category}</span>` : ''}<b>${p.name}</b><span class="row"><span>${fmt(p.price)}</span><span class="by">Ver</span></span></a>`,
            ).join('')}</div>`
          : `<p class="k-empty">${EMPTY.productos}</p>`
      }</section>`,
    help: () =>
      `<section class="w k-sec" id="portal-help-cta" data-sec="ayuda"><div class="k-help"><h2>${COPY.helpTitle}</h2><p>${COPY.helpText}</p><a class="k-btn" href="${ORG.donateHref}" data-magnet>${COPY.helpCta} ${ic.arrow}</a></div></section>`,
    about: (head = `<div><p class="k-eb">Quiénes somos</p><h2 class="k-h2">Nosotros</h2></div>`) =>
      SHOW.nosotros
        ? `<section class="w k-sec" data-sec="nosotros"><div class="k-about">${head}<div><p class="tx">${ORG.about}</p>${badgeList()}</div></div></section>`
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
                `<figure><span class="st" aria-label="${r.rating} de 5 estrellas">${stars(r.rating)}</span>${r.text ? `<blockquote>${r.text}</blockquote>` : ''}<figcaption>${r.name}${r.date ? ` · ${r.date}` : ''}</figcaption></figure>`,
            ).join('')}</div>`
          : `<p class="k-empty">${EMPTY.resenas}</p>`
      }</section>`,
    ledger: (
      head = hd(
        'Transparencia',
        'Libro público',
        `<button type="button" class="k-lnk" data-ledger>Ver libro completo ${ic.arrow}</button>`,
      ),
    ) =>
      `<section class="w k-sec" data-sec="libro">${head}<p class="k-sub" style="margin:-20px 0 26px">${COPY.ledgerText}</p><p class="k-empty">${EMPTY.libro}</p></section>`,
    contactRows: (cls = '', icons = false) => {
      const c = ORG.contact;
      const i = (k: 'clock' | 'pin' | 'phone') => (icons ? ic[k] : '');
      const rows = [
        c.hours ? `<div><dt>${i('clock')}Horario de atención</dt><dd>${c.hours}</dd></div>` : '',
        c.fullAddress ? `<div><dt>${i('pin')}Dirección</dt><dd>${c.fullAddress}</dd></div>` : '',
        c.phones.length
          ? `<div><dt>${i('phone')}Teléfonos</dt><dd>${c.phones
              .map((p, i) => (c.phoneHrefs[i] ? `<a href="${c.phoneHrefs[i]}">${p}</a>` : p))
              .join(' · ')}</dd></div>`
          : '',
      ].join('');
      return rows ? `<dl${cls ? ` class="${cls}"` : ''}>${rows}</dl>` : '';
    },
    contact: () => {
      if (!SHOW.contacto) return '';
      const map = mapEmbed(m);
      return `<section class="w k-sec" data-sec="contacto"><div class="k-contact${map ? '' : ' nomap'}"><div class="info"><p class="k-eb">Visítanos</p><h2 class="k-h2" style="font-size:clamp(30px,3.4vw,48px)">Información de contacto</h2>${kit.contactRows()}${mapLink(m, 'k-lnk')}</div>${map ? `<div class="map">${map}</div>` : ''}</div></section>`;
    },
    socials: () =>
      SHOW.redes
        ? `<div class="k-soc" data-sec="redes"><p>${COPY.socialsText}</p><div>${m.SOCIALS.map((x) => socialLink(x, ic[x.key])).join('')}</div></div>`
        : '',
    campEmpty: (head = hd('Campaña activa', 'Sin campaña por ahora')) =>
      `<section class="w k-sec" data-sec="campana">${head}<p class="k-empty">${EMPTY.campana}</p></section>`,
    init(app: HTMLElement, motion: Motion) {
      const bars = qsa(app, '.k-nd .bar i');
      if (typeof IntersectionObserver !== 'function') {
        bars.forEach((i) => (i.style.width = i.dataset.w + '%'));
        return;
      }
      motion.observe(
        bars,
        (en, io) => {
          if (en.isIntersecting) {
            const el = en.target as HTMLElement;
            el.style.width = el.dataset.w + '%';
            io.unobserve(el);
          }
        },
        { threshold: 0.4 },
      );
    },
  };
  return kit;
}

export type Kit = ReturnType<typeof createKit>;
