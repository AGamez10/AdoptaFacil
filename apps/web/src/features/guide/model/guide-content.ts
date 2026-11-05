import { Role } from '@adoptafacil/contracts';
import {
  ADOPTIONS_MANAGEMENT_ROLES,
  ANIMAL_VIEW_ROLES,
  ORG_MEMBER_ROLES,
  ORG_SIGNERS_ROLES,
} from '../../../shell/navigation/nav-items';

/**
 * Contenido del asistente de guía (Ola 3, R3-8; decisión D14). Es TEXTO FIJO:
 * no hay modelo de lenguaje, ni red, ni llaves en el cliente, y nunca se leen
 * los valores de los formularios. La única entrada es la ruta actual, la sesión
 * (tipo de cuenta y roles) y los módulos encendidos; con eso se elige qué
 * mostrar. Cambiar el texto es editar este archivo.
 */

/** Quién está mirando, a grandes rasgos. */
export type GuideAudience = 'visitor' | 'person' | 'org' | 'platform';

export interface GuideStep {
  text: string;
  /** Enlace opcional al lugar donde se hace el paso. */
  to?: string;
  linkLabel?: string;
}

export interface GuideFlow {
  id: string;
  title: string;
  summary: string;
  audiences: readonly GuideAudience[];
  /** Si se indica, además hay que tener alguno de estos roles. */
  roles?: readonly Role[];
  steps: readonly GuideStep[];
}

/** Un consejo: texto solo, o texto con enlace al lugar donde se hace. */
export type GuideTip = string | GuideStep;

/** Enlace "Dónde se gestiona"; se oculta si la cuenta no tiene el rol o el módulo está apagado. */
export interface GuideLink {
  to: string;
  label: string;
  roles?: readonly Role[];
}

export interface PageHelp {
  /** Se prueba contra `location.pathname`; gana la primera que coincide. */
  match: RegExp;
  /** Si se indica, la ayuda solo aplica a estas audiencias (si no, sigue buscando). */
  audiences?: readonly GuideAudience[];
  title: string;
  tips: readonly GuideTip[];
  /** Accesos a los lugares relacionados: "esto se gestiona en…". */
  related?: readonly GuideLink[];
}

/** Roles de `POST /animals` (WRITE_ROLES en animals.controller.ts). */
const ANIMAL_WRITE_ROLES = [Role.Owner, Role.Administrator, Role.Operator, Role.Veterinarian];
/** Roles de `/org/documents` (ORG_DOCUMENTS_ROLES en nav-items.ts). */
const ORG_DOCUMENT_ROLES = [Role.Owner, Role.Administrator];
const PLATFORM_ROLES = [Role.PlatformAdmin, Role.PlatformSuperAdmin];

export const GUIDE_FLOWS: readonly GuideFlow[] = [
  {
    id: 'adoptar',
    title: 'Quiero adoptar',
    summary: 'De conocer a un animal a firmar el contrato.',
    audiences: ['visitor', 'person'],
    steps: [
      {
        text: 'Mira los animales disponibles: filtra por especie o busca por nombre, raza o ciudad.',
        to: '/adoptar',
        linkLabel: 'Ver animales',
      },
      {
        text: 'Abre la ficha del que te interese: verás su historia, su salud y quién lo cuida.',
      },
      {
        text: 'Crea tu cuenta de persona (es gratis) para poder enviar la solicitud.',
        to: '/register',
        linkLabel: 'Crear cuenta',
      },
      {
        text: 'Envía la solicitud desde la ficha del animal. La organización la revisa y te contacta.',
      },
      {
        text: 'Si te aprueban, ambas partes firman el contrato de adopción en línea.',
      },
      {
        text: 'Sigue tus solicitudes en "Mis solicitudes" y responde los seguimientos después de la adopción.',
        to: '/mis-solicitudes',
        linkLabel: 'Mis solicitudes',
      },
    ],
  },
  {
    id: 'registrar-organizacion',
    title: 'Registrar mi organización',
    summary: 'Gratis. Puedes empezar aunque todavía no tengas papeles.',
    audiences: ['visitor'],
    steps: [
      {
        text: 'Elige "Organización" y llena el formulario con el nombre y tus datos de acceso.',
        to: '/register',
        linkLabel: 'Ir al registro',
      },
      {
        text: 'Completa el perfil: ciudad, descripción, logo y una foto de portada.',
      },
      {
        text: 'Sube tus documentos (RUT, cámara de comercio). Si no los tienes, la plataforma te explica cómo sacarlos.',
      },
      {
        text: 'El equipo de AdoptaFácil revisa los documentos. Cada uno aprobado aparece como sello en tu portal.',
      },
      { text: 'Publica tus animales y comparte el enlace de tu portal.' },
    ],
  },
  {
    id: 'publicar-animal',
    title: 'Publicar un animal',
    summary: 'Una ficha clara ayuda a que encuentre hogar más rápido.',
    audiences: ['org'],
    roles: ANIMAL_WRITE_ROLES,
    steps: [
      {
        text: 'Entra a "Animales" y pulsa "Registrar animal".',
        to: '/animales',
        linkLabel: 'Animales',
      },
      {
        text: 'Escribe nombre, especie, edad aproximada, tamaño y una historia corta y honesta.',
      },
      {
        text: 'Sube varias fotos con buena luz: la primera es la que se ve en el catálogo.',
      },
      {
        text: 'Registra vacunas y esterilización en el expediente clínico: dan confianza a quien adopta.',
      },
      {
        text: 'Los animales disponibles para adopción aparecen en tu portal y en el catálogo general.',
      },
    ],
  },
  {
    id: 'subir-documentos',
    title: 'Subir los documentos de la organización',
    summary: 'Qué subir, cómo conseguirlo y qué se desbloquea.',
    audiences: ['org'],
    roles: ORG_DOCUMENT_ROLES,
    steps: [
      {
        text: 'Entra a "Documentos": verás cada documento con su estado.',
        to: '/organizacion/documentos',
        linkLabel: 'Documentos',
      },
      {
        text: 'Sube el RUT y el certificado de existencia y representación en PDF o foto legible.',
      },
      {
        text: 'Si te falta alguno, pulsa "No lo tengo todavía": verás los pasos y puedes escribirnos.',
      },
      {
        text: 'Si el equipo observa un documento, verás el motivo; corrígelo y súbelo de nuevo.',
      },
    ],
  },
  {
    id: 'revisar-documentos',
    title: 'Revisar documentos de organizaciones',
    summary: 'El flujo del equipo de plataforma.',
    audiences: ['platform'],
    roles: PLATFORM_ROLES,
    steps: [
      {
        text: 'Abre la cola de revisión: los expedientes que más han esperado salen primero.',
        to: '/plataforma/documentos',
        linkLabel: 'Revisión de documentos',
      },
      {
        text: 'Reserva el expediente para que nadie más del equipo lo trabaje al mismo tiempo.',
      },
      {
        text: 'Abre cada documento con "Ver documento" y compáralo con los datos de la organización.',
      },
      {
        text: 'Aprueba, o explica en el motivo qué debe corregir antes de observar o rechazar.',
      },
      { text: 'Libera la reserva al terminar (si no, vence sola a los 30 minutos).' },
    ],
  },
];

/* Enlaces "Dónde se gestiona" reutilizados por varias páginas. */
const ORG_PROFILE_LINK: GuideLink = {
  to: '/organizacion',
  label: 'Mi organización: datos, WhatsApp y redes',
  roles: ORG_MEMBER_ROLES,
};
const FORMALIZATION_LINK: GuideLink = {
  to: '/organizacion/formalizacion',
  label: 'Formalización: estado de tu ESAL',
  roles: ORG_MEMBER_ROLES,
};
const DOCUMENTS_LINK: GuideLink = {
  to: '/organizacion/documentos',
  label: 'Documentos: RUT, cámara de comercio y su revisión',
  roles: ORG_DOCUMENT_ROLES,
};
const PORTAL_LINK: GuideLink = {
  to: '/organizacion/portal',
  label: 'Personalización: plantilla, colores, logo y portada',
  roles: ORG_MEMBER_ROLES,
};
const ANIMALS_LINK: GuideLink = { to: '/animales', label: 'Animales', roles: ANIMAL_VIEW_ROLES };
const ADOPTIONS_LINK: GuideLink = {
  to: '/adopciones',
  label: 'Adopciones: solicitudes por etapa',
  roles: ADOPTIONS_MANAGEMENT_ROLES,
};
const LEGAL_REP_LINK: GuideLink = {
  to: '/organizacion/representante-legal',
  label: 'Representante legal y su firma',
  roles: ORG_DOCUMENT_ROLES,
};
const SIGNERS_LINK: GuideLink = {
  to: '/organizacion/firmantes',
  label: 'Firmantes: contador o revisor fiscal',
  roles: ORG_SIGNERS_ROLES,
};
const REPORTS_LINK: GuideLink = {
  to: '/organizacion/reportes',
  label: 'Reportes',
  roles: ORG_DOCUMENT_ROLES,
};

export const PAGE_HELP: readonly PageHelp[] = [
  // ── Público ──────────────────────────────────────────────────────────────
  {
    match: /^\/$/,
    audiences: ['visitor'],
    title: 'Inicio de AdoptaFácil',
    tips: [
      'Abajo encuentras los animales disponibles de todas las organizaciones.',
      'Si eres una organización, "Registrar mi organización" es gratis.',
      'Cada sello en un portal significa un documento revisado por nuestro equipo.',
    ],
    related: [
      { to: '/adoptar', label: 'Ver animales en adopción' },
      { to: '/register', label: 'Crear una cuenta gratis' },
    ],
  },
  {
    match: /^\/$/,
    title: 'Inicio de AdoptaFácil',
    tips: [
      'Esta es la página pública: así la ve cualquier visitante.',
      'Tu panel de trabajo está en Inicio.',
    ],
    related: [{ to: '/inicio', label: 'Ir a mi panel' }],
  },
  {
    match: /^\/plantillas\//,
    title: 'Plantilla de ejemplo',
    tips: [
      'Es un portal lleno con datos de prueba: así se vería el tuyo con esta plantilla.',
      'Cambia de plantilla con las flechas de la barra superior.',
    ],
  },
  {
    match: /^\/o\/[^/]+\/animales\//,
    title: 'Ficha del animal',
    tips: [
      'Aquí ves su historia, su salud y quién lo cuida.',
      'Para adoptarlo necesitas una cuenta de persona; la solicitud la revisa la organización.',
    ],
  },
  {
    match: /^\/o\/[^/]+/,
    title: 'Portal de una organización',
    tips: [
      'Esta es la página de la organización dentro de AdoptaFácil.',
      'Los sellos verdes son documentos que nuestro equipo revisó.',
      'Si quieres conocer a un animal, abre su ficha y envía la solicitud.',
    ],
  },
  {
    match: /^\/adoptar/,
    title: 'Animales en adopción',
    tips: [
      'Filtra por especie o ciudad, o busca por nombre o raza.',
      'Abre la ficha de un animal y pulsa "Solicitar adopción": la solicitud le llega a la organización que lo cuida.',
      'Para enviar la solicitud necesitas una cuenta de persona (gratis).',
    ],
    related: [{ to: '/mis-solicitudes', label: 'Mis solicitudes' }],
  },
  {
    match: /^\/register/,
    title: 'Crear una cuenta',
    tips: [
      'Elige "Persona" si quieres adoptar u "Organización" si rescatas animales.',
      'Las organizaciones pueden empezar sin RUT ni cámara de comercio y subirlos después.',
    ],
  },
  {
    match: /^\/login/,
    title: 'Ingresar',
    tips: ['Si olvidaste tu contraseña, usa "¿Olvidaste tu contraseña?" para recibir un enlace.'],
  },
  {
    match: /^\/campanas/,
    title: 'Campañas',
    tips: [
      'Aquí ves las campañas que publican las organizaciones y su avance.',
      'Cada campaña pertenece a una organización: abre su portal para conocerla.',
    ],
  },
  {
    match: /^\/recursos/,
    title: 'Banco de recursos',
    tips: [
      'Son las cosas que las organizaciones necesitan hoy: comida, medicinas, cobijas…',
      'Elige una necesidad y pulsa "Quiero ayudar con esto": la organización coordina contigo la entrega.',
    ],
    related: [{ to: '/mis-ofertas', label: 'Mis ofertas' }],
  },
  {
    match: /^\/marketplace/,
    title: 'Marketplace',
    tips: [
      'Productos que venden las organizaciones para sostener su labor.',
      'La compra se acuerda por WhatsApp directamente con la organización, fuera de AdoptaFácil.',
    ],
  },
  {
    match: /^\/servicios/,
    title: 'Directorio de servicios',
    tips: [
      'Veterinarias, peluquerías, paseadores y tiendas. Filtra por ciudad o tipo de servicio.',
      'Si tienes un negocio, puedes publicarlo gratis desde "Mi negocio".',
    ],
    related: [{ to: '/mi-negocio', label: 'Publicar mi negocio' }],
  },
  {
    match: /^\/(donar|donaciones)$/,
    title: 'Donar',
    tips: [
      'Las donaciones se hacen desde el portal de cada organización: busca su botón "Donar".',
      'No necesitas una cuenta para donar.',
    ],
  },
  {
    match: /^\/verificar/,
    title: 'Verificar un certificado',
    tips: ['Escribe el código impreso en el certificado para confirmar que es auténtico.'],
  },
  {
    match: /^\/guias/,
    title: 'Guías',
    tips: ['Lecturas cortas para adoptar bien y cuidar a tu animal después de la adopción.'],
  },

  // ── Persona ──────────────────────────────────────────────────────────────
  {
    match: /^\/inicio/,
    audiences: ['org'],
    title: 'Inicio de tu organización',
    tips: [
      'Aquí ves lo pendiente, las donaciones y los accesos rápidos según tu rol.',
      'La campana del encabezado reúne recordatorios clínicos y tareas.',
      'El menú lateral muestra solo lo que tu rol permite.',
    ],
    related: [ORG_PROFILE_LINK, FORMALIZATION_LINK, DOCUMENTS_LINK],
  },
  {
    match: /^\/inicio/,
    audiences: ['platform'],
    title: 'Tu inicio',
    tips: [
      'Aquí ves lo pendiente y los accesos rápidos según tu rol.',
      'Las colas del equipo están en el menú, en el grupo de plataforma.',
    ],
  },
  {
    match: /^\/inicio/,
    title: 'Tu inicio',
    tips: [
      'Aquí ves lo pendiente y los accesos rápidos.',
      'Tus solicitudes de adopción, donaciones y voluntariado están en el menú lateral.',
    ],
    related: [
      { to: '/adoptar', label: 'Buscar un animal para adoptar' },
      { to: '/mis-solicitudes', label: 'Mis solicitudes' },
    ],
  },
  {
    match: /^\/perfil\/completar/,
    title: 'Completa tu perfil',
    tips: ['Estos datos los necesita la organización para revisar tu solicitud de adopción.'],
  },
  {
    match: /^\/mis-solicitudes/,
    title: 'Mis solicitudes',
    tips: [
      'Aquí ves en qué etapa va cada solicitud de adopción que enviaste.',
      'Cuando te aprueben, el contrato de adopción aparece para firmarlo en línea.',
    ],
    related: [{ to: '/adoptar', label: 'Ver más animales' }],
  },
  {
    match: /^\/mis-seguimientos/,
    title: 'Mis seguimientos',
    tips: [
      'La organización te pide noticias del animal después de la adopción.',
      'Responde cada seguimiento antes de su fecha límite.',
    ],
  },
  {
    match: /^\/mis-animales/,
    title: 'Mis animales',
    tips: [
      'La ficha de cada animal que adoptaste: vacunas, cuidados y lo que recibiste en la entrega.',
    ],
  },
  {
    match: /^\/mis-donaciones/,
    title: 'Mis donaciones',
    tips: [
      'Historial de tus donaciones y sus comprobantes.',
      'Para donar otra vez, entra al portal de la organización y usa su botón "Donar".',
    ],
  },
  {
    match: /^\/apadrinar/,
    title: 'Mis apadrinamientos',
    tips: [
      'Historial de los animales que apadrinas.',
      'Para apadrinar uno nuevo, abre su ficha en el portal de la organización y pulsa "Apadrinar".',
    ],
  },
  {
    match: /^\/voluntariado/,
    title: 'Voluntariado',
    tips: [
      'Explora oportunidades, inscríbete y registra tus horas.',
      'Tus certificados de voluntariado se descargan desde aquí.',
    ],
  },
  {
    match: /^\/ofrecer/,
    title: 'Ofrecer ayuda',
    tips: [
      'Se ofrece ayuda sobre una necesidad publicada: elígela en el banco de recursos.',
      'La organización recibe tu oferta y coordina contigo la entrega.',
    ],
    related: [{ to: '/recursos', label: 'Banco de recursos' }],
  },
  {
    match: /^\/mis-ofertas/,
    title: 'Mis ofertas',
    tips: ['Las donaciones físicas que ofreciste y si la organización ya las aceptó.'],
    related: [{ to: '/recursos', label: 'Ver necesidades activas' }],
  },
  {
    match: /^\/comunidad/,
    title: 'Comunidad',
    tips: [
      'Publicaciones, avisos y campañas de organizaciones y personas.',
      'Lo que publiques aparece también en "Mis publicaciones".',
    ],
    related: [{ to: '/mis-publicaciones', label: 'Mis publicaciones' }],
  },
  {
    match: /^\/mis-publicaciones/,
    title: 'Mis publicaciones',
    tips: ['Todo lo que has publicado en la comunidad.'],
    related: [{ to: '/comunidad', label: 'Ir a la comunidad' }],
  },
  {
    match: /^\/mi-negocio/,
    title: 'Mi negocio',
    tips: [
      'Publica gratis tu veterinaria, peluquería, paseo o tienda en el directorio.',
      'El equipo revisa el perfil antes de que aparezca en público.',
    ],
    related: [{ to: '/servicios', label: 'Ver el directorio' }],
  },
  {
    match: /^\/mis-mascotas/,
    title: 'Mis mascotas',
    tips: ['Registra a tus mascotas para tener su información a mano.'],
  },
  {
    match: /^\/certificado/,
    title: 'Certificado de donación',
    tips: [
      'Se emite solo al confirmarse el pago, y solo si la organización es una ESAL con RTE vigente.',
      'Cualquiera puede comprobarlo con su código en "Verificar".',
    ],
  },
  {
    match: /^\/uso-de-mis-datos/,
    title: 'Uso de mis datos en reportes',
    tips: [
      'Tú decides si tu nombre y tu documento aparecen en los reportes y certificados de cada organización.',
    ],
  },
  {
    match: /^\/mis-autorizaciones/,
    title: 'Mis autorizaciones',
    tips: ['Las políticas y autorizaciones que aceptaste, con su versión y fecha.'],
  },
  {
    match: /^\/resenas/,
    title: 'Mis reseñas',
    tips: ['Las reseñas que enviaste a organizaciones y si ya fueron publicadas.'],
  },

  // ── Organización ─────────────────────────────────────────────────────────
  {
    match: /^\/organizacion\/formalizacion/,
    title: 'Formalización',
    tips: [
      'Muestra en qué estado formal está tu organización y su historial.',
      'Solo el propietario puede avanzar o retroceder el estado.',
      'Si no puedes avanzar, el aviso dice qué falta: casi siempre un documento por subir o aprobar en "Documentos".',
    ],
    related: [DOCUMENTS_LINK, LEGAL_REP_LINK],
  },
  {
    match: /^\/organizacion\/documentos/,
    title: 'Documentos de la organización',
    tips: [
      'Cada documento muestra su estado: pendiente, en revisión, observado, aprobado o rechazado.',
      'Si te falta un documento, pulsa "No lo tengo todavía" para ver cómo conseguirlo.',
      'Cuando un documento es aprobado, aparece como sello en tu portal público.',
    ],
    related: [FORMALIZATION_LINK, LEGAL_REP_LINK],
  },
  {
    match: /^\/organizacion\/representante-legal/,
    title: 'Representante legal',
    tips: [
      'Quién firma los documentos de la organización.',
      'Cada persona registra su propia firma con su propia cuenta: nadie firma por otro.',
    ],
    related: [SIGNERS_LINK, REPORTS_LINK],
  },
  {
    match: /^\/organizacion\/firmantes/,
    title: 'Firmantes',
    tips: [
      'Vincula a tu contador o revisor fiscal; ellos crean su propia cuenta y contraseña.',
      'Tú los vinculas y tú los revocas cuando quieras.',
    ],
    related: [REPORTS_LINK, LEGAL_REP_LINK],
  },
  {
    match: /^\/organizacion\/documentos-por-firmar/,
    title: 'Documentos por firmar',
    tips: ['Revisa cada borrador y apruébalo con tu propia cuenta: nadie puede firmar por ti.'],
    related: [LEGAL_REP_LINK],
  },
  {
    match: /^\/organizacion\/reportes/,
    title: 'Reportes',
    tips: [
      'Informes de donaciones y de servicio social listos para firmar, enviar y verificar.',
      'Antes de firmar, registra al representante legal y a tus firmantes.',
    ],
    related: [LEGAL_REP_LINK, SIGNERS_LINK],
  },
  {
    match: /^\/organizacion\/portal/,
    title: 'Personalizar tu portal',
    tips: [
      'Elige plantilla, colores, logo y portada; la vista previa muestra cómo se verá.',
      'Usa una portada horizontal con buena luz: el texto se pinta encima.',
      'Nombre, descripción, WhatsApp y redes se editan en "Mi organización", no aquí.',
    ],
    related: [ORG_PROFILE_LINK],
  },
  {
    match: /^\/organizacion\/campanas/,
    title: 'Campañas de recaudación',
    tips: [
      'Crea una campaña con su meta; el avance se ve en tu portal y en "Campañas".',
      'Una historia corta y una buena foto ayudan más que un texto largo.',
    ],
  },
  {
    match: /^\/organizacion\/recursos/,
    title: 'Necesidades (banco de recursos)',
    tips: [
      'Publica lo que necesitas: aparece en tu portal y en el banco de recursos público.',
      'Las ofertas de ayuda que recibas llegan aquí para aceptarlas y coordinar la entrega.',
    ],
  },
  {
    match: /^\/organizacion\/marketplace/,
    title: 'Marketplace',
    tips: [
      'Publica productos físicos de tu organización.',
      'El contacto y la venta ocurren por el WhatsApp de tu organización, fuera de la plataforma.',
    ],
    related: [ORG_PROFILE_LINK],
  },
  {
    match: /^\/organizacion\/voluntariado/,
    title: 'Gestión de voluntariado',
    tips: ['Publica oportunidades de voluntariado y gestiona inscripciones, horas y certificados.'],
  },
  {
    match: /^\/organizacion\/libro-publico/,
    title: 'Libro público',
    tips: [
      'Registra lo que recibes y lo que gastas: se ve en tu portal, en "Transparencia".',
      'Las donaciones en línea aparecen solas.',
    ],
  },
  {
    match: /^\/organizacion\/resenas/,
    title: 'Reseñas de tu portal',
    tips: ['Las reseñas que dejan en tu portal pasan por moderación antes de publicarse.'],
  },
  {
    match: /^\/organizacion\/apadrinamientos/,
    title: 'Apadrinamientos recibidos',
    tips: ['Planes activos por animal y sus padrinos. Los planes se crean desde "Animales".'],
    related: [ANIMALS_LINK],
  },
  {
    match: /^\/organizacion\/anuncios/,
    title: 'Anuncios urgentes',
    tips: ['Escribe a tus donantes, adoptantes y voluntarios cuando algo no puede esperar.'],
  },
  {
    match: /^\/organizacion\/plan/,
    title: 'Plan y facturación',
    tips: [
      'Lo que protege a los animales y la transparencia es gratis siempre.',
      'Los planes de pago son opcionales: suman marca, alcance y comodidad.',
    ],
  },
  {
    match: /^\/organizacion$/,
    title: 'Mi organización',
    tips: [
      'Completa ciudad, descripción y redes: es lo primero que lee quien visita tu portal.',
      'El número de WhatsApp que pongas aquí aparece como botón de contacto en tu portal, y es a donde escriben tus visitantes.',
      'Desde la barra de arriba llegas a Formalización, Representante legal y Personalización.',
    ],
    related: [FORMALIZATION_LINK, PORTAL_LINK, DOCUMENTS_LINK],
  },
  {
    match: /^\/donaciones-recibidas/,
    title: 'Donaciones recibidas',
    tips: [
      'Las donaciones que llegaron a tu organización y su estado.',
      'Los certificados se emiten solos al confirmarse cada pago, si tu ESAL tiene RTE vigente.',
    ],
    related: [REPORTS_LINK],
  },
  {
    match: /^\/recordatorios/,
    title: 'Recordatorios',
    tips: ['Vacunas y tratamientos que se acercan, según el expediente clínico de cada animal.'],
    related: [ANIMALS_LINK],
  },
  {
    match: /^\/animales\/[^/]+/,
    title: 'Detalle del animal',
    tips: [
      'Mantén al día el expediente clínico: vacunas, desparasitación y esterilización.',
      'Los recordatorios clínicos te avisan lo próximo que toca.',
    ],
  },
  {
    match: /^\/animales/,
    title: 'Animales',
    tips: [
      'Aquí gestionas todos los animales de tu organización.',
      'Solo los animales disponibles para adopción aparecen en el portal público.',
    ],
    related: [ADOPTIONS_LINK],
  },
  {
    match: /^\/adopciones\/contratos\//,
    title: 'Contrato de adopción',
    tips: [
      'El contrato queda válido cuando lo firman la organización y quien adopta.',
      'Lee las condiciones con calma antes de firmar.',
    ],
  },
  {
    match: /^\/adopciones\/solicitar/,
    title: 'Solicitar adopción',
    tips: [
      'Responde con calma: la organización usa estas respuestas para conocerte.',
      'Después sigue el estado en "Mis solicitudes".',
    ],
  },
  {
    match: /^\/adopciones/,
    title: 'Solicitudes de adopción',
    tips: [
      'Cada columna es una etapa: mueve la solicitud a medida que avanzas.',
      'Antes de aprobar, revisa las respuestas y conversa con quien quiere adoptar.',
    ],
    related: [ANIMALS_LINK],
  },

  // ── Plataforma ───────────────────────────────────────────────────────────
  {
    match: /^\/plataforma\/documentos/,
    title: 'Revisión de documentos',
    tips: [
      'Reserva un expediente antes de decidir; la reserva vence sola a los 30 minutos.',
      'Observar y rechazar exigen un motivo que la organización va a leer.',
    ],
    related: [
      { to: '/plataforma/organizaciones', label: 'Aprobar organizaciones', roles: PLATFORM_ROLES },
    ],
  },
  {
    match: /^\/plataforma\/organizaciones-duplicadas/,
    title: 'Organizaciones duplicadas',
    tips: ['Posibles registros repetidos de una misma organización.'],
  },
  {
    match: /^\/plataforma\/organizaciones/,
    title: 'Aprobar organizaciones',
    tips: [
      'Aprobar hace público el portal de la organización.',
      'Revisa antes sus documentos en "Revisión de documentos".',
    ],
    related: [
      { to: '/plataforma/documentos', label: 'Revisión de documentos', roles: PLATFORM_ROLES },
    ],
  },
  {
    match: /^\/plataforma\/(comunidad|servicios|resenas)/,
    title: 'Moderación',
    tips: ['Revisa lo nuevo o lo reportado antes de que aparezca en público.'],
  },
  {
    match: /^\/plataforma\/equipo/,
    title: 'Equipo y seguridad',
    tips: ['Tareas, aprobaciones y actividad del equipo. Lo que ves aquí solo lo ve el equipo.'],
  },
  {
    match: /^\/plataforma\/correos/,
    title: 'Correos',
    tips: ['Las plantillas de los correos que envía la plataforma.'],
  },
  {
    match: /^\/plataforma/,
    title: 'Plataforma',
    tips: [
      'Herramientas del equipo de AdoptaFácil. Las colas pendientes están en el menú lateral.',
    ],
  },
];

export const GENERIC_HELP: PageHelp = {
  match: /.*/,
  title: 'Ayuda',
  tips: [
    'Usa "Guías paso a paso" para las tareas más comunes.',
    'En "¿A dónde voy?" tienes el mapa de lo que puedes hacer con tu cuenta.',
    'Si te atascas, escríbenos por WhatsApp o correo.',
  ],
};

/**
 * Ayuda de la ruta actual. Con `audiences`, se salta las entradas escritas
 * para otro tipo de cuenta (p. ej. el inicio de una organización frente al de
 * una persona); sin ellas, gana la primera que coincide con la ruta.
 */
export function helpForPath(pathname: string, audiences?: ReadonlySet<GuideAudience>): PageHelp {
  return (
    PAGE_HELP.find(
      (help) =>
        help.match.test(pathname) &&
        (!help.audiences || !audiences || help.audiences.some((a) => audiences.has(a))),
    ) ?? GENERIC_HELP
  );
}

export interface MapEntry {
  to: string;
  label: string;
  description?: string;
}

/** Mapa para visitantes. Los módulos apagados se filtran en el componente. */
export const PUBLIC_MAP: readonly MapEntry[] = [
  {
    to: '/adoptar',
    label: 'Animales en adopción',
    description: 'Todos los animales disponibles.',
  },
  { to: '/campanas', label: 'Campañas', description: 'Campañas activas de las organizaciones.' },
  { to: '/recursos', label: 'Banco de recursos' },
  { to: '/marketplace', label: 'Marketplace' },
  {
    to: '/#organizaciones',
    label: 'Para organizaciones',
    description: 'Qué ofrece AdoptaFácil a refugios y rescatistas.',
  },
  { to: '/register', label: 'Crear una cuenta', description: 'Persona u organización, gratis.' },
  { to: '/login', label: 'Ingresar' },
];

/** Descripción de una línea para las entradas del menú autenticado. */
export const MAP_DESCRIPTIONS: Record<string, string> = {
  '/inicio': 'Lo pendiente y los accesos rápidos.',
  '/organizacion': 'Perfil, contacto y portal de tu organización.',
  '/organizacion/documentos': 'RUT, cámara de comercio y su revisión.',
  '/animales': 'Fichas y expediente clínico.',
  '/adopciones': 'Solicitudes de adopción por etapa.',
  '/mis-solicitudes': 'Tus solicitudes de adopción.',
  '/organizacion/campanas': 'Campañas de tu organización.',
  '/plataforma/documentos': 'Cola de revisión documental.',
  '/plataforma/organizaciones-duplicadas': 'Posibles registros repetidos.',
};
