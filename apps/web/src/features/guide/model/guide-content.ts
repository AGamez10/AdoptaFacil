import { Role } from '@adoptafacil/contracts';

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

export interface PageHelp {
  /** Se prueba contra `location.pathname`; gana la primera que coincide. */
  match: RegExp;
  title: string;
  tips: readonly string[];
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
        to: '/#adoptar',
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

export const PAGE_HELP: readonly PageHelp[] = [
  {
    match: /^\/$/,
    title: 'Inicio de AdoptaFácil',
    tips: [
      'Abajo encuentras los animales disponibles de todas las organizaciones.',
      'Si eres una organización, "Registrar mi organización" es gratis.',
      'Cada sello en un portal significa un documento revisado por nuestro equipo.',
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
    tips: ['Aquí ves las campañas que publican las organizaciones y su avance.'],
  },
  {
    match: /^\/inicio/,
    title: 'Tu inicio',
    tips: [
      'Aquí ves lo pendiente y los accesos rápidos según tu rol.',
      'La campana del encabezado reúne recordatorios clínicos y tareas.',
    ],
  },
  {
    match: /^\/organizacion\/documentos/,
    title: 'Documentos de la organización',
    tips: [
      'Cada documento muestra su estado: pendiente, en revisión, observado, aprobado o rechazado.',
      'Si te falta un documento, pulsa "No lo tengo todavía" para ver cómo conseguirlo.',
      'Cuando un documento es aprobado, aparece como sello en tu portal público.',
    ],
  },
  {
    match: /^\/organizacion\/portal/,
    title: 'Personalizar tu portal',
    tips: [
      'Elige colores, logo y portada; la vista previa muestra cómo se verá.',
      'Usa una portada horizontal con buena luz: el texto se pinta encima.',
    ],
  },
  {
    match: /^\/organizacion$/,
    title: 'Mi organización',
    tips: [
      'Completa ciudad, descripción y redes: es lo primero que lee quien visita tu portal.',
      'El número de WhatsApp que pongas aquí aparece como botón de contacto en tu portal.',
    ],
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
    match: /^\/adopciones/,
    title: 'Solicitudes de adopción',
    tips: [
      'Cada columna es una etapa: mueve la solicitud a medida que avanzas.',
      'Antes de aprobar, revisa las respuestas y conversa con quien quiere adoptar.',
    ],
  },
  {
    match: /^\/mis-solicitudes/,
    title: 'Mis solicitudes',
    tips: ['Aquí ves en qué etapa va cada solicitud de adopción que enviaste.'],
  },
  {
    match: /^\/plataforma\/documentos/,
    title: 'Revisión de documentos',
    tips: [
      'Reserva un expediente antes de decidir; la reserva vence sola a los 30 minutos.',
      'Observar y rechazar exigen un motivo que la organización va a leer.',
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

export function helpForPath(pathname: string): PageHelp {
  return PAGE_HELP.find((help) => help.match.test(pathname)) ?? GENERIC_HELP;
}

export interface MapEntry {
  to: string;
  label: string;
  description?: string;
}

/** Mapa para visitantes. Los módulos apagados se filtran en el componente. */
export const PUBLIC_MAP: readonly MapEntry[] = [
  {
    to: '/#adoptar',
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
