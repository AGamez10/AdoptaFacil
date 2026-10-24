import {
  ServiceCategory,
  ServiceListingStatus,
  type PetSex,
  type PetSpecies,
} from '@adoptafacil/contracts';

/** Etiquetas del directorio de servicios (Comunidad, primer corte). */
export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  [ServiceCategory.Veterinary]: 'Veterinarias',
  [ServiceCategory.Grooming]: 'Peluquerías',
  [ServiceCategory.Walking]: 'Paseadores',
  [ServiceCategory.PetShop]: 'Tiendas',
};

/** Singular, para la ficha y el formulario. */
export const SERVICE_CATEGORY_SINGULAR: Record<ServiceCategory, string> = {
  [ServiceCategory.Veterinary]: 'Veterinaria',
  [ServiceCategory.Grooming]: 'Peluquería',
  [ServiceCategory.Walking]: 'Paseador',
  [ServiceCategory.PetShop]: 'Tienda',
};

export const SERVICE_STATUS_LABELS: Record<ServiceListingStatus, string> = {
  [ServiceListingStatus.Pending]: 'En revisión',
  [ServiceListingStatus.Approved]: 'Publicado',
  [ServiceListingStatus.Rejected]: 'No aprobado',
  [ServiceListingStatus.Hidden]: 'Retirado',
};

export const PET_SPECIES_LABELS: Record<PetSpecies, string> = {
  dog: 'Perro',
  cat: 'Gato',
  other: 'Otro',
};

export const PET_SEX_LABELS: Record<PetSex, string> = {
  male: 'Macho',
  female: 'Hembra',
  unknown: 'Sin definir',
};

/** Enlace de WhatsApp. Un celular colombiano de 10 dígitos (3xx) recibe el
 *  indicativo 57; cualquier otro número se usa tal cual (solo dígitos). */
export function whatsappHref(raw: string | undefined): string | undefined {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length < 7) return undefined;
  const full = digits.length === 10 && digits.startsWith('3') ? `57${digits}` : digits;
  return `https://wa.me/${full}`;
}

/** Solo enlaces http(s): nunca `javascript:` ni otros esquemas. */
export function safeWebsiteHref(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** "4,5 ★ · 12 reseñas" o "Sin reseñas aún". */
export function ratingLabel(average: number | undefined, count: number): string {
  if (!count || average === undefined) return 'Sin reseñas aún';
  const avg = average.toLocaleString('es-CO', { maximumFractionDigits: 1 });
  return `${avg} ★ · ${count} ${count === 1 ? 'reseña' : 'reseñas'}`;
}

/** Edad aproximada a partir de `YYYY-MM-DD`, para la ficha de mascota. */
export function petAgeLabel(birthDate: string | undefined, now = new Date()): string | undefined {
  if (!birthDate) return undefined;
  const born = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(born.getTime())) return undefined;
  let months =
    (now.getUTCFullYear() - born.getUTCFullYear()) * 12 + (now.getUTCMonth() - born.getUTCMonth());
  if (now.getUTCDate() < born.getUTCDate()) months -= 1;
  if (months < 0) return undefined;
  if (months < 12) return `${months} ${months === 1 ? 'mes' : 'meses'}`;
  const years = Math.floor(months / 12);
  return `${years} ${years === 1 ? 'año' : 'años'}`;
}

/** Iniciales para el avatar de un perfil sin foto. */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
