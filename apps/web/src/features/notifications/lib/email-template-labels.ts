import type { EmailAccentColor, EmailCategory, EmailTheme } from '@adoptafacil/contracts';

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
  team: '👥',
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

/** Same hex values as the API email layout (decorative accent only). */
export const ACCENT_COLOR_LABELS: Record<EmailAccentColor, { label: string; hex: string }> = {
  teal: { label: 'Verde agua', hex: '#25BAA6' },
  navy: { label: 'Azul noche', hex: '#202D3E' },
  coral: { label: 'Coral', hex: '#FF8F66' },
  gold: { label: 'Dorado', hex: '#F2B84B' },
  blue: { label: 'Azul', hex: '#4F7CAC' },
  red: { label: 'Rojo', hex: '#E5604A' },
  purple: { label: 'Morado', hex: '#8E6CC8' },
  green: { label: 'Verde', hex: '#4C9A52' },
};
