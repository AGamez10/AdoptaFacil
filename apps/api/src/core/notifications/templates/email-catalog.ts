import type {
  EmailCategory,
  EmailEventKey,
  EmailTemplateContent,
  EmailTheme,
  EmailVariableDescriptor,
} from '@adoptafacil/contracts';

/**
 * The ONE catalog of email events. Fixed in code on purpose: the superadmin
 * edits only the copy of an event, never its trigger, its recipients, the
 * variables it can use or the URL its button opens (anti-phishing: a template
 * can't point a button anywhere the platform didn't decide). Adding an event =
 * one entry here + the caller passing `template: { event, data }`.
 *
 * Default copy follows the tone of the product: warm, short, Colombian Spanish,
 * "tú". Variables are Spanish words so the superadmin reads them naturally.
 */
export interface EmailEventDefinition {
  event: EmailEventKey;
  label: string;
  description: string;
  audience: string;
  category: EmailCategory;
  theme: EmailTheme;
  required: boolean;
  variables: EmailVariableDescriptor[];
  ctaUrlVariable?: string;
  defaults: EmailTemplateContent;
}

const v = (
  name: string,
  label: string,
  example: string,
  kind: EmailVariableDescriptor['kind'] = 'text',
): EmailVariableDescriptor => ({ name, label, kind, example });

const ORG = v('organizacion', 'Nombre de la organización', 'Fundación Huellitas de Amor');
const ANIMAL = v('animal', 'Nombre del animal', 'Luna');

export const EMAIL_CATALOG: readonly EmailEventDefinition[] = [
  {
    event: 'auth.password_reset',
    label: 'Restablecer contraseña',
    description: 'Se envía cuando alguien pide crear una contraseña nueva.',
    audience: 'La persona dueña de la cuenta',
    category: 'transactional',
    theme: 'security',
    required: true,
    variables: [
      v(
        'enlace',
        'Enlace para crear la contraseña',
        'https://adoptafacil.co/restablecer?token=demo',
        'url',
      ),
    ],
    ctaUrlVariable: 'enlace',
    defaults: {
      subject: 'Restablece tu contraseña de AdoptaFácil',
      preheader: 'El enlace caduca en 1 hora.',
      heading: 'Crea una contraseña nueva',
      body:
        'Hola,\n\nRecibimos una solicitud para restablecer la contraseña de tu cuenta en AdoptaFácil. ' +
        'Usa el botón para crear una nueva. **El enlace caduca en 1 hora.**\n\n' +
        'Si no fuiste tú, ignora este correo: tu contraseña seguirá igual y nadie más puede usar este enlace.',
      ctaLabel: 'Crear contraseña nueva',
      footerNote: 'Por tu seguridad, AdoptaFácil nunca te pedirá tu contraseña por correo.',
    },
  },
  {
    event: 'donation.thanks',
    label: 'Agradecimiento por donación',
    description: 'Se envía cuando el pago de una donación queda confirmado.',
    audience: 'La persona que donó',
    category: 'transactional',
    theme: 'donation',
    required: false,
    variables: [
      ORG,
      v('monto', 'Monto donado', '50000', 'money'),
      v(
        'enlace',
        'Enlace al comprobante (30 días)',
        'https://adoptafacil.co/donaciones/comprobante?token=demo',
        'url',
      ),
    ],
    ctaUrlVariable: 'enlace',
    defaults: {
      subject: '¡Gracias por tu donación a {{organizacion}}!',
      preheader: 'Tu aporte ya está confirmado. Aquí tienes tu comprobante.',
      heading: 'Gracias por ayudar 💛',
      body:
        'Hola,\n\nTu donación de **{{monto}}** a **{{organizacion}}** fue confirmada. ' +
        'Gracias a personas como tú, más animales reciben comida, atención veterinaria y una segunda oportunidad.\n\n' +
        'Puedes consultar el estado, el recibo y el certificado (si aplica) de tu donación cuando quieras, ' +
        'sin crear una cuenta. El enlace está disponible durante 30 días.',
      ctaLabel: 'Ver mi comprobante',
      footerNote: 'Guarda este correo si quieres volver a consultar tu donación más adelante.',
    },
  },
  {
    event: 'sponsorship.welcome',
    label: 'Bienvenida al apadrinamiento',
    description: 'Se envía cuando un apadrinamiento nuevo queda activo.',
    audience: 'La persona que apadrina',
    category: 'transactional',
    theme: 'sponsorship',
    required: false,
    variables: [
      ORG,
      ANIMAL,
      v('monto', 'Aporte mensual', '30000', 'money'),
      v(
        'enlace',
        'Enlace a "Mis apadrinamientos"',
        'https://adoptafacil.co/mis-apadrinamientos',
        'url',
      ),
    ],
    ctaUrlVariable: 'enlace',
    defaults: {
      subject: 'Ahora apadrinas a {{animal}} 🐾',
      preheader: '{{organizacion}} te cuenta cómo va {{animal}} cada mes.',
      heading: '¡Bienvenida a la familia de {{animal}}!',
      body:
        'Hola,\n\nDesde hoy apadrinas a **{{animal}}** en **{{organizacion}}** con un aporte de **{{monto}}** al mes.\n\n' +
        'Tu apoyo cubre su comida, sus vacunas y sus cuidados mientras encuentra un hogar. ' +
        'Desde "Mis apadrinamientos" puedes ver sus novedades y tus pagos.',
      ctaLabel: 'Ver mi apadrinamiento',
    },
  },
  {
    event: 'sponsorship.charge',
    label: 'Nuevo cobro de apadrinamiento',
    description: 'Se envía cuando se abre el cobro de un nuevo periodo.',
    audience: 'La persona que apadrina',
    category: 'transactional',
    theme: 'sponsorship',
    required: false,
    variables: [ORG, ANIMAL, v('monto', 'Valor del periodo', '30000', 'money')],
    defaults: {
      subject: 'Nuevo cobro de tu apadrinamiento de {{animal}}',
      preheader: 'Completa el pago para mantener tu apadrinamiento activo.',
      heading: 'Es momento de renovar tu apoyo',
      body:
        'Hola,\n\nSe generó el cobro del nuevo periodo de tu apadrinamiento de **{{animal}}** en **{{organizacion}}** por **{{monto}}**.\n\n' +
        'Complétalo para que {{animal}} siga contando contigo.',
    },
  },
  {
    event: 'sponsorship.reminder',
    label: 'Recordatorio de pago pendiente',
    description: 'Recordatorio intermedio cuando el pago del periodo sigue pendiente.',
    audience: 'La persona que apadrina',
    category: 'transactional',
    theme: 'sponsorship',
    required: false,
    variables: [ORG, ANIMAL, v('monto', 'Valor del periodo', '30000', 'money')],
    defaults: {
      subject: 'Recordatorio: pago de apadrinamiento pendiente',
      preheader: '{{animal}} sigue contando contigo.',
      heading: 'Tu pago sigue pendiente',
      body: 'Hola,\n\nEl pago de tu apadrinamiento de **{{animal}}** en **{{organizacion}}** por **{{monto}}** sigue pendiente.',
    },
  },
  {
    event: 'sponsorship.final_reminder',
    label: 'Último aviso antes de suspender',
    description: 'Último recordatorio antes de la suspensión automática.',
    audience: 'La persona que apadrina',
    category: 'transactional',
    theme: 'alert',
    required: false,
    variables: [ORG, ANIMAL, v('monto', 'Valor del periodo', '30000', 'money')],
    defaults: {
      subject: 'Último aviso: tu apadrinamiento será suspendido',
      preheader: 'Completa el pago para no perder tu apadrinamiento.',
      heading: 'Último aviso',
      body:
        'Hola,\n\nEl pago de tu apadrinamiento de **{{animal}}** en **{{organizacion}}** por **{{monto}}** sigue pendiente. ' +
        'Si no se completa pronto, **el apadrinamiento se suspenderá automáticamente**.',
    },
  },
  {
    event: 'sponsorship.suspended_sponsor',
    label: 'Apadrinamiento suspendido (padrino)',
    description: 'Se envía al padrino cuando se agotan los intentos de cobro.',
    audience: 'La persona que apadrina',
    category: 'transactional',
    theme: 'alert',
    required: false,
    variables: [ORG, ANIMAL],
    defaults: {
      subject: 'Tu apadrinamiento fue suspendido por pago fallido',
      preheader: 'Puedes reactivarlo desde "Mis apadrinamientos".',
      heading: 'Tu apadrinamiento quedó en pausa',
      body:
        'Hola,\n\nTu apadrinamiento de **{{animal}}** en **{{organizacion}}** se suspendió automáticamente porque se agotaron los 3 intentos de cobro.\n\n' +
        'Puedes reactivarlo cuando quieras con un nuevo pago desde "Mis apadrinamientos".',
    },
  },
  {
    event: 'sponsorship.suspended_org',
    label: 'Apadrinamiento suspendido (organización)',
    description: 'Aviso a la organización cuando un apadrinamiento se suspende por pago fallido.',
    audience: 'El equipo de la organización',
    category: 'transactional',
    theme: 'alert',
    required: false,
    variables: [ORG, ANIMAL],
    defaults: {
      subject: 'Un apadrinamiento de {{animal}} fue suspendido',
      preheader: 'Se agotaron los 3 intentos de cobro.',
      heading: 'Apadrinamiento suspendido',
      body: 'Hola equipo de {{organizacion}},\n\nEl apadrinamiento de **{{animal}}** se suspendió automáticamente por pago fallido (3 intentos agotados).',
    },
  },
  {
    event: 'sponsorship.animal_deceased',
    label: 'Fallecimiento de un animal apadrinado',
    description:
      'Se envía a los padrinos activos cuando la organización registra el fallecimiento.',
    audience: 'Las personas que lo apadrinaban',
    category: 'transactional',
    theme: 'sponsorship',
    required: false,
    variables: [ORG, ANIMAL],
    defaults: {
      subject: 'Queremos contarte algo sobre {{animal}}',
      preheader: 'Tu apadrinamiento quedó suspendido.',
      heading: 'Con mucho cariño',
      body:
        'Hola,\n\nCon tristeza te contamos que **{{animal}}** falleció. Tu apadrinamiento quedó suspendido y no se harán más cobros.\n\n' +
        'Gracias por todo el amor que le diste. {{organizacion}} se pondrá en contacto contigo.',
    },
  },
  {
    event: 'adoption.status_changed',
    label: 'Cambio de estado de la solicitud de adopción',
    description: 'Se envía cada vez que la organización mueve la solicitud de estado.',
    audience: 'La persona que solicitó la adopción',
    category: 'transactional',
    theme: 'adoption',
    required: false,
    variables: [
      v('nombre', 'Nombre de quien solicita', 'Ana María'),
      ANIMAL,
      ORG,
      v('estado', 'Estado nuevo', 'En entrevista'),
      v('enlace', 'Enlace a "Mis solicitudes"', 'https://adoptafacil.co/mis-solicitudes', 'url'),
    ],
    ctaUrlVariable: 'enlace',
    defaults: {
      subject: 'Tu solicitud de adopción de {{animal}}: {{estado}}',
      preheader: '{{organizacion}} actualizó tu solicitud.',
      heading: 'Tu solicitud avanzó',
      body:
        'Hola {{nombre}},\n\nEl estado de tu solicitud de adopción de **{{animal}}** en {{organizacion}} cambió a: **{{estado}}**.\n\n' +
        'Puedes ver el detalle y los próximos pasos en "Mis solicitudes".',
      ctaLabel: 'Ver mi solicitud',
    },
  },
  {
    event: 'adoption.followup_overdue',
    label: 'Seguimiento de adopción vencido',
    description: 'Se envía cuando un hito de seguimiento posadopción vence sin completarse.',
    audience: 'La familia adoptante',
    category: 'transactional',
    theme: 'adoption',
    required: false,
    variables: [
      v('hito', 'Nombre del hito', 'Visita de los 30 días'),
      v('fecha', 'Fecha de vencimiento', '2026-10-01T15:00:00.000Z', 'date'),
    ],
    defaults: {
      subject: 'Seguimiento de adopción pendiente: {{hito}}',
      preheader: 'Cuéntanos cómo va tu nuevo integrante.',
      heading: 'Tenemos un seguimiento pendiente',
      body:
        'Hola,\n\nTu hito de seguimiento **"{{hito}}"** venció el {{fecha}}. ' +
        'Complétalo para que la organización sepa que todo va bien en casa.',
    },
  },
  {
    event: 'adoption.contract_signed',
    label: 'Copia del contrato de adopción firmado',
    description: 'Se envía a ambas partes cuando el contrato queda firmado por todos.',
    audience: 'La familia adoptante y la organización',
    category: 'transactional',
    theme: 'adoption',
    required: false,
    variables: [
      v('nombre', 'Nombre de quien recibe', 'Ana María'),
      ANIMAL,
      ORG,
      v('fecha', 'Fecha de la última firma', '2026-10-08T21:00:00.000Z', 'date'),
      v('rol', 'Rol de quien recibe en el contrato', 'adoptante'),
      v(
        'huella',
        'Huella SHA-256 del documento firmado',
        '3f9a1c0e7b2d4a6f8e1c5b7d9a0e2c4f6b8d0a1c3e5f7a9b1d3f5a7c9e1b3d5f',
      ),
      v(
        'enlace',
        'Enlace para consultar el contrato',
        'https://adoptafacil.co/mis-solicitudes',
        'url',
      ),
    ],
    ctaUrlVariable: 'enlace',
    defaults: {
      subject: 'Contrato de adopción de {{animal}} firmado',
      preheader: 'Adjuntamos tu copia del contrato firmado por ambas partes.',
      heading: '¡Es oficial! 🏡',
      body:
        'Hola {{nombre}},\n\nEl contrato de adopción de **{{animal}}** con **{{organizacion}}** quedó firmado por ambas partes el {{fecha}}.\n\n' +
        'Recibes esta copia como **{{rol}}**. Adjuntamos el PDF; también puedes consultarlo en AdoptaFácil cuando lo necesites. ' +
        'Guárdalo: es el respaldo de los compromisos que ambas partes asumieron.',
      ctaLabel: 'Consultar el contrato',
      footerNote:
        'Cada parte recibe su propia copia del mismo documento. Huella del documento (SHA-256): {{huella}}',
    },
  },
  {
    event: 'volunteering.enrollment_received',
    label: 'Inscripción de voluntariado recibida',
    description: 'Se envía al voluntario cuando se inscribe a una oportunidad.',
    audience: 'La persona voluntaria',
    category: 'transactional',
    theme: 'volunteering',
    required: false,
    variables: [
      v('nombre', 'Nombre del voluntario', 'Carlos'),
      v('oportunidad', 'Oportunidad', 'Jornada de baño y paseo'),
      ORG,
    ],
    defaults: {
      subject: 'Tu inscripción a "{{oportunidad}}" fue recibida',
      preheader: 'Te avisaremos apenas la organización la revise.',
      heading: '¡Gracias por sumarte!',
      body:
        'Hola {{nombre}},\n\nTu inscripción a **"{{oportunidad}}"** en {{organizacion}} quedó registrada y está pendiente de aprobación.\n\n' +
        'Te avisaremos apenas la organización la revise.',
    },
  },
  {
    event: 'volunteering.enrollment_accepted',
    label: 'Inscripción de voluntariado aceptada',
    description: 'Se envía cuando la organización acepta la inscripción.',
    audience: 'La persona voluntaria',
    category: 'transactional',
    theme: 'volunteering',
    required: false,
    variables: [
      v('nombre', 'Nombre del voluntario', 'Carlos'),
      v('oportunidad', 'Oportunidad', 'Jornada de baño y paseo'),
      ORG,
    ],
    defaults: {
      subject: 'Tu inscripción a "{{oportunidad}}" fue aceptada',
      preheader: 'Ya puedes empezar a registrar tus horas.',
      heading: '¡Buenas noticias!',
      body: 'Hola {{nombre}},\n\n{{organizacion}} aceptó tu inscripción a **"{{oportunidad}}"**. Ya puedes empezar a registrar tus horas.',
    },
  },
  {
    event: 'volunteering.enrollment_rejected',
    label: 'Inscripción de voluntariado no aceptada',
    description: 'Se envía cuando la organización no puede aceptar la inscripción.',
    audience: 'La persona voluntaria',
    category: 'transactional',
    theme: 'volunteering',
    required: false,
    variables: [
      v('nombre', 'Nombre del voluntario', 'Carlos'),
      v('oportunidad', 'Oportunidad', 'Jornada de baño y paseo'),
      ORG,
      v('motivo', 'Motivo', 'Los cupos de esta jornada ya se llenaron.'),
    ],
    defaults: {
      subject: 'Sobre tu inscripción a "{{oportunidad}}"',
      preheader: 'Gracias por querer ayudar.',
      heading: 'Esta vez no fue posible',
      body:
        'Hola {{nombre}},\n\n{{organizacion}} no pudo aceptar tu inscripción a **"{{oportunidad}}"**.\n\nMotivo: {{motivo}}\n\n' +
        'Gracias por querer ayudar: hay muchas otras oportunidades esperándote en AdoptaFácil.',
    },
  },
  {
    event: 'volunteering.hours_approved',
    label: 'Horas de voluntariado aprobadas',
    description: 'Se envía cuando la organización aprueba un registro de horas.',
    audience: 'La persona voluntaria',
    category: 'transactional',
    theme: 'volunteering',
    required: false,
    variables: [
      v('nombre', 'Nombre del voluntario', 'Carlos'),
      v('oportunidad', 'Oportunidad', 'Jornada de baño y paseo'),
      v('horas', 'Horas', '4', 'number'),
    ],
    defaults: {
      subject: 'Tus {{horas}} horas en "{{oportunidad}}" fueron aprobadas',
      preheader: 'Ya cuentan como horas efectivas.',
      heading: 'Horas aprobadas ✓',
      body: 'Hola {{nombre}},\n\nTu registro de **{{horas}} horas** en "{{oportunidad}}" fue aprobado y ya cuenta como horas efectivas.',
    },
  },
  {
    event: 'volunteering.hours_rejected',
    label: 'Horas de voluntariado rechazadas',
    description: 'Se envía cuando la organización rechaza un registro de horas.',
    audience: 'La persona voluntaria',
    category: 'transactional',
    theme: 'volunteering',
    required: false,
    variables: [
      v('nombre', 'Nombre del voluntario', 'Carlos'),
      v('oportunidad', 'Oportunidad', 'Jornada de baño y paseo'),
      v('horas', 'Horas', '4', 'number'),
      v('motivo', 'Motivo', 'Las horas no coinciden con la jornada registrada.'),
    ],
    defaults: {
      subject: 'Tus {{horas}} horas en "{{oportunidad}}" no fueron aprobadas',
      preheader: 'Revisa el motivo y vuelve a registrarlas si aplica.',
      heading: 'Revisemos tu registro',
      body: 'Hola {{nombre}},\n\nTu registro de **{{horas}} horas** en "{{oportunidad}}" fue rechazado.\n\nMotivo: {{motivo}}',
    },
  },
  {
    event: 'volunteering.certificate_issued',
    label: 'Certificado de voluntariado emitido',
    description: 'Se envía cuando la organización emite el certificado de horas.',
    audience: 'La persona voluntaria',
    category: 'transactional',
    theme: 'volunteering',
    required: false,
    variables: [
      v('nombre', 'Nombre del voluntario', 'Carlos'),
      v('oportunidad', 'Oportunidad', 'Jornada de baño y paseo'),
      ORG,
      v('horas', 'Horas certificadas', '40', 'number'),
    ],
    defaults: {
      subject: 'Tu certificado de voluntariado en "{{oportunidad}}" está listo',
      preheader: 'Descárgalo desde "Mi voluntariado".',
      heading: 'Tu certificado está listo 🎓',
      body:
        'Hola {{nombre}},\n\n{{organizacion}} emitió tu certificado de voluntariado en **"{{oportunidad}}"**, que refleja **{{horas}} horas efectivas**.\n\n' +
        'Puedes descargarlo desde "Mi voluntariado" en AdoptaFácil. ¡Gracias por tu tiempo!',
    },
  },
  {
    event: 'community.campaign_update',
    label: 'Novedades de campaña a donantes',
    description:
      'Se envía a quienes ya donaron a la organización cuando publica novedades de una campaña.',
    audience: 'Donantes anteriores de la organización',
    category: 'bulk',
    theme: 'community',
    required: false,
    variables: [
      ORG,
      v('titulo', 'Título de la publicación', 'Ya casi llegamos a la meta'),
      v(
        'mensaje',
        'Texto de la publicación',
        'Gracias a ustedes ya tenemos el 80% para la cirugía de Max.',
      ),
    ],
    defaults: {
      subject: '{{organizacion}} publicó novedades sobre una campaña',
      preheader: '{{titulo}}',
      heading: '{{titulo}}',
      body: 'Hola,\n\nComo apoyaste a **{{organizacion}}**, queremos contarte cómo va:\n\n{{mensaje}}',
    },
  },
  {
    event: 'platform.announcement',
    label: 'Anuncio general de la plataforma',
    description: 'Plantilla para comunicados masivos de AdoptaFácil.',
    audience: 'Personas registradas que no se han dado de baja',
    category: 'bulk',
    theme: 'community',
    required: false,
    variables: [
      v('titulo', 'Título del anuncio', 'Nuevas funciones para refugios'),
      v('mensaje', 'Mensaje', 'Ya puedes generar reportes de donaciones con un clic.'),
    ],
    defaults: {
      subject: '{{titulo}}',
      preheader: 'Novedades de AdoptaFácil',
      heading: '{{titulo}}',
      body: 'Hola,\n\n{{mensaje}}',
    },
  },
];

const BY_EVENT = new Map(EMAIL_CATALOG.map((d) => [d.event, d]));

export function getEmailEvent(event: string): EmailEventDefinition | undefined {
  return BY_EVENT.get(event as EmailEventKey);
}
