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
 *   SITE_URL o VITE_SITE_URL   dominio público (https://…). Sin él no hay
 *                              URLs absolutas: se omiten canónicas y sitemap.
 *   SEO_API_URL o VITE_API_URL API para listar animales y ciudades reales.
 *                              Si no responde, solo se generan las rutas fijas.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
  publicAnimalPath,
} from '../src/seo/page-meta.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const guides = JSON.parse(await readFile(join(root, 'src/seo/guides.json'), 'utf8'));

const SITE_NAME = 'AdoptaFácil';
const SITE_URL = (process.env.SITE_URL || process.env.VITE_SITE_URL || '').replace(/\/+$/, '');
const API_URL = (process.env.SEO_API_URL || process.env.VITE_API_URL || '').replace(/\/+$/, '');
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

/* -------------------------------------------------------------- rutas */

/** @typedef {{ path: string; title: string; description: string; image?: string; type?: string;
 *  jsonLd: object[]; heading: string; text: string; links: [string, string][]; lastmod?: string;
 *  faq?: { q: string; a: string }[];
 *  priority: string }} Page */

function adoptPage(species, city, animals) {
  const list = animals.filter(
    (a) => (species === 'all' || a.species === species) && (!city || a.organization?.city === city),
  );
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
  return {
    path,
    title,
    description: adoptDescription(species, city, API_URL ? list.length : null),
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
    text: adoptDescription(species, city, API_URL ? list.length : null),
    links: items,
    priority: city ? '0.7' : '0.9',
  };
}

function buildPages(animals) {
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
      ['Soy una organización: crear mi portal gratis', '/register'],
      ['Guías para adoptar', '/guias'],
      ...guides.map((g) => [g.title, `/guias/${g.slug}`]),
    ],
    faq: HOME_FAQ,
    priority: '1.0',
  });

  for (const species of ['all', 'dog', 'cat']) pages.push(adoptPage(species, null, animals));
  const cities = [...new Set(animals.map((a) => a.organization?.city).filter(Boolean))];
  for (const city of cities) {
    for (const species of ['all', 'dog', 'cat']) {
      const has = animals.some(
        (a) => a.organization?.city === city && (species === 'all' || a.species === species),
      );
      if (has) pages.push(adoptPage(species, city, animals));
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
          `Más ${SPECIES_PLURAL[a.species].toLowerCase()} en adopción`,
          buildAdoptPath(a.species, city),
        ],
      ],
      priority: '0.6',
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
    links: [],
    priority: '0.6',
  });

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

function renderHtml(template, page, { canonical }) {
  const fullTitle = `${page.title} · ${SITE_NAME}`;
  const image = page.image ?? abs(OG_IMAGE);
  const head = [
    canonical && SITE_URL ? `<link rel="canonical" href="${esc(abs(page.path))}" />` : '',
    canonical && SITE_URL ? `<meta property="og:url" content="${esc(abs(page.path))}" />` : '',
    // Un solo idioma: hreflang que se apunta a sí mismo (es-CO) y x-default.
    canonical && SITE_URL
      ? `<link rel="alternate" hreflang="es-CO" href="${esc(abs(page.path))}" />\n    <link rel="alternate" hreflang="x-default" href="${esc(abs(page.path))}" />`
      : '',
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
    '',
    '## Para quien quiere ayudar',
    link('Campañas', '/campanas', STATIC_PAGES['/campanas'].description),
    '',
    '## Para organizaciones',
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
  const animals = await fetchAnimals();
  const pages = buildPages(animals);

  for (const page of pages) {
    if (page.path === '/') {
      // index.html también responde las rutas privadas (rewrite del SPA): sin canónica.
      await writeFile(join(dist, 'index.html'), renderHtml(template, page, { canonical: false }));
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
    ...(SITE_URL ? ['', `Sitemap: ${SITE_URL}/sitemap.xml`] : []),
    '',
  ].join('\n');
  await writeFile(join(dist, 'robots.txt'), robots);
  await writeFile(join(dist, 'llms.txt'), llmsTxt(pages));

  if (SITE_URL) {
    const urls = pages
      .map(
        (page) =>
          `  <url><loc>${esc(abs(page.path))}</loc>${page.lastmod ? `<lastmod>${page.lastmod}</lastmod>` : ''}<priority>${page.priority}</priority></url>`,
      )
      .join('\n');
    await writeFile(
      join(dist, 'sitemap.xml'),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    );
  } else {
    console.warn('[seo] Sin SITE_URL: se omiten canónicas absolutas y sitemap.xml.');
  }
  console.log(
    `[seo] ${pages.length} páginas prerenderizadas (${animals.length} animales)${SITE_URL ? ' + sitemap.xml' : ''} + robots.txt + llms.txt`,
  );
}

await main();
