/**
 * Prerender SEO de las rutas públicas (rediseño 2026-10).
 *
 * Corre después de `vite build`. Por cada ruta pública escribe
 * `dist/<ruta>/index.html` con el título, la descripción, la URL canónica, Open
 * Graph, JSON-LD y un contenido mínimo dentro de #root (título, texto y
 * enlaces) para que buscadores y redes sociales lean la página sin ejecutar
 * JavaScript. Al cargar, React reemplaza ese contenido por la app completa.
 * También escribe `sitemap.xml` y `robots.txt`.
 *
 * Variables de entorno (ninguna es obligatoria):
 *   SITE_URL o VITE_SITE_URL   dominio público (https://…). Si falta, se arma
 *                              con VITE_APP_DOMAIN (el despliegue con Caddy).
 *                              Sin ninguno no hay URLs absolutas: se omiten
 *                              canónicas y sitemap.
 *   SEO_API_URL o VITE_API_URL API para listar animales y ciudades reales.
 *                              Si no responde, solo se generan las rutas fijas.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HOME_FAQ,
  ORGANIZATION_DESCRIPTION,
  STATIC_PAGES,
  SPECIES_PLURAL,
  adoptDescription,
  adoptTitle,
  animalDescription,
  animalTitle,
  buildAdoptPath,
  campaignDescription,
  campaignTitle,
  citySlug,
  portalDescription,
  portalTitle,
  publicAnimalPath,
  shelterLd,
} from '../src/seo/page-meta.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const guides = JSON.parse(await readFile(join(root, 'src/seo/guides.json'), 'utf8'));

const SITE_NAME = 'AdoptaFácil';
const APP_DOMAIN = (process.env.VITE_APP_DOMAIN || '').trim();
const SITE_URL = (
  process.env.SITE_URL ||
  process.env.VITE_SITE_URL ||
  (APP_DOMAIN ? `https://${APP_DOMAIN}` : '')
).replace(/\/+$/, '');
const API_URL = (process.env.SEO_API_URL || process.env.VITE_API_URL || '').replace(/\/+$/, '');
/** Idioma y país del sitio. Al abrir otro país, cada versión declara el suyo
 *  y se enlazan entre sí con hreflang (ver `alternates` en renderHtml). */
const LOCALE = process.env.SEO_LOCALE || 'es-CO';
/** El sitemap vivo de la API (fichas, portales, ciudades y campañas de hoy),
 *  con la URL PÚBLICA de la API (VITE_API_URL), no la interna del build. */
const PUBLIC_API = (process.env.VITE_API_URL || '/api').replace(/\/+$/, '');
const DYNAMIC_SITEMAP = SITE_URL
  ? `${/^https?:\/\//.test(PUBLIC_API) ? PUBLIC_API : `${SITE_URL}${PUBLIC_API}`}/public/seo/sitemap.xml`
  : '';
const OG_IMAGE = '/og-adoptafacil.jpg';
/** Canales oficiales (mismos de `src/lib/contact.ts`). */
const OFFICIAL_EMAIL = 'adoptafacil.oficial@gmail.com';
const OFFICIAL_PHONE = '+573028528926';
const MAX_PAGES = 20;

const abs = (path) => (SITE_URL ? `${SITE_URL}${path}` : path);
const esc = (text) =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const ld = (data) =>
  `<script type="application/ld+json" data-seo="ld">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

function breadcrumb(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, path], index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name,
      item: abs(path),
    })),
  };
}

/* ------------------------------------------------------------ datos API */

async function fetchAnimals() {
  if (!API_URL) return [];
  const all = [];
  try {
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const response = await fetch(`${API_URL}/public/animals?limit=50&page=${page}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      const data = Array.isArray(body?.data) ? body.data : [];
      all.push(...data);
      if (data.length < 50 || all.length >= (body?.total ?? 0)) break;
    }
  } catch (error) {
    console.warn(
      `[seo] No se pudo leer ${API_URL}/public/animals (${error.message}); solo rutas fijas.`,
    );
    return [];
  }
  return all;
}

async function fetchJson(path) {
  const response = await fetch(`${API_URL}${path}`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/** Perfil público de cada organización con animales publicados (portal). */
async function fetchOrganizations(animals) {
  if (!API_URL) return [];
  const slugs = [...new Set(animals.map((a) => a.organization?.slug).filter(Boolean))];
  const found = [];
  // De a cuatro: no saturar la API en el build.
  for (let i = 0; i < slugs.length; i += 4) {
    const batch = await Promise.all(
      slugs.slice(i, i + 4).map((slug) =>
        fetchJson(`/public/organizations/${encodeURIComponent(slug)}`)
          .then((org) => ({ ...org, slug: org.slug ?? slug }))
          .catch(() => null),
      ),
    );
    found.push(...batch.filter(Boolean));
  }
  return found;
}

/** Campañas activas (las cerradas no se prerenderizan ni van al sitemap). */
async function fetchCampaigns() {
  if (!API_URL) return [];
  const all = [];
  try {
    for (let offset = 0; offset < 1_000; offset += 50) {
      const body = await fetchJson(`/public/campaigns?limit=50&offset=${offset}`);
      const items = Array.isArray(body?.items) ? body.items : [];
      all.push(...items.filter((c) => c.status === 'active'));
      if (items.length < 50 || offset + 50 >= (body?.total ?? 0)) break;
    }
  } catch (error) {
    console.warn(`[seo] No se pudo leer ${API_URL}/public/campaigns (${error.message}).`);
  }
  return all;
}

/* -------------------------------------------------------------- rutas */

/** @typedef {{ path: string; title: string; description: string; image?: string; type?: string;
 *  jsonLd: object[]; heading: string; text: string; links: [string, string][]; lastmod?: string;
 *  faq?: { q: string; a: string }[]; preloadImage?: string;
 *  route?: string;
 *  priority: string }} Page */

/** Ciudades con animales publicados, agrupadas por su slug ("Bogotá" y
 *  "Bogota" son la misma página), de la que más tiene a la que menos. */
function cityIndex(animals) {
  const bySlug = new Map();
  for (const a of animals) {
    const city = a.organization?.city?.trim();
    const key = city ? citySlug(city) : '';
    if (!key) continue;
    if (!bySlug.has(key)) bySlug.set(key, { city, animals: [] });
    bySlug.get(key).animals.push(a);
  }
  return [...bySlug.values()].sort(
    (x, y) => y.animals.length - x.animals.length || x.city.localeCompare(y.city, 'es'),
  );
}

const sameCity = (a, city) =>
  Boolean(a.organization?.city) && citySlug(a.organization.city) === citySlug(city);
const ofSpecies = (a, species) => species === 'all' || a.species === species;

/** Fecha del animal publicado más reciente (YYYY-MM-DD) para `lastmod`. */
function lastmodOf(list) {
  const dates = list
    .map((a) => (typeof a.createdAt === 'string' ? a.createdAt.slice(0, 10) : ''))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();
  return dates.at(-1);
}

/** "A", "A y B", "A, B y C". */
function joinNames(names) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} y ${names.at(-1)}`;
}

/**
 * Página de adopción por especie y, si hay, ciudad. Su contenido sale solo de
 * datos reales (cuántos animales, qué organizaciones los publican, en qué
 * ciudades hay) para que cada ciudad sea una página útil y distinta, no una
 * plantilla repetida con otro nombre.
 */
function adoptPage(species, city, animals, cities) {
  const list = animals.filter((a) => ofSpecies(a, species) && (!city || sameCity(a, city)));
  const path = buildAdoptPath(species, city);
  const title = adoptTitle(species, city);
  const crumbs = [
    ['Inicio', '/'],
    ['Adoptar', '/adoptar'],
  ];
  if (species !== 'all') crumbs.push([SPECIES_PLURAL[species], buildAdoptPath(species)]);
  if (city) crumbs.push([city, path]);
  const items = list
    .slice(0, 24)
    .map((a) => [
      `${a.name}${a.breed ? `, ${a.breed}` : ''}${a.organization?.city ? ` (${a.organization.city})` : ''}`,
      publicAnimalPath(a.organization.slug, a),
    ]);

  const organizations = [
    ...new Map(
      list.filter((a) => a.organization?.slug).map((a) => [a.organization.slug, a.organization]),
    ).values(),
  ];
  const cityLinks = city
    ? []
    : cities
        .map((entry) => [entry.city, entry.animals.filter((a) => ofSpecies(a, species)).length])
        .filter(([, count]) => count > 0)
        .map(([name, count]) => [
          `${adoptTitle(species, name)} (${count})`,
          buildAdoptPath(species, name),
        ]);
  const related = city
    ? [
        ...organizations.map((org) => [`${org.name}, organización en ${city}`, `/o/${org.slug}`]),
        ...['all', 'dog', 'cat']
          .filter(
            (other) =>
              other !== species && animals.some((a) => ofSpecies(a, other) && sameCity(a, city)),
          )
          .map((other) => [adoptTitle(other, city), buildAdoptPath(other, city)]),
        [adoptTitle(species, null), buildAdoptPath(species)],
      ]
    : [];

  const description = adoptDescription(species, city, API_URL ? list.length : null);
  const facts = [];
  if (city && organizations.length) {
    facts.push(
      `${organizations.length === 1 ? 'Los publica' : 'Los publican'} ${joinNames(organizations.map((org) => org.name))}.`,
    );
  }
  if (!city && cityLinks.length) {
    facts.push(
      `Hay ${SPECIES_PLURAL[species].toLowerCase()} en adopción en ${cityLinks.length} ${cityLinks.length === 1 ? 'ciudad' : 'ciudades'}.`,
    );
  }

  return {
    path,
    title,
    description,
    jsonLd: [
      breadcrumb(crumbs),
      ...(items.length
        ? [
            {
              '@context': 'https://schema.org',
              '@type': 'ItemList',
              itemListElement: items.map(([name, href], index) => ({
                '@type': 'ListItem',
                position: index + 1,
                name,
                url: abs(href),
              })),
            },
          ]
        : []),
    ],
    heading: title,
    text: [description, ...facts].join(' '),
    links: [...items, ...cityLinks, ...related],
    lastmod: lastmodOf(list),
    priority: city ? '0.7' : '0.9',
  };
}

function buildPages(animals, organizations = [], campaignList = []) {
  /** @type {Page[]} */
  const pages = [];
  const home = STATIC_PAGES['/'];
  pages.push({
    path: '/',
    ...home,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: SITE_NAME,
        url: abs('/'),
        logo: abs('/icon-512.png'),
        description: ORGANIZATION_DESCRIPTION,
        email: OFFICIAL_EMAIL,
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'customer support',
          email: OFFICIAL_EMAIL,
          telephone: OFFICIAL_PHONE,
          areaServed: 'CO',
          availableLanguage: 'es',
        },
        areaServed: { '@type': 'Country', name: 'Colombia' },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: SITE_NAME,
        url: abs('/'),
        inLanguage: 'es-CO',
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: HOME_FAQ.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      },
    ],
    heading: 'Adopta un amigo. Cambia dos vidas.',
    text: home.description,
    links: [
      ['Quiero adoptar: perros y gatos en adopción', '/adoptar'],
      ['Perros en adopción', '/adoptar/perros'],
      ['Gatos en adopción', '/adoptar/gatos'],
      ['Quiero ayudar: campañas activas', '/campanas'],
      ['Lo que la red necesita hoy', '/ayudar'],
      ['Soy una organización: crear mi portal gratis', '/register'],
      ['Planes y plantillas para organizaciones', '/para-organizaciones'],
      ['Guías para adoptar', '/guias'],
      ...guides.map((g) => [g.title, `/guias/${g.slug}`]),
      ...cityIndex(animals)
        .filter((entry) => entry.animals.some((a) => a.species === 'dog'))
        .slice(0, 12)
        .map((entry) => [adoptTitle('dog', entry.city), buildAdoptPath('dog', entry.city)]),
    ],
    faq: HOME_FAQ,
    priority: '1.0',
  });

  const cities = cityIndex(animals);
  for (const species of ['all', 'dog', 'cat'])
    pages.push(adoptPage(species, null, animals, cities));
  // Una página por ciudad y especie, solo donde hay animales publicados de verdad.
  for (const { city, animals: here } of cities) {
    for (const species of ['all', 'dog', 'cat']) {
      if (here.some((a) => ofSpecies(a, species)))
        pages.push(adoptPage(species, city, animals, cities));
    }
  }

  for (const a of animals) {
    const city = a.organization?.city;
    const path = publicAnimalPath(a.organization.slug, a);
    const title = animalTitle(a, city);
    pages.push({
      path,
      title,
      description: animalDescription(a, a.organization?.name, city),
      image: a.photoUrl,
      preloadImage: a.photoUrl,
      jsonLd: [
        breadcrumb([
          ['Inicio', '/'],
          ['Adoptar', '/adoptar'],
          [SPECIES_PLURAL[a.species], buildAdoptPath(a.species)],
          [a.name, path],
        ]),
      ],
      heading: a.name,
      text: animalDescription(a, a.organization?.name, city),
      links: [
        [
          `Más ${SPECIES_PLURAL[a.species].toLowerCase()} en adopción${city ? ` en ${city}` : ''}`,
          buildAdoptPath(a.species, city),
        ],
        ...(a.organization?.name
          ? [[`Conoce a ${a.organization.name}`, `/o/${encodeURIComponent(a.organization.slug)}`]]
          : []),
      ],
      lastmod: lastmodOf([a]),
      priority: '0.6',
    });
  }

  // Portal de cada organización: AnimalShelter con ciudad (nunca la dirección).
  for (const org of organizations) {
    const path = `/o/${encodeURIComponent(org.slug)}`;
    const own = animals.filter((a) => a.organization?.slug === org.slug);
    pages.push({
      path,
      title: portalTitle(org),
      description: portalDescription(org, own.length),
      image: org.coverPhotos?.[0] ?? org.logoUrl,
      preloadImage: org.coverPhotos?.[0],
      route: 'src/features/portals/pages/org-public-page.tsx',
      jsonLd: [
        shelterLd(org, path, abs),
        breadcrumb([
          ['Inicio', '/'],
          ['Adoptar', '/adoptar'],
          [org.name, path],
        ]),
      ],
      heading: org.name,
      text: portalDescription(org, own.length),
      links: [
        ...own
          .slice(0, 24)
          .map((a) => [
            `${a.name}, ${a.species === 'cat' ? 'gato' : a.species === 'dog' ? 'perro' : 'animal'} en adopción`,
            publicAnimalPath(org.slug, a),
          ]),
        ...(org.location?.city
          ? [[adoptTitle('all', org.location.city), buildAdoptPath('all', org.location.city)]]
          : []),
      ],
      lastmod: lastmodOf(own),
      priority: '0.8',
    });
  }

  for (const c of campaignList) {
    const path = `/campanas/${c.id}`;
    pages.push({
      path,
      title: campaignTitle(c),
      description: campaignDescription(c),
      jsonLd: [
        breadcrumb([
          ['Inicio', '/'],
          ['Campañas', '/campanas'],
          [c.title, path],
        ]),
      ],
      heading: c.title,
      text: campaignDescription(c),
      links: [['Todas las campañas', '/campanas']],
      lastmod: typeof c.createdAt === 'string' ? c.createdAt.slice(0, 10) : undefined,
      priority: '0.5',
    });
  }

  const campaigns = STATIC_PAGES['/campanas'];
  pages.push({
    path: '/campanas',
    ...campaigns,
    jsonLd: [
      breadcrumb([
        ['Inicio', '/'],
        ['Campañas', '/campanas'],
      ]),
    ],
    heading: 'Campañas de recaudación',
    text: campaigns.description,
    links: campaignList.map((c) => [`${c.title} (${c.organizationName})`, `/campanas/${c.id}`]),
    priority: '0.6',
  });

  const helpMeta = STATIC_PAGES['/ayudar'];
  pages.push({
    path: '/ayudar',
    ...helpMeta,
    jsonLd: [
      breadcrumb([
        ['Inicio', '/'],
        ['Cómo ayudar', '/ayudar'],
      ]),
    ],
    heading: 'Lo que la red de rescate necesita hoy.',
    text: helpMeta.description,
    links: [
      ['Campañas activas', '/campanas'],
      ['Voluntariados', '/voluntariados'],
      ['Transparencia Nacional', '/transparencia-nacional'],
      ['Guías para adoptar', '/guias'],
    ],
    priority: '0.7',
  });

  const orgsMeta = STATIC_PAGES['/para-organizaciones'];
  pages.push({
    path: '/para-organizaciones',
    ...orgsMeta,
    jsonLd: [
      breadcrumb([
        ['Inicio', '/'],
        ['Para organizaciones', '/para-organizaciones'],
      ]),
    ],
    heading: 'Tu organización, en orden y a la vista de quienes quieren ayudar.',
    text: orgsMeta.description,
    links: [['Crear mi portal gratis', '/register']],
    priority: '0.8',
  });

  for (const [path, heading, links] of [
    [
      '/transparencia-nacional',
      'Transparencia Nacional del rescate animal',
      [
        ['Campañas activas', '/campanas'],
        ['Cómo ayudar', '/ayudar'],
      ],
    ],
    [
      '/voluntariados',
      'Voluntariados en refugios y fundaciones',
      [
        ['Cómo ayudar', '/ayudar'],
        ['Perros y gatos en adopción', '/adoptar'],
      ],
    ],
  ]) {
    const meta = STATIC_PAGES[path];
    pages.push({
      path,
      ...meta,
      jsonLd: [
        breadcrumb([
          ['Inicio', '/'],
          [meta.title, path],
        ]),
      ],
      heading,
      text: meta.description,
      links,
      priority: '0.6',
    });
  }

  const guidesMeta = STATIC_PAGES['/guias'];
  pages.push({
    path: '/guias',
    ...guidesMeta,
    jsonLd: [
      breadcrumb([
        ['Inicio', '/'],
        ['Guías', '/guias'],
      ]),
    ],
    heading: 'Todo lo que necesitas para adoptar bien.',
    text: guidesMeta.description,
    links: guides.map((g) => [g.title, `/guias/${g.slug}`]),
    priority: '0.8',
  });
  for (const g of guides) {
    const path = `/guias/${g.slug}`;
    pages.push({
      path,
      title: g.title,
      description: g.description,
      type: 'article',
      lastmod: g.updated,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: g.title,
          description: g.description,
          inLanguage: 'es-CO',
          dateModified: g.updated,
          mainEntityOfPage: abs(path),
          author: { '@type': 'Organization', name: SITE_NAME, url: abs('/') },
          publisher: { '@type': 'Organization', name: SITE_NAME, url: abs('/') },
        },
        {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: g.faq.map((item) => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: { '@type': 'Answer', text: item.a },
          })),
        },
        breadcrumb([
          ['Inicio', '/'],
          ['Guías', '/guias'],
          [g.title, path],
        ]),
      ],
      heading: g.title,
      text: `${g.intro} ${g.sections.map((s) => `${s.heading}. ${s.paragraphs.join(' ')}`).join(' ')}`,
      links: [['Ver perros en adopción', '/adoptar/perros']],
      priority: '0.8',
    });
  }
  return pages;
}

/* ------------------------------------------------------------ escritura */

/** Manifiesto de Vite (`build.manifest`): qué archivos necesita cada ruta. */
let viteManifest = {};
function routeChunks(route) {
  if (!route || !viteManifest[route]) return [];
  const files = new Set();
  const visit = (key) => {
    const entry = viteManifest[key];
    // El paquete inicial (isEntry) ya lo pide el index.html.
    if (!entry || entry.isEntry || files.has(entry.file)) return;
    files.add(entry.file);
    for (const dep of entry.imports ?? []) visit(dep);
  };
  visit(route);
  return [...files];
}

function renderHtml(template, page, { canonical }) {
  const fullTitle = `${page.title} · ${SITE_NAME}`;
  const image = page.image ?? abs(OG_IMAGE);
  const head = [
    canonical && SITE_URL ? `<link rel="canonical" href="${esc(abs(page.path))}" />` : '',
    canonical && SITE_URL ? `<meta property="og:url" content="${esc(abs(page.path))}" />` : '',
    // Hoy un solo país: hreflang que se apunta a sí mismo (LOCALE) y x-default.
    // Al abrir otro mercado, cada versión suma aquí su par (p. ej. es-MX).
    canonical && SITE_URL
      ? `<link rel="alternate" hreflang="${esc(LOCALE)}" href="${esc(abs(page.path))}" />\n    <link rel="alternate" hreflang="x-default" href="${esc(abs(page.path))}" />`
      : '',
    // La portada del portal es su LCP: pedirla desde el HTML, sin esperar a
    // que React y la API la descubran (en móvil, de ~5,6 s a ~2,5 s).
    page.preloadImage && /^https?:\/\//.test(page.preloadImage)
      ? `<link rel="preload" as="image" href="${esc(page.preloadImage)}" fetchpriority="high" />`
      : '',
    // El código de la ruta (carga diferida), pedido ya desde el HTML en paralelo
    // con el paquete principal en vez de en cadena tras él. Los datos los
    // adelanta `features/portals/api/early-fetch.ts`.
    ...routeChunks(page.route).map((file) => `<link rel="modulepreload" href="/${esc(file)}" />`),
    `<meta name="twitter:title" content="${esc(`${page.title} · ${SITE_NAME}`)}" />`,
    `<meta name="twitter:description" content="${esc(page.description)}" />`,
    `<meta name="twitter:image" content="${esc(page.image ?? abs(OG_IMAGE))}" />`,
    ...page.jsonLd.map(ld),
  ]
    .filter(Boolean)
    .join('\n    ');
  const body =
    `<main><h1>${esc(page.heading)}</h1><p>${esc(page.text)}</p>` +
    (page.links.length
      ? `<ul>${page.links.map(([label, href]) => `<li><a href="${esc(href)}">${esc(label)}</a></li>`).join('')}</ul>`
      : '') +
    (page.faq?.length
      ? `<section><h2>Preguntas frecuentes</h2>${page.faq.map((item) => `<h3>${esc(item.q)}</h3><p>${esc(item.a)}</p>`).join('')}</section>`
      : '') +
    '</main>';
  return template
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(fullTitle)}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${esc(page.description)}$2`)
    .replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/, `$1${esc(fullTitle)}$2`)
    .replace(
      /(<meta\s+property="og:description"\s+content=")[^"]*(")/,
      `$1${esc(page.description)}$2`,
    )
    .replace(/(<meta\s+property="og:type"\s+content=")[^"]*(")/, `$1${page.type ?? 'website'}$2`)
    .replace(/(<meta\s+property="og:image"\s+content=")[^"]*(")/, `$1${esc(image)}$2`)
    .replace(/<html lang="[^"]*">/, `<html lang="${esc(LOCALE)}">`)
    .replace(
      /(<meta\s+property="og:locale"\s+content=")[^"]*(")/,
      `$1${esc(LOCALE.replace('-', '_'))}$2`,
    )
    .replace('<!--seo-head-->', head)
    .replace('<!--seo-body-->', body);
}

const PRIVATE_PATHS = [
  '/inicio',
  '/perfil',
  '/organizacion',
  '/animales',
  '/adopciones',
  '/mis-',
  '/recordatorios',
  '/donaciones-recibidas',
  '/certificado',
  '/plataforma',
  // Transaccionales: checkout, comprobantes y verificaciones llevan referencias
  // y tokens en la URL; además cada página pone `noindex` (useNoIndex).
  '/donaciones',
  '/verificar',
  '/correo',
];

/**
 * `llms.txt`: resumen en texto plano para asistentes de IA (propuesta
 * llmstxt.org). Solo hechos del producto y enlaces a las páginas públicas.
 */
function llmsTxt(pages) {
  const link = (label, path, note) => `- [${label}](${abs(path)})${note ? `: ${note}` : ''}`;
  const guidesList = pages.filter((p) => p.path.startsWith('/guias/'));
  // Ciudades con perros y la página general de cada ciudad (sin repetir gatos).
  const cityPages = pages.filter((p) => /^\/adoptar\/(perros|animales)\/[^/]+$/.test(p.path));
  return [
    `# ${SITE_NAME}`,
    '',
    `> ${ORGANIZATION_DESCRIPTION}`,
    '',
    'Idioma: español (Colombia). Cobertura: toda Colombia.',
    `Contacto oficial: ${OFFICIAL_EMAIL} · WhatsApp ${OFFICIAL_PHONE}.`,
    '',
    '## Para quien quiere adoptar',
    link(
      'Perros y gatos en adopción',
      '/adoptar',
      'catálogo de todas las organizaciones, por especie y ciudad',
    ),
    link('Perros en adopción', '/adoptar/perros'),
    link('Gatos en adopción', '/adoptar/gatos'),
    ...(cityPages.length
      ? [
          '',
          '## Adopción por ciudad',
          ...cityPages.map((p) => link(p.title, p.path, p.description.split('. ')[0] + '.')),
        ]
      : []),
    ...(pages.some((p) => /^\/o\/[^/]+$/.test(p.path))
      ? [
          '',
          '## Refugios y fundaciones',
          ...pages
            .filter((p) => /^\/o\/[^/]+$/.test(p.path))
            .map((p) => link(p.heading, p.path, p.description)),
        ]
      : []),
    '',
    '## Para quien quiere ayudar',
    link('Campañas', '/campanas', STATIC_PAGES['/campanas'].description),
    link('Cómo ayudar', '/ayudar', STATIC_PAGES['/ayudar'].description),
    link('Voluntariados', '/voluntariados', STATIC_PAGES['/voluntariados'].description),
    link(
      'Transparencia Nacional',
      '/transparencia-nacional',
      STATIC_PAGES['/transparencia-nacional'].description,
    ),
    '',
    '## Para organizaciones',
    link(
      'Para organizaciones',
      '/para-organizaciones',
      STATIC_PAGES['/para-organizaciones'].description,
    ),
    link(
      'Registrar una organización',
      '/register',
      'plan base gratis para siempre; planes de pago opcionales',
    ),
    '',
    '## Guías',
    ...guidesList.map((p) => link(p.title, p.path, p.description)),
    '',
    '## Preguntas frecuentes',
    ...HOME_FAQ.flatMap((item) => [`### ${item.q}`, item.a, '']),
  ].join('\n');
}

async function main() {
  const template = await readFile(join(dist, 'index.html'), 'utf8');
  if (!template.includes('<!--seo-head-->')) {
    throw new Error('[seo] dist/index.html no tiene el marcador <!--seo-head-->.');
  }
  try {
    viteManifest = JSON.parse(await readFile(join(dist, '.vite/manifest.json'), 'utf8'));
  } catch {
    viteManifest = {};
  }
  const animals = await fetchAnimals();
  const [organizations, campaignList] = await Promise.all([
    fetchOrganizations(animals),
    fetchCampaigns(),
  ]);
  const pages = buildPages(animals, organizations, campaignList);

  // `app.html`: el cascarón del SPA para rutas privadas, 404 y páginas creadas
  // después del build. Sin canónica ni contenido: cada pantalla pone la suya.
  // Así la portada (`index.html`) sí lleva canónica y contenido propios.
  await writeFile(
    join(dist, 'app.html'),
    template.replace('<!--seo-head-->', '').replace('<!--seo-body-->', ''),
  );

  for (const page of pages) {
    if (page.path === '/') {
      await writeFile(join(dist, 'index.html'), renderHtml(template, page, { canonical: true }));
      continue;
    }
    const file = join(dist, page.path, 'index.html');
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, renderHtml(template, page, { canonical: true }));
  }

  const robots = [
    'User-agent: *',
    'Allow: /',
    ...PRIVATE_PATHS.map((path) => `Disallow: ${path}`),
    ...(SITE_URL ? ['', `Sitemap: ${SITE_URL}/sitemap.xml`, `Sitemap: ${DYNAMIC_SITEMAP}`] : []),
    '',
  ].join('\n');
  await writeFile(join(dist, 'robots.txt'), robots);
  await writeFile(join(dist, 'llms.txt'), llmsTxt(pages));
  // El manifiesto solo sirve al build: no se publica.
  await rm(join(dist, '.vite'), { recursive: true, force: true });

  if (SITE_URL) {
    const urls = pages
      .map(
        (page) =>
          `  <url><loc>${esc(abs(page.path))}</loc>${page.lastmod ? `<lastmod>${page.lastmod}</lastmod>` : ''}${/^https:\/\//.test(page.image ?? '') ? `<image:image><image:loc>${esc(page.image)}</image:loc></image:image>` : ''}</url>`,
      )
      .join('\n');
    await writeFile(
      join(dist, 'sitemap.xml'),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls}\n</urlset>\n`,
    );
  } else {
    console.warn('[seo] Sin SITE_URL: se omiten canónicas absolutas y sitemap.xml.');
  }
  console.log(
    `[seo] ${pages.length} páginas prerenderizadas (${animals.length} animales, ${organizations.length} portales, ${campaignList.length} campañas)${SITE_URL ? ' + sitemap.xml' : ''} + robots.txt + llms.txt`,
  );
}

await main();
