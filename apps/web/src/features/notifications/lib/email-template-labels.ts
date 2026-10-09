import type { EmailCategory, EmailTheme } from '@adoptafacil/contracts';

export const CATEGORY_LABELS: Record<EmailCategory, { title: string; hint: string }> = {
  transactional: {
    title: 'Correos de servicio',
    hint: 'Llegan por algo que la persona hizo (donar, apadrinar, adoptar, inscribirse). No son publicidad.',
  },
  bulk: {
    title: 'Envíos masivos',
    hint: 'Llegan a muchas personas a la vez. Siempre incluyen el enlace para darse de baja y nunca llegan a quien se dio de baja (Ley 1581 de 2012).',
  },
};

export const THEME_ICONS: Record<EmailTheme, string> = {
  security: '🔒',
  donation: '💛',
  sponsorship: '🐾',
  adoption: '🏡',
  volunteering: '🤝',
  community: '📣',
  alert: '⏰',
};

export const FIELD_HELP = {
  subject: 'Lo primero que se ve en la bandeja de entrada.',
  preheader: 'Frase corta que aparece al lado del asunto en la bandeja.',
  heading: 'Título grande dentro del correo.',
  body: 'Deja una línea en blanco para separar párrafos. Usa **así** para resaltar en negrita.',
  ctaLabel: 'Texto del botón. El enlace del botón lo pone AdoptaFácil y no se puede cambiar.',
  footerNote: 'Recuadro opcional al final del mensaje.',
} as const;
