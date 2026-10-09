import type { Organization, OrganizationPublic } from '@adoptafacil/contracts';

/**
 * Ola 3: proyección PÚBLICA del perfil propio para la vista previa del dueño.
 * Copia solo los campos que el portal público muestra (los mismos de
 * `OrganizationPublic`) y deja fuera los privados (teléfono, razón social).
 * Devuelve `null` si el enlace no es el de esta organización.
 */
export function ownerPreviewOrganization(
  org: Organization | null | undefined,
  slug: string,
): OrganizationPublic | null {
  if (!org?.slug || org.slug.toLowerCase() !== slug.toLowerCase()) return null;
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    subdomain: org.subdomain,
    description: org.description,
    logoUrl: org.logoUrl,
    coverPhotos: org.coverPhotos,
    location: org.location,
    socialLinks: org.socialLinks,
    whatsapp: org.whatsapp,
    contactEmail: org.contactEmail,
    aboutUs: org.aboutUs,
    extendedContact: org.extendedContact,
    organizationType: org.organizationType,
  };
}
