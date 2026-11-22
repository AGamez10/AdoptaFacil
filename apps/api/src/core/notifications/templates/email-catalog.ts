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
    event: 'org.invitation',
    label: 'Invitación al equipo de una organización',
    description:
      'Se envía cuando una organización invita a alguien a su equipo con un cargo (administración, operación, veterinaria, auditoría, contador o revisor fiscal…).',
    audience: 'La persona invitada (aún no tiene cuenta)',
    category: 'transactional',
    theme: 'team',
    // Sin este correo nadie puede entrar al equipo: no se puede apagar.
    required: true,
    variables: [
      ORG,
      v('cargo', 'Cargo que le dan', 'Veterinario/a'),
      v(
        'funciones',
        'Qué podrá hacer con ese cargo (lista)',
        '• Registrar y actualizar la historia clínica, vacunas y tratamientos\n• Atender los recordatorios de salud de cada animal',
      ),
      v('invitado_por', 'Quién envía la invitación', 'Ana Gómez'),
      v('vence', 'Fecha y hora en que caduca el enlace', '2026-11-07T22:12:00.000Z', 'date'),
      v(
        'enlace',
        'Enlace para crear la cuenta (un solo uso)',
        'https://adoptafacil.co/invitacion#token=demo',
        'url',
      ),
    ],
    ctaUrlVariable: 'enlace',
    defaults: {
      subject: '{{organizacion}} te invita a su equipo como {{cargo}}',
      preheader:
        'Crea tu cuenta en AdoptaFácil. El enlace caduca el {{vence}} y sirve una sola vez.',
      heading: 'Únete al equipo de {{organizacion}}',
      body:
        'Hola,\n\n**{{invitado_por}}** te invitó a unirte a **{{organizacion}}** en AdoptaFácil ' +
        'con el cargo de **{{cargo}}**.\n\n' +
        'Con este cargo podrás:\n\n' +
        '{{funciones}}\n\n' +
        'Crea tu cuenta con el botón: te pediremos tu nombre, una contraseña y aceptar los términos ' +
        'y la autorización de tratamiento de datos. **El enlace caduca el {{vence}} y sirve una sola vez.**',
      ctaLabel: 'Crear mi cuenta',
      footerNote:
        'Si no esperabas esta invitación, ignora este correo: sin abrir el enlace no se crea ninguna cuenta. ' +
        'AdoptaFácil nunca te pedirá tu contraseña por correo.',
    },
  },
  {
    event: 'platform.team_invitation',
    label: 'Invitación al equipo de plataforma',
    description:
      'Se envía cuando el equipo de plataforma aprueba sumar a una persona como administradora de AdoptaFácil.',
    audience: 'La persona invitada al equipo de plataforma',
    category: 'transactional',
    theme: 'security',
    required: true,
    variables: [
      v('cargo', 'Cargo que le dan', 'Administrador/a de plataforma'),
      v(
        'funciones',
        'Qué podrá hacer con ese cargo (lista)',
        '• Revisar y aprobar organizaciones y sus documentos\n• Moderar la comunidad y atender reportes',
      ),
      v('vence', 'Fecha y hora en que caduca el enlace', '2026-11-07T22:12:00.000Z', 'date'),
      v(
        'enlace',
        'Enlace para crear la cuenta (un solo uso)',
        'https://adoptafacil.co/invitacion#token=demo',
        'url',
      ),
    ],
    ctaUrlVariable: 'enlace',
    defaults: {
      subject: 'Te invitaron al equipo de plataforma de AdoptaFácil',
      preheader: 'Crea tu cuenta. El enlace caduca el {{vence}} y sirve una sola vez.',
      heading: 'Únete al equipo de AdoptaFácil',
      body:
        'Hola,\n\nTe invitaron a unirte al equipo que opera la plataforma AdoptaFácil con el cargo de ' +
        '**{{cargo}}**.\n\n' +
        'Con este cargo podrás:\n\n' +
        '{{funciones}}\n\n' +
        'Al entrar por primera vez te pediremos activar la verificación en dos pasos con una app de ' +
        'autenticación en tu celular. **El enlace caduca el {{vence}} y sirve una sola vez.**',
      ctaLabel: 'Crear mi cuenta',
      footerNote:
        'Si no esperabas esta invitación, ignora este correo: sin abrir el enlace no se crea ninguna cuenta. ' +
        'AdoptaFácil nunca te pedirá tu contraseña ni tus códigos por correo.',
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
    event: 'coffee.purchase_receipt',
    label: 'Comprobante de compra de café',
    description:
      'Se envía cuando se confirma el pago de una compra de café de AdoptaFácil hecha desde el QR.',
    audience: 'La persona que compró el café',
    category: 'transactional',
    theme: 'donation',
    required: false,
    variables: [
      v('producto', 'Presentación', 'Café San Pedro 250 g'),
      v('lote', 'Código del lote', 'L2-2026'),
      v('cantidad', 'Bolsas', '2', 'number'),
      v('total', 'Total pagado', '56000', 'money'),
      v('campana', 'Campaña que eligió', 'Cirugía de Luna'),
      v('organizacion_campana', 'Organización de la campaña', 'Fundación Huellitas de Amor'),
      v('aporte', 'Aporte de AdoptaFácil a la campaña', '4400', 'money'),
      v('referencia', 'Referencia del pedido', 'cafe-abcdefghjkmnpqrstuvwxyz2'),
      v(
        'enlace',
        'Enlace al estado del pedido',
        'https://adoptafacil.org/cafe/pedido/cafe-abcdefghjkmnpqrstuvwxyz2',
        'url',
      ),
    ],
    ctaUrlVariable: 'enlace',
    defaults: {
      subject: 'Tu café va en camino a apoyar a {{campana}} ☕',
      preheader: 'Pago confirmado. AdoptaFácil aporta {{aporte}} a la campaña que elegiste.',
      heading: '¡Gracias por tu compra!',
      body:
        'Hola,\n\nTu pago fue confirmado: **{{cantidad}} × {{producto}}** (lote {{lote}}), ' +
        'total **{{total}}**.\n\n' +
        'Con tu compra, **AdoptaFácil aporta {{aporte}}** a la campaña **{{campana}}** de ' +
        '{{organizacion_campana}}. Es el 20 % del margen bruto de cada bolsa (precio de venta menos ' +
        'precio de compra), y lo entrega AdoptaFácil.\n\n' +
        'Referencia de tu pedido: {{referencia}}. Te avisaremos cuando enviemos tu café.',
      ctaLabel: 'Ver mi pedido',
      footerNote:
        'Este correo es tu comprobante de compra. No es un certificado de donación: el aporte lo hace AdoptaFácil.',
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
    variables: [
      ORG,
      ANIMAL,
      v('monto', 'Valor del periodo', '30000', 'money'),
      v(
        'enlace',
        'Enlace para pagar ("Mis apadrinamientos")',
        'https://adoptafacil.co/apadrinar',
        'url',
      ),
    ],
    ctaUrlVariable: 'enlace',
    defaults: {
      subject: 'Nuevo cobro de tu apadrinamiento de {{animal}}',
      preheader: 'Completa el pago para mantener tu apadrinamiento activo.',
      heading: 'Es momento de renovar tu apoyo',
      body:
        'Hola,\n\nSe generó el cobro del nuevo periodo de tu apadrinamiento de **{{animal}}** en **{{organizacion}}** por **{{monto}}**.\n\n' +
        'Págalo desde "Mis apadrinamientos" con el botón **Pagar este mes**: el dinero llega directo a {{organizacion}}.',
      ctaLabel: 'Pagar este mes',
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
    variables: [
      ORG,
      ANIMAL,
      v('monto', 'Valor del periodo', '30000', 'money'),
      v(
        'enlace',
        'Enlace para pagar ("Mis apadrinamientos")',
        'https://adoptafacil.co/apadrinar',
        'url',
      ),
    ],
    ctaUrlVariable: 'enlace',
    defaults: {
      subject: 'Recordatorio: pago de apadrinamiento pendiente',
      preheader: '{{animal}} sigue contando contigo.',
      heading: 'Tu pago sigue pendiente',
      body:
        'Hola,\n\nEl pago de tu apadrinamiento de **{{animal}}** en **{{organizacion}}** por **{{monto}}** sigue pendiente. ' +
        'Págalo desde "Mis apadrinamientos" con el botón **Pagar este mes**.',
      ctaLabel: 'Pagar este mes',
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
    variables: [
      ORG,
      ANIMAL,
      v('monto', 'Valor del periodo', '30000', 'money'),
      v(
        'enlace',
        'Enlace para pagar ("Mis apadrinamientos")',
        'https://adoptafacil.co/apadrinar',
        'url',
      ),
    ],
    ctaUrlVariable: 'enlace',
    defaults: {
      subject: 'Último aviso: tu apadrinamiento será suspendido',
      preheader: 'Completa el pago para no perder tu apadrinamiento.',
      heading: 'Último aviso',
      body:
        'Hola,\n\nEl pago de tu apadrinamiento de **{{animal}}** en **{{organizacion}}** por **{{monto}}** sigue pendiente. ' +
        'Si no se completa pronto, **el apadrinamiento se suspenderá automáticamente**.',
      ctaLabel: 'Pagar este mes',
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
    event: 'adoption.delivery_code',
    label: 'Código para confirmar la entrega',
    description:
      'Se envía al adoptante cuando la organización registra la entrega del animal, con el código para confirmarla.',
    audience: 'La familia adoptante',
    category: 'transactional',
    theme: 'adoption',
    required: false,
    variables: [
      v('nombre', 'Nombre de quien recibe', 'Ana María'),
      ANIMAL,
      ORG,
      v('codigo', 'Código de confirmación', '482913'),
      v('minutos', 'Minutos de vigencia del código', '30'),
      v(
        'enlace',
        'Enlace para confirmar la entrega',
        'https://adoptafacil.co/mis-adopciones/entrega/abc?codigo=482913',
        'url',
      ),
    ],
    ctaUrlVariable: 'enlace',
    defaults: {
      subject: 'Confirma que recibiste a {{animal}}',
      preheader: 'Tu código para confirmar la entrega es {{codigo}}.',
      heading: '¡Llegó el día! 🐾',
      body:
        'Hola {{nombre}},\n\n**{{organizacion}}** registró la entrega de **{{animal}}**. ' +
        'Para confirmarla, abre el enlace con tu sesión iniciada o escribe este código:\n\n**{{codigo}}**\n\n' +
        'El código vence en {{minutos}} minutos. Al confirmar recibes la ficha de {{animal}} con sus vacunas y cuidados.',
      ctaLabel: 'Confirmar la entrega',
      footerNote: 'Si no estás recibiendo a {{animal}} en este momento, ignora este correo.',
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
    event: 'volunteering.opportunity_rescheduled',
    label: 'Jornada de voluntariado reprogramada',
    description:
      'Se envía a cada persona inscrita (pendiente o aceptada) cuando la organización cambia las fechas o los días de la jornada.',
    audience: 'Las personas inscritas en la jornada',
    category: 'transactional',
    theme: 'volunteering',
    required: false,
    variables: [
      v('nombre', 'Nombre del voluntario', 'Carlos'),
      v('oportunidad', 'Jornada', 'Jornada de baño y paseo'),
      ORG,
      v('fechas', 'Nuevas fechas', 'del 22 de noviembre al 23 de noviembre de 2026'),
      v('dias', 'Días de jornada', 'sábado 22 de noviembre y domingo 23 de noviembre'),
      v('motivo', 'Motivo', 'Pronóstico de lluvia fuerte para este fin de semana.'),
    ],
    defaults: {
      subject: 'Cambió la fecha de "{{oportunidad}}"',
      preheader: 'La jornada ahora es {{fechas}}.',
      heading: 'Tu jornada cambió de fecha 📅',
      body:
        'Hola {{nombre}},\n\n{{organizacion}} reprogramó **"{{oportunidad}}"**. La jornada ahora es **{{fechas}}**.\n\n' +
        'Días de jornada: {{dias}}\n\nMotivo: {{motivo}}\n\n' +
        'Tu inscripción sigue vigente. Si ya no puedes asistir, avísale a la organización.',
    },
  },
  {
    event: 'volunteering.opportunity_cancelled',
    label: 'Jornada de voluntariado cancelada',
    description:
      'Se envía a cada persona inscrita (pendiente o aceptada) cuando la organización cancela la jornada.',
    audience: 'Las personas inscritas en la jornada',
    category: 'transactional',
    theme: 'volunteering',
    required: false,
    variables: [
      v('nombre', 'Nombre del voluntario', 'Carlos'),
      v('oportunidad', 'Jornada', 'Jornada de baño y paseo'),
      ORG,
      v('motivo', 'Motivo', 'No conseguimos el transporte para los perritos.'),
    ],
    defaults: {
      subject: '"{{oportunidad}}" fue cancelada',
      preheader: 'Gracias por querer ayudar: hay más jornadas esperándote.',
      heading: 'La jornada se canceló',
      body:
        'Hola {{nombre}},\n\n{{organizacion}} canceló **"{{oportunidad}}"**.\n\nMotivo: {{motivo}}\n\n' +
        'Tu inscripción quedó cerrada. Gracias por querer ayudar: en AdoptaFácil hay más jornadas esperándote.',
    },
  },
  {
    event: 'resources.open_offer_claimed',
    label: 'Una organización tomó tu ofrecimiento',
    description:
      'Se envía cuando una organización toma lo que alguien dejó ofrecido en el banco de recursos.',
    audience: 'Quien dejó el ofrecimiento abierto',
    category: 'transactional',
    theme: 'community',
    required: false,
    variables: [
      v('nombre', 'Nombre de quien ofrece', 'Laura'),
      v('ofrecimiento', 'Lo que ofreció', '2 cobijas medianas'),
      ORG,
    ],
    defaults: {
      subject: '{{organizacion}} quiere recibir lo que ofreciste',
      preheader: 'Coordinarán contigo la entrega.',
      heading: '¡Tu ofrecimiento ya tiene destino!',
      body:
        'Hola {{nombre}},\n\n**{{organizacion}}** tomó tu ofrecimiento **"{{ofrecimiento}}"** en el banco de recursos de AdoptaFácil.\n\n' +
        'Lo verás en "Mis ofertas" con el estado de la entrega. La organización coordinará contigo cómo y cuándo entregarlo. ¡Gracias por compartir!',
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
      v('nombre', 'Nombre del donante (o "amigo(a)" si no lo dio)', 'Laura'),
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
      body: 'Hola {{nombre}},\n\nComo apoyaste a **{{organizacion}}**, queremos contarte cómo va:\n\n{{mensaje}}',
    },
  },
  {
    event: 'org.urgent_announcement',
    label: 'Anuncio urgente de una organización',
    description:
      'Lo envía la organización a sus propios donantes, adoptantes o voluntarios (por ejemplo, un rescate que necesita hogar temporal hoy).',
    audience: 'Contactos de la organización que no se han dado de baja de ella',
    category: 'bulk',
    theme: 'alert',
    required: false,
    variables: [
      ORG,
      v('nombre', 'Nombre de la persona (o "amigo(a)")', 'Laura'),
      v('titulo', 'Título del anuncio', 'Necesitamos hogar temporal para 5 cachorros'),
      v(
        'mensaje',
        'Mensaje',
        'Hoy rescatamos una camada en Suba. Si puedes recibir uno por dos semanas, escríbenos.',
      ),
    ],
    defaults: {
      subject: 'Urgente: {{titulo}}',
      preheader: '{{organizacion}} necesita tu ayuda',
      heading: '{{titulo}}',
      body: 'Hola {{nombre}},\n\n**{{organizacion}}** te escribe porque has apoyado su trabajo:\n\n{{mensaje}}',
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
  // -------------------------------------------------------------------------
  // Correos que antes salían en texto plano (sin la plantilla de marca). Cada
  // uno conserva su texto plano como respaldo si la plantilla no se puede armar.
  // -------------------------------------------------------------------------
  {
    event: 'auth.mfa_enabled',
    label: 'Verificación en dos pasos activada',
    description:
      'Se envía cuando una persona del equipo de plataforma activa la verificación en dos pasos.',
    audience: 'La persona dueña de la cuenta',
    category: 'transactional',
    theme: 'security',
    required: false,
    variables: [],
    defaults: {
      subject: 'Activaste la verificación en dos pasos en AdoptaFácil',
      preheader: 'Desde ahora te pediremos también el código de tu app.',
      heading: 'Tu cuenta quedó más protegida',
      body:
        'Hola,\n\nLa **verificación en dos pasos** quedó activa en tu cuenta del equipo de AdoptaFácil. ' +
        'Desde ahora, además de tu contraseña, te pediremos el código de tu app de autenticación.',
      footerNote:
        'Si no fuiste tú, avisa de inmediato a tu líder de equipo para que bloquee la cuenta.',
    },
  },
  {
    event: 'legal.acceptance_recorded',
    label: 'Constancia de aceptación de términos',
    description:
      'Se envía cuando una persona acepta los términos, la política de datos u otro documento legal.',
    audience: 'La persona que aceptó',
    category: 'transactional',
    theme: 'security',
    required: false,
    variables: [
      v('fecha', 'Fecha y hora de la aceptación', '2026-11-21T15:30:00.000Z', 'date'),
      v(
        'documentos',
        'Documentos aceptados (lista con su versión)',
        '• Términos y condiciones (versión 2026-11)\n• Política de tratamiento de datos (versión 2026-11)',
      ),
      v(
        'enlace',
        'Enlace a "Mis autorizaciones"',
        'https://adoptafacil.co/mis-autorizaciones',
        'url',
      ),
    ],
    ctaUrlVariable: 'enlace',
    defaults: {
      subject: 'Registramos tu aceptación en AdoptaFácil',
      preheader: 'Guardamos la versión exacta de cada documento que aceptaste.',
      heading: 'Quedó registrada tu aceptación',
      body:
        'Hola,\n\nEl **{{fecha}}** quedó registrada tu aceptación de estos documentos:\n\n' +
        '{{documentos}}\n\n' +
        'Guardamos la versión exacta de cada texto, la fecha y hora, y la dirección IP y el navegador ' +
        'desde los que aceptaste. Puedes consultar tu historial y retirar las autorizaciones opcionales cuando quieras.',
      ctaLabel: 'Ver mis autorizaciones',
      footerNote:
        'Para ejercer tus derechos sobre tus datos personales (Ley 1581 de 2012) escribe a adoptafacil.oficial@gmail.com.',
    },
  },
  {
    event: 'org.signer_welcome',
    label: 'Bienvenida a contador o revisor fiscal',
    description:
      'Se envía cuando una organización vincula a su contador público o revisor fiscal como firmante.',
    audience: 'El contador o revisor fiscal (no necesita cuenta)',
    category: 'transactional',
    theme: 'documents',
    required: false,
    variables: [
      ORG,
      v('nombre', 'Nombre de la persona', 'Carlos Pérez'),
      v('cargo', 'Cargo de firmante', 'contador público'),
    ],
    defaults: {
      subject: '{{organizacion}} te vinculó como su {{cargo}} en AdoptaFácil',
      preheader: 'No necesitas cuenta: te escribiremos cuando necesiten tu firma.',
      heading: 'Eres el {{cargo}} de {{organizacion}}',
      body:
        'Hola {{nombre}},\n\n**{{organizacion}}** te registró como su **{{cargo}}** en AdoptaFácil, la ' +
        'plataforma con la que lleva sus adopciones y donaciones.\n\n' +
        'No necesitas crear una cuenta ni una contraseña. Así funciona:\n\n' +
        '• Cuando la organización necesite tu firma (por ejemplo, el cierre mensual del libro de donaciones o el informe de donaciones), te llegará un correo con un enlace personal de un solo uso.\n' +
        '• La primera vez registras tu firma (dibujada o con una foto sobre papel blanco) y autorizas que se guarde cifrada solo en esta organización.\n' +
        '• Las siguientes veces solo revisas el documento y lo apruebas con tu número de documento. Tu firma se estampa únicamente en lo que tú apruebes, uno por uno; también puedes rechazarlo.\n\n' +
        'La organización también puede compartirte su información contable de cada mes con un enlace seguro. ' +
        'AdoptaFácil prepara y concilia la información; **no firma ni certifica por ti**.',
      footerNote:
        'Si no reconoces a {{organizacion}} o no eres su {{cargo}}, ignora este correo: sin tu aprobación, tu firma nunca se usa.',
    },
  },
  {
    event: 'reports.signature_request',
    label: 'Solicitud de firma de un documento',
    description:
      'Se envía a cada firmante (representante legal, contador o revisor fiscal) cuando la organización genera un documento que necesita su firma.',
    audience: 'La persona que debe firmar',
    category: 'transactional',
    theme: 'documents',
    // Sin este correo el contador o revisor fiscal no recibe su enlace de firma.
    required: true,
    variables: [
      ORG,
      v('cargo', 'Cargo de quien firma', 'revisor fiscal'),
      v('documento', 'Qué documento es', 'el informe de donaciones'),
      v('folio', 'Folio del documento', 'INF-2026-0042'),
      v(
        'instrucciones',
        'Cómo firmar (depende de si tiene cuenta y si es su primera vez)',
        'Ábrelo para ver el documento y aprobarlo o rechazarlo. El enlace sirve una sola vez y vence en 7 días.',
      ),
      v(
        'enlace',
        'Enlace para revisar y firmar',
        'https://adoptafacil.co/firmar#token=demo',
        'url',
      ),
    ],
    ctaUrlVariable: 'enlace',
    defaults: {
      subject: '{{organizacion}} necesita tu firma como {{cargo}}',
      preheader: '{{documento}} · folio {{folio}}',
      heading: 'Tienes un documento por firmar',
      body:
        'Hola,\n\n**{{organizacion}}** generó {{documento}} con folio **{{folio}}** y necesita tu firma como **{{cargo}}**.\n\n' +
        '{{instrucciones}}\n\n' +
        'Mientras no lo autorices, el documento queda pendiente de firma y no se emite.',
      ctaLabel: 'Revisar y firmar',
      footerNote:
        'Si no esperabas este correo, ignóralo: sin tu aprobación no se estampa tu firma.',
    },
  },
  {
    event: 'accounting.share',
    label: 'Contabilidad compartida con el contador',
    description:
      'Se envía cuando la organización comparte el libro auxiliar de donaciones de un mes con su contador o revisor fiscal.',
    audience: 'El contador o revisor fiscal (no necesita cuenta)',
    category: 'transactional',
    theme: 'documents',
    // El enlace solo llega por correo.
    required: true,
    variables: [
      ORG,
      v('nombre', 'Nombre de la persona', 'Carlos Pérez'),
      v('cargo', 'Cargo de firmante', 'contador público'),
      v('periodo', 'Mes compartido', 'octubre de 2026'),
      v('dias', 'Días que dura el enlace', '30', 'number'),
      v(
        'enlace',
        'Enlace personal a la contabilidad',
        'https://adoptafacil.co/contabilidad-compartida#token=demo',
        'url',
      ),
    ],
    ctaUrlVariable: 'enlace',
    defaults: {
      subject: '{{organizacion}} te compartió su contabilidad de donaciones de {{periodo}}',
      preheader: 'Libro auxiliar, conciliación y exporte. El enlace vence en {{dias}} días.',
      heading: 'Contabilidad de {{periodo}}',
      body:
        'Hola {{nombre}},\n\n**{{organizacion}}** te compartió, como su {{cargo}}, el libro auxiliar de donaciones de **{{periodo}}**:\n\n' +
        '• Renglones de cada donación\n• Conciliación contra Mercado Pago\n• Exporte para tu programa contable\n\n' +
        'No necesitas cuenta. **El enlace es personal y vence en {{dias}} días.**\n\n' +
        'AdoptaFácil prepara y concilia la información; no firma ni certifica por ti. Si la organización te pide ' +
        'firmar el cierre del mes, te llegará otro correo con un enlace de firma.',
      ctaLabel: 'Abrir la contabilidad',
      footerNote: 'Si no esperabas este correo, ignóralo.',
    },
  },
  {
    event: 'plan.renewal_due',
    label: 'Plan por vencer (pago manual)',
    description: 'Se envía 7 días antes de que venza un plan pagado a mano, que nadie cobra solo.',
    audience: 'Las personas dueñas de la organización',
    category: 'transactional',
    theme: 'plan',
    required: false,
    variables: [
      ORG,
      v('plan', 'Nombre del plan', 'Pro'),
      v('fecha', 'Fecha de vencimiento', '2026-11-28T05:00:00.000Z', 'day'),
      v('enlace', 'Enlace a "Plan"', 'https://adoptafacil.co/organizacion/plan', 'url'),
    ],
    ctaUrlVariable: 'enlace',
    defaults: {
      subject: 'Tu plan {{plan}} vence pronto',
      preheader: 'Vence el {{fecha}}. Renuévalo para no perder sus funciones.',
      heading: 'Tu plan {{plan}} vence pronto',
      body:
        'Hola, equipo de **{{organizacion}}**:\n\nTu plan **{{plan}}** de AdoptaFácil vence el **{{fecha}}**. ' +
        'Como lo pagaste a mano, nadie lo cobra automáticamente: renuévalo desde la sección Plan.',
      ctaLabel: 'Renovar mi plan',
      footerNote:
        'No se borra nada: si tu plan termina, tus animales, adopciones y documentos siguen ahí y tu portal vuelve a una plantilla gratuita.',
    },
  },
  {
    event: 'plan.payment_failed',
    label: 'No se pudo cobrar el plan',
    description:
      'Se envía cuando Mercado Pago no pudo cobrar el plan o el periodo pagado ya terminó.',
    audience: 'Las personas dueñas de la organización',
    category: 'transactional',
    theme: 'alert',
    required: false,
    variables: [
      ORG,
      v('plan', 'Nombre del plan', 'Pro'),
      v('fecha', 'Hasta cuándo sigue funcionando', '2026-11-28T05:00:00.000Z', 'day'),
      v('enlace', 'Enlace a "Plan"', 'https://adoptafacil.co/organizacion/plan', 'url'),
    ],
    ctaUrlVariable: 'enlace',
    defaults: {
      subject: 'No pudimos cobrar tu plan {{plan}}',
      preheader: 'Sigue funcionando hasta el {{fecha}}.',
      heading: 'No pudimos cobrar tu plan {{plan}}',
      body:
        'Hola, equipo de **{{organizacion}}**:\n\nNo pudimos cobrar tu plan **{{plan}}**. Sigue funcionando hasta el **{{fecha}}**; ' +
        'revisa tu medio de pago en Mercado Pago o paga de nuevo desde la sección Plan.',
      ctaLabel: 'Revisar mi plan',
      footerNote:
        'No se borra nada: si tu plan termina, tus animales, adopciones y documentos siguen ahí y tu portal vuelve a una plantilla gratuita.',
    },
  },
  {
    event: 'plan.ending',
    label: 'Plan cancelado por terminar',
    description: 'Se envía 7 días antes de que termine un plan que la organización canceló.',
    audience: 'Las personas dueñas de la organización',
    category: 'transactional',
    theme: 'plan',
    required: false,
    variables: [
      ORG,
      v('plan', 'Nombre del plan', 'Pro'),
      v('fecha', 'Último día del plan', '2026-11-28T05:00:00.000Z', 'day'),
      v('enlace', 'Enlace a "Plan"', 'https://adoptafacil.co/organizacion/plan', 'url'),
    ],
    ctaUrlVariable: 'enlace',
    defaults: {
      subject: 'Tu plan {{plan}} termina pronto',
      preheader: 'Lo puedes usar hasta el {{fecha}} y no se te volverá a cobrar.',
      heading: 'Tu plan {{plan}} termina pronto',
      body:
        'Hola, equipo de **{{organizacion}}**:\n\nCancelaste tu plan **{{plan}}**; lo puedes usar hasta el **{{fecha}}** ' +
        'y no se te volverá a cobrar. Si cambias de opinión, elige un plan cuando quieras.',
      ctaLabel: 'Ver planes',
      footerNote:
        'No se borra nada: si tu plan termina, tus animales, adopciones y documentos siguen ahí y tu portal vuelve a una plantilla gratuita.',
    },
  },
  {
    event: 'plan.free_pro_ending',
    label: 'Termina el Pro gratis',
    description:
      'Se envía cuando termina la prueba gratis de Pro de una organización nueva o el Pro gratis del lanzamiento.',
    audience: 'Las personas dueñas de la organización',
    category: 'transactional',
    theme: 'plan',
    required: false,
    variables: [
      ORG,
      v('que', 'Qué termina', 'Tu prueba gratis de Pro'),
      v('cuando', 'Cuándo termina', 'termina el 28 de noviembre de 2026'),
      v('enlace', 'Enlace a "Plan"', 'https://adoptafacil.co/organizacion/plan', 'url'),
    ],
    ctaUrlVariable: 'enlace',
    defaults: {
      subject: '{{que}} {{cuando}}',
      preheader: 'Después tu organización pasa al plan Gratis. No se borra nada.',
      heading: '{{que}} {{cuando}}',
      body:
        'Hola, equipo de **{{organizacion}}**:\n\n{{que}} en AdoptaFácil **{{cuando}}**. Después tu organización pasa al plan Gratis.\n\n' +
        'No se borra nada: tus animales, adopciones y documentos siguen ahí. Si tu portal usa una plantilla Pro, ' +
        'vuelve solo a una gratuita; la que elegiste queda guardada y regresa en cuanto actives Crece o Pro.',
      ctaLabel: 'Elegir mi plan',
    },
  },
  {
    event: 'org.rte_expiring',
    label: 'RTE por vencer',
    description:
      'Se envía a 60 y a 30 días de que venza el Régimen Tributario Especial reconocido a la organización.',
    audience: 'Las personas dueñas de la organización',
    category: 'transactional',
    theme: 'documents',
    required: false,
    variables: [
      ORG,
      v('fecha', 'Fecha de vencimiento del RTE', '2027-03-31T05:00:00.000Z', 'day'),
      v('dias', 'Días que faltan', '30', 'number'),
      v(
        'enlace',
        'Enlace para subir el RUT',
        'https://adoptafacil.co/organizacion/formalizacion',
        'url',
      ),
    ],
    ctaUrlVariable: 'enlace',
    defaults: {
      subject: 'Tu RTE vence pronto: sube tu RUT actualizado',
      preheader: 'Vale hasta el {{fecha}} (faltan unos {{dias}} días).',
      heading: 'Actualiza tu RUT antes del {{fecha}}',
      body:
        'Hola, equipo de **{{organizacion}}**:\n\nCada año la DIAN pide actualizar el registro en el Régimen Tributario Especial. ' +
        'El RTE que reconocimos para tu organización vale hasta el **{{fecha}}** (faltan unos {{dias}} días).\n\n' +
        'Cuando hagas la actualización, descarga tu RUT reciente con la **responsabilidad 04** y súbelo. ' +
        'Si no lo recibimos antes de esa fecha, pausamos solo los certificados de donación con beneficio tributario hasta que lo apruebe el equipo.',
      ctaLabel: 'Subir mi RUT',
      footerNote:
        'No se borra nada: tus donaciones, comprobantes y certificados ya emitidos siguen ahí. Solo cambia lo que se emite desde ahora.',
    },
  },
  {
    event: 'org.rte_expired',
    label: 'RTE vencido',
    description:
      'Se envía cuando vence el RTE sin un RUT actualizado aprobado: se pausan los certificados con beneficio tributario.',
    audience: 'Las personas dueñas de la organización',
    category: 'transactional',
    theme: 'alert',
    required: false,
    variables: [
      ORG,
      v('fecha', 'Fecha en que venció', '2026-03-31T05:00:00.000Z', 'day'),
      v(
        'enlace',
        'Enlace para subir el RUT',
        'https://adoptafacil.co/organizacion/formalizacion',
        'url',
      ),
    ],
    ctaUrlVariable: 'enlace',
    defaults: {
      subject: 'Tu RTE venció: pausamos los certificados con beneficio tributario',
      preheader: 'Sube tu RUT reciente para reactivarlos.',
      heading: 'Tu RTE venció',
      body:
        'Hola, equipo de **{{organizacion}}**:\n\nEl Régimen Tributario Especial que reconocimos para tu organización venció el **{{fecha}}** ' +
        'y no hemos recibido un RUT actualizado. Desde hoy tus donantes reciben el comprobante sin beneficio tributario en lugar del certificado.\n\n' +
        'Para reactivarlo, sube tu RUT reciente con la **responsabilidad 04**. Apenas el equipo lo apruebe, vuelves a emitir certificados.',
      ctaLabel: 'Subir mi RUT',
      footerNote:
        'No se borra nada: tus donaciones, comprobantes y certificados ya emitidos siguen ahí. Solo cambia lo que se emite desde ahora.',
    },
  },
  {
    event: 'animals.clinical_reminder',
    label: 'Recordatorio clínico de un animal',
    description:
      'Se envía cuando se acerca o venció una vacuna, desparasitación u otro control de un animal de la organización.',
    audience: 'Dueños, administración y veterinaria de la organización',
    category: 'transactional',
    theme: 'health',
    required: false,
    variables: [
      ORG,
      ANIMAL,
      v('tipo', 'Qué toca', 'vacuna'),
      v('fecha', 'Fecha en que vence', '2026-11-25T05:00:00.000Z', 'day'),
      v('enlace', 'Enlace a la ficha del animal', 'https://adoptafacil.co/animales/demo', 'url'),
    ],
    ctaUrlVariable: 'enlace',
    defaults: {
      subject: 'Recordatorio: {{tipo}} de {{animal}}',
      preheader: 'Vence el {{fecha}}.',
      heading: '{{animal}} tiene un control pendiente',
      body:
        'Hola, equipo de **{{organizacion}}**:\n\nA **{{animal}}** le toca **{{tipo}}**; vence el **{{fecha}}**.\n\n' +
        'Cuando lo atiendan, márquenlo como atendido en su ficha para que deje de aparecer en los recordatorios.',
      ctaLabel: 'Ver la ficha',
    },
  },
  {
    event: 'coffee.refund_notice',
    label: 'Café: pago sin bolsas disponibles',
    description:
      'Se envía cuando un pago de café se aprueba después de que se agotó el lote: se devolverá el dinero.',
    audience: 'La persona que compró',
    category: 'transactional',
    theme: 'alert',
    required: false,
    variables: [
      v('referencia', 'Referencia del pedido', 'CAF-2026-0042'),
      v('enlace', 'Enlace al pedido', 'https://adoptafacil.co/cafe/pedido/CAF-2026-0042', 'url'),
    ],
    ctaUrlVariable: 'enlace',
    defaults: {
      subject: 'Tu pago de café llegó cuando ya no quedaban bolsas',
      preheader: 'Te devolveremos el dinero completo.',
      heading: 'Te devolveremos tu dinero',
      body:
        'Hola,\n\nTu pago se aprobó cuando las bolsas de este lote ya se habían vendido. ' +
        '**Te devolveremos el dinero completo** por el mismo medio de pago y te escribiremos para confirmarlo.\n\n' +
        'Referencia: **{{referencia}}**',
      ctaLabel: 'Ver mi pedido',
    },
  },
  {
    event: 'sponsorship.payment_received',
    label: 'Pago de apadrinamiento recibido',
    description:
      'Se envía cuando llega el pago de un apadrinamiento (el primero o el de un nuevo mes).',
    audience: 'La persona que apadrina',
    category: 'transactional',
    theme: 'sponsorship',
    required: false,
    variables: [
      ORG,
      ANIMAL,
      v('nombre', 'Nombre de la persona', 'Laura'),
      v('monto', 'Valor pagado', '30000', 'money'),
      v('mes', 'Mes pagado', 'noviembre de 2026'),
      v('enlace', 'Enlace a "Mis apadrinamientos"', 'https://adoptafacil.co/apadrinar', 'url'),
    ],
    ctaUrlVariable: 'enlace',
    defaults: {
      subject: 'Recibimos tu apadrinamiento de {{mes}} para {{animal}}',
      preheader: 'Tu pago llegó directo a {{organizacion}}.',
      heading: '¡Gracias, {{nombre}}!',
      body:
        'Hola {{nombre}},\n\nTu pago de **{{monto}}** del apadrinamiento de **{{animal}}** ({{mes}}) llegó directo a **{{organizacion}}**.\n\n' +
        'Cada mes te avisaremos cuando toque el siguiente pago. ¡Gracias por seguir ahí!',
      ctaLabel: 'Ver mi apadrinamiento',
    },
  },
  {
    event: 'plan.activated',
    label: 'Plan de pago activado',
    description:
      'Se envía cuando Mercado Pago aprueba el cobro de un plan Crece o Pro (contratar, subir o bajar de plan) o la plataforma lo activa a mano.',
    audience: 'Dueños de la organización',
    category: 'transactional',
    theme: 'team',
    required: false,
    variables: [
      ORG,
      v('plan', 'Plan activado', 'Pro'),
      v('vence', 'Fin del periodo pagado', '2026-12-21T05:00:00.000Z', 'date'),
      v(
        'beneficios',
        'Lo que queda habilitado (lista)',
        '• Dominio propio (www.turefugio.org)\n• Soporte prioritario por WhatsApp',
      ),
      v('enlace', 'Enlace a Plan y facturación', 'https://adoptafacil.co/organizacion/plan', 'url'),
    ],
    ctaUrlVariable: 'enlace',
    defaults: {
      subject: 'Tu plan {{plan}} ya está activo',
      preheader: 'Todo lo del plan {{plan}} quedó habilitado para {{organizacion}}.',
      heading: 'Bienvenidos al plan {{plan}}',
      body:
        'Hola, equipo de **{{organizacion}}**:\n\n' +
        'Recibimos el pago y tu plan **{{plan}}** ya está activo. No tienes que hacer nada más: ' +
        'desde ahora tienes habilitado:\n\n{{beneficios}}\n\n' +
        'Tu periodo pagado va hasta el **{{vence}}**. Puedes ver tu plan, cambiarlo o cancelarlo cuando quieras.',
      ctaLabel: 'Ver mi plan',
      footerNote:
        'Este cobro es de AdoptaFácil por el software; nunca toca las donaciones de tu organización.',
    },
  },
];

const BY_EVENT = new Map(EMAIL_CATALOG.map((d) => [d.event, d]));

export function getEmailEvent(event: string): EmailEventDefinition | undefined {
  return BY_EVENT.get(event as EmailEventKey);
}
