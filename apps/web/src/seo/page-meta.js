// @ts-check
/**
 * Textos SEO compartidos entre la app (React) y el prerender de build
 * (`scripts/prerender-seo.mjs`). JavaScript plano a propósito: Node lo importa
 * sin compilar y TypeScript lo tipa con `page-meta.d.ts`.
 */

/** @type {Record<'dog' | 'cat' | 'other', 'perros' | 'gatos' | 'otros'>} */
export const SPECIES_SLUGS = { dog: 'perros', cat: 'gatos', other: 'otros' };

/**
 * "Bogotá D.C." → "bogota-d-c"; sin tildes ni signos, solo minúsculas y guiones.
 * @param {string} city
 */
export function citySlug(city) {
  return city
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * URL limpia del listado: /adoptar, /adoptar/perros, /adoptar/animales/medellin.
 * @param {'dog' | 'cat' | 'other' | 'all'} species
 * @param {string | null | undefined} [city]
 */
export function buildAdoptPath(species, city) {
  const speciesPart = species === 'all' ? 'animales' : SPECIES_SLUGS[species];
  if (city) return `/adoptar/${speciesPart}/${citySlug(city)}`;
  if (species === 'all') return '/adoptar';
  return `/adoptar/${speciesPart}`;
}

/** Código público de un animal: 8 caracteres de Crockford base32 (lo genera la base). */
export const PUBLIC_CODE_PATTERN = /^[0-9a-hjkmnp-tv-z]{8}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Último tramo de la URL pública de un animal: "luna-k7m2qp8x" (nombre + código
 * público). Sin código (proyecciones viejas) cae al id, que la API sigue
 * resolviendo y la ficha redirige a la URL nueva.
 * @param {{ id: string; name: string; publicCode?: string }} animal
 */
export function animalUrlSegment(animal) {
  if (!animal.publicCode) return animal.id;
  const name = citySlug(animal.name).slice(0, 60).replace(/-+$/, '');
  return name ? `${name}-${animal.publicCode}` : animal.publicCode;
}

/**
 * URL pública de la ficha: /o/<org>/animales/<nombre>-<código>. Nunca expone el
 * id interno cuando el animal ya tiene código público.
 * @param {string} orgSlug
 * @param {{ id: string; name: string; publicCode?: string }} animal
 */
export function publicAnimalPath(orgSlug, animal) {
  return `/o/${encodeURIComponent(orgSlug)}/animales/${encodeURIComponent(animalUrlSegment(animal))}`;
}

/**
 * Lee el tramo de la URL de una ficha. Acepta la forma nueva ("luna-k7m2qp8x":
 * vale el código del final, el nombre es decorativo) y la vieja (UUID, que
 * `legacy` marca para redirigir). Cualquier otra cosa → null (no encontrado),
 * sin llamar a la API.
 * @param {string | undefined} segment
 * @returns {{ ref: string; legacy: boolean } | null}
 */
export function parseAnimalUrlSegment(segment) {
  const value = (segment ?? '').trim().toLowerCase();
  if (UUID_PATTERN.test(value)) return { ref: value, legacy: true };
  const code = value.slice(value.lastIndexOf('-') + 1);
  return PUBLIC_CODE_PATTERN.test(code) ? { ref: code, legacy: false } : null;
}

/** @type {Record<'dog' | 'cat' | 'other' | 'all', string>} */
export const SPECIES_PLURAL = {
  dog: 'Perros',
  cat: 'Gatos',
  other: 'Otros animales',
  all: 'Perros y gatos',
};

/** @type {Record<'dog' | 'cat' | 'other', string>} */
export const SPECIES_SINGULAR = { dog: 'perro', cat: 'gato', other: 'animal' };

/**
 * @param {'dog' | 'cat' | 'other' | 'all'} species
 * @param {string | null | undefined} city
 */
export function adoptTitle(species, city) {
  const base = `${SPECIES_PLURAL[species]} en adopción`;
  return city ? `${base} en ${city}` : `${base} en Colombia`;
}

/**
 * @param {'dog' | 'cat' | 'other' | 'all'} species
 * @param {string | null | undefined} city
 * @param {number | null | undefined} count
 */
export function adoptDescription(species, city, count) {
  const who = species === 'all' ? 'perros y gatos' : SPECIES_PLURAL[species].toLowerCase();
  const where = city ? `en ${city}` : 'en toda Colombia';
  const noun =
    species === 'all'
      ? count === 1
        ? 'animal espera'
        : 'animales esperan'
      : count === 1
        ? `${SPECIES_SINGULAR[species]} espera`
        : `${SPECIES_PLURAL[species].toLowerCase()} esperan`;
  const lead =
    typeof count === 'number' && count > 0
      ? `${count} ${noun} hogar ${where}.`
      : `Encuentra ${who} en adopción ${where}.`;
  return `${lead} Filtra por tamaño, edad y sexo, conoce la organización que los cuida y solicita la adopción en línea, gratis.`;
}

/**
 * @param {{ name: string; species: 'dog' | 'cat' | 'other'; breed?: string }} animal
 * @param {string | null | undefined} city
 */
export function animalTitle(animal, city) {
  return `${animal.name}, ${SPECIES_SINGULAR[animal.species]} en adopción${city ? ` en ${city}` : ''}`;
}

/**
 * @param {{ name: string; species: 'dog' | 'cat' | 'other'; breed?: string }} animal
 * @param {string | null | undefined} orgName
 * @param {string | null | undefined} city
 */
export function animalDescription(animal, orgName, city) {
  const breed = animal.breed ? ` ${animal.breed}` : '';
  const who = orgName ? ` Lo cuida ${orgName}` : '';
  const where = city ? ` en ${city}` : '';
  return `Conoce a ${animal.name}, ${SPECIES_SINGULAR[animal.species]}${breed} que busca hogar.${who}${where}${who || where ? '.' : ''} Solicita su adopción en línea con AdoptaFácil.`;
}

/** Recorta un texto libre a `max` caracteres sin partir palabras. */
function clip(text, max) {
  const clean = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:]+$/, '')}…`;
}

/**
 * Portal de una organización: "Fundación X: perros y gatos en adopción en Cali".
 * @param {{ name: string; location?: { city?: string } }} org
 */
export function portalTitle(org) {
  const city = org.location?.city?.trim();
  return `${org.name}: perros y gatos en adopción${city ? ` en ${city}` : ''}`;
}

/**
 * Descripción del portal: la que escribió la organización (recortada a lo que
 * muestra Google) o, si es muy corta, una frase con sus datos reales.
 * @param {{ name: string; description?: string; location?: { city?: string } }} org
 * @param {number | null | undefined} [animals]
 */
export function portalDescription(org, animals) {
  const own = clip(org.description, 155);
  if (own.length >= 60) return own;
  const city = org.location?.city?.trim();
  const count =
    typeof animals === 'number' && animals > 0
      ? `${animals} ${animals === 1 ? 'animal espera' : 'animales esperan'} hogar`
      : 'Conoce a sus perros y gatos en adopción';
  return `${count} con ${org.name}${city ? ` en ${city}` : ''}. Solicita la adopción en línea, apoya sus campañas y mira en qué usa cada donación.`;
}

/**
 * Datos estructurados del portal: `AnimalShelter` (schema.org, subtipo de
 * `LocalBusiness`). Solo ciudad y departamento, nunca la dirección exacta:
 * muchos rescatistas trabajan desde su casa. `abs` vuelve absoluta una ruta.
 * @param {{ name: string; slug?: string; description?: string; logoUrl?: string;
 *   coverPhotos?: string[]; location?: { city?: string; department?: string; country?: string };
 *   socialLinks?: object }} org
 * @param {string} path
 * @param {(path: string) => string} abs
 */
export function shelterLd(org, path, abs) {
  const city = org.location?.city?.trim();
  const region = org.location?.department?.trim();
  const sameAs = Object.values(org.socialLinks ?? {}).filter(
    (url) => typeof url === 'string' && /^https:\/\//.test(url),
  );
  const image = [org.logoUrl, ...(org.coverPhotos ?? [])].filter(
    (url) => typeof url === 'string' && /^https?:\/\//.test(url),
  );
  return {
    '@context': 'https://schema.org',
    '@type': 'AnimalShelter',
    '@id': `${abs(path)}#organizacion`,
    name: org.name,
    url: abs(path),
    ...(org.description ? { description: clip(org.description, 300) } : {}),
    ...(org.logoUrl && /^https?:\/\//.test(org.logoUrl) ? { logo: org.logoUrl } : {}),
    ...(image.length ? { image } : {}),
    ...(city || region
      ? {
          address: {
            '@type': 'PostalAddress',
            ...(city ? { addressLocality: city } : {}),
            ...(region ? { addressRegion: region } : {}),
            addressCountry: 'CO',
          },
        }
      : {}),
    areaServed: city ? { '@type': 'City', name: city } : { '@type': 'Country', name: 'Colombia' },
    ...(sameAs.length ? { sameAs } : {}),
  };
}

/**
 * Campaña: título para buscadores.
 * @param {{ title: string; organizationName: string }} campaign
 */
export function campaignTitle(campaign) {
  return `${campaign.title} · Campaña de ${campaign.organizationName}`;
}

/**
 * @param {{ title: string; description?: string; organizationName: string; goalAmount: number; raisedAmount: number }} campaign
 */
export function campaignDescription(campaign) {
  const own = clip(campaign.description, 120);
  /** @param {number} n */
  const cop = (n) => `$${Math.round(n).toLocaleString('es-CO')}`;
  const progress = `Meta ${cop(campaign.goalAmount)}, van ${cop(campaign.raisedAmount)}.`;
  return own.length >= 40
    ? `${own} ${progress}`
    : `${campaign.organizationName} recauda para «${campaign.title}». ${progress} Mira el avance y en qué se usa cada aporte.`;
}

/** Páginas públicas fijas. @type {Record<string, { title: string; description: string }>} */
export const STATIC_PAGES = {
  '/': {
    title: 'Adopción de perros y gatos en Colombia',
    description:
      'Adopta perros y gatos de refugios y fundaciones de toda Colombia, dona con desglose claro o suma gratis tu organización. Solicitud en línea y contrato firmado.',
  },
  '/campanas': {
    title: 'Campañas de recaudación para animales rescatados',
    description:
      'Apoya cirugías, alimento y esterilizaciones de organizaciones de rescate animal en Colombia. Cada campaña muestra su meta, su avance y en qué se gastó.',
  },
  '/ayudar': {
    title: 'Cómo ayudar a perros y gatos rescatados en Colombia',
    description:
      'Campañas con meta y evidencia, insumos que piden los refugios, voluntariados y las cuentas abiertas de cada organización de rescate animal en Colombia.',
  },
  '/para-organizaciones': {
    title: 'Plataforma gratis para refugios y fundaciones de animales',
    description:
      'Portal propio, animales con expediente, adopciones con contrato y donaciones con desglose para refugios, fundaciones y rescatistas de Colombia. Gratis para siempre; planes opcionales.',
  },
  '/transparencia-nacional': {
    title: 'Transparencia Nacional del rescate animal en Colombia',
    description:
      'Cuánto se recibe y en qué se usa en el rescate animal de Colombia: la suma de los libros públicos de todas las organizaciones aprobadas en AdoptaFácil, sin datos de donantes.',
  },
  '/voluntariados': {
    title: 'Voluntariado con animales rescatados en Colombia',
    description:
      'Encuentra voluntariados en refugios y fundaciones de rescate animal de Colombia: paseos, cuidado, eventos de adopción y apoyo profesional. Postúlate en línea.',
  },
  '/guias': {
    title: 'Guías para adoptar y cuidar a tu perro',
    description:
      'Guías claras para adoptar un perro en Colombia y cuidarlo después: pasos, requisitos, primeros días, cachorros y perros adultos.',
  },
};

/**
 * Preguntas frecuentes de la portada. Se muestran en la landing y viajan como
 * JSON-LD `FAQPage` (en el navegador y en el HTML prerenderizado), así
 * buscadores y asistentes de IA pueden citarlas. Cada respuesta describe lo
 * que el producto hace hoy: sin cifras ni promesas que no estén en el código.
 * @type {{ q: string; a: string }[]}
 */
export const HOME_FAQ = [
  {
    q: '¿Qué es AdoptaFácil?',
    a: 'AdoptaFácil es una plataforma colombiana que reúne a refugios, fundaciones y rescatistas de todo el país. En un solo lugar puedes conocer perros y gatos en adopción, enviar tu solicitud en línea, firmar el contrato de adopción y apoyar a las organizaciones con donaciones y campañas.',
  },
  {
    q: '¿Cómo adopto un perro o un gato en AdoptaFácil?',
    a: 'En cuatro pasos: explora los animales por especie y ciudad, envía tu solicitud a la organización, firma en línea el contrato de adopción si te aprueban y recibe el acompañamiento de la organización después de la adopción. Cada organización decide con quién se va cada animal.',
  },
  {
    q: '¿Cómo sé a dónde va mi donación?',
    a: 'Pagas en Mercado Pago y el dinero va directo a la cuenta de la organización: AdoptaFácil no cobra comisión por tu donación. Al terminar recibes tu comprobante. Las campañas muestran su meta, su avance y en qué se usó la ayuda.',
  },
  {
    q: '¿Cuánto le cuesta a una organización usar AdoptaFácil?',
    a: 'El plan base es gratis para siempre e incluye tu portal público, animales ilimitados con ficha clínica y adopciones con contrato y seguimiento. Los planes de pago son opcionales: suman marca, alcance y comodidad.',
  },
  {
    q: '¿Puedo registrar mi organización si aún no tengo RUT ni cámara de comercio?',
    a: 'Sí. Puedes registrarte igual y te explicamos el paso a paso para formalizarte. Nuestro equipo revisa los documentos que subas y te dice qué falta.',
  },
  {
    q: '¿Cómo cuidan mis datos?',
    a: 'El expediente clínico, los documentos legales y los datos de quien adopta nunca aparecen en páginas públicas, y la información de cada organización está separada de las demás desde la base de datos.',
  },
  {
    q: '¿En qué ciudades funciona?',
    a: 'En toda Colombia. Cualquier refugio, fundación o rescatista del país puede publicar sus animales, y quien quiere adoptar puede buscar por ciudad.',
  },
];

/** Descripción de la organización para JSON-LD y `llms.txt` (la misma en todos lados). */
export const ORGANIZATION_DESCRIPTION =
  'Plataforma colombiana para la adopción responsable de perros y gatos: reúne a refugios, fundaciones y rescatistas de todo el país con adopciones con contrato firmado en línea, donaciones con desglose transparente y campañas con evidencia.';
