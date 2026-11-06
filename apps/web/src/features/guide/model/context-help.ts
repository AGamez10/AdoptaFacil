import { officialMailtoUrl } from '../../../lib/contact';
import { orgMailtoUrl, orgWhatsappUrl } from '../../portals/model/org-contact';
import {
  ANIMAL_VIEW_ROLES,
  CAMPAIGNS_VIEW_ROLES,
  ORG_MEMBER_ROLES,
} from '../../../shell/navigation/nav-items';
import type { GuideContext, GuideOrganization } from './guide-context';
import type { PageHelp } from './guide-content';

/** Módulos que cambian lo que se puede hacer desde un portal. */
export interface PortalModules {
  payments: boolean;
  sponsorships: boolean;
}

/**
 * Ayuda dentro del portal público de una organización. Habla de ESA
 * organización y de lo que se hace en su portal, no del resto de AdoptaFácil:
 * quien está aquí vino por ella.
 */
export function portalHelp(
  context: Extract<GuideContext, { kind: 'portal' }>,
  modules: PortalModules,
): PageHelp {
  const org = context.organization.name;
  const preview = context.ownerPreview
    ? [
        'Vista previa privada: solo tu equipo ve esta página hasta que AdoptaFácil apruebe tu organización.',
      ]
    : [];
  const related = context.ownerPreview
    ? [
        { to: '/organizacion', label: 'Editar datos, WhatsApp y redes', roles: ORG_MEMBER_ROLES },
        {
          to: '/organizacion/portal',
          label: 'Cambiar plantilla y colores',
          roles: ORG_MEMBER_ROLES,
        },
      ]
    : undefined;

  if (context.animalName) {
    const animal = context.animalName;
    return {
      match: /.*/,
      title: `Ficha de ${animal}`,
      tips: [
        ...preview,
        `Pulsa "Solicitar adopción" para postularte: ${org} revisa tu solicitud y te contacta.`,
        'Necesitas una cuenta de persona (gratis). Luego sigues el estado en "Mis solicitudes".',
        ...(modules.sponsorships
          ? [`Si no puedes adoptar, "Apadrinar" (cuando aparece) ayuda a cubrir sus cuidados.`]
          : []),
      ],
      related,
    };
  }

  return {
    match: /.*/,
    title: `Estás en el portal de ${org}`,
    tips: [
      ...preview,
      `Para adoptar, abre la ficha de un animal en "Animales" y pulsa "Solicitar adopción". La solicitud le llega a ${org}.`,
      ...(modules.payments
        ? [`Para donar a ${org}, usa su botón "Donar"; no necesitas cuenta.`]
        : []),
      ...(modules.sponsorships
        ? ['Para apadrinar, abre la ficha del animal y pulsa "Apadrinar".']
        : []),
      `Si ves sellos en el inicio, son documentos de ${org} que el equipo de AdoptaFácil ya revisó.`,
    ],
    related,
  };
}

/** Ayuda en la vista de ejemplo de una plantilla (`/plantillas/:id`). */
export function templateDemoHelp(templateName: string): PageHelp {
  return {
    match: /.*/,
    title: `Plantilla ${templateName}: así se vería tu portal`,
    tips: [
      'Todo lo que ves son datos de ejemplo. En tu portal aparecen tus animales, campañas y datos reales.',
      'Dónde se carga cada cosa en tu panel: "Mi organización" (nombre, ciudad, descripción, WhatsApp y redes), "Animales" (fichas y fotos), "Campañas" y "Personalización" (plantilla, colores, logo y portada).',
      'En tu portal este botón de ayuda es discreto y su WhatsApp lleva al número de tu organización, no al de AdoptaFácil.',
      'Para usarla, pulsa "Usar esta plantilla" arriba. Si ya tienes cuenta, la cambias en "Personalización" cuando quieras.',
    ],
    related: [
      { to: '/organizacion', label: 'Mi organización', roles: ORG_MEMBER_ROLES },
      { to: '/animales', label: 'Animales', roles: ANIMAL_VIEW_ROLES },
      { to: '/organizacion/campanas', label: 'Campañas', roles: CAMPAIGNS_VIEW_ROLES },
      { to: '/organizacion/portal', label: 'Personalización', roles: ORG_MEMBER_ROLES },
    ],
  };
}

export interface ContactLinks {
  whatsapp: string | null;
  email: string | null;
}

/**
 * Contacto de la organización del portal, con el mensaje ya escrito (la
 * persona lo edita antes de enviar). Solo se arma con datos válidos.
 */
export function organizationContact(
  organization: GuideOrganization,
  animalName?: string,
): ContactLinks {
  const message = animalName
    ? `Hola, ${organization.name}. Vi a ${animalName} en su portal de AdoptaFácil y quiero saber más.`
    : `Hola, ${organization.name}. Vi su portal en AdoptaFácil y tengo una pregunta.`;
  const mail = orgMailtoUrl(organization.contactEmail);
  const subject = animalName ? `Pregunta sobre ${animalName}` : 'Pregunta desde su portal';
  return {
    whatsapp: orgWhatsappUrl(organization.whatsapp, message),
    email: mail ? `${mail}?subject=${encodeURIComponent(subject)}` : null,
  };
}

/** Para reportar una falla de la página (no para dudas sobre la organización). */
export function reportProblemUrl(organizationName: string): string {
  return officialMailtoUrl(`Problema en el portal de ${organizationName}`);
}
