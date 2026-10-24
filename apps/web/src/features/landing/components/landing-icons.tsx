import type { SVGProps } from 'react';

/** Íconos de trazo (24×24) propios de la landing: sin dependencias nuevas. */
type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const IconSearch = (p: IconProps) => (
  <svg {...base} {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.2-4.2" />
  </svg>
);
export const IconChat = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M4 5h16v10H9l-5 4V5z" />
    <path d="M8 9h8M8 12h5" />
  </svg>
);
export const IconSignature = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M4 19h16" />
    <path d="M5 15c2-4 3.5-8 5-8s-.5 6 1.5 6 2.5-3 4-3 1 3 3.5 3" />
  </svg>
);
export const IconHome = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M4 11l8-6 8 6v8a1 1 0 01-1 1h-4v-5h-6v5H5a1 1 0 01-1-1v-8z" />
  </svg>
);
export const IconGlobe = (p: IconProps) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.4 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.4-3.6-8.5S9.5 6.1 12 3.5z" />
  </svg>
);
export const IconPaw = (p: IconProps) => (
  <svg {...base} {...p}>
    <ellipse cx="12" cy="16" rx="4.2" ry="3.4" />
    <circle cx="6" cy="10" r="1.8" />
    <circle cx="10" cy="6.5" r="1.8" />
    <circle cx="14" cy="6.5" r="1.8" />
    <circle cx="18" cy="10" r="1.8" />
  </svg>
);
export const IconDocument = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M7 3.5h7l4 4V20a.5.5 0 01-.5.5h-10A.5.5 0 017 20V3.5z" />
    <path d="M14 3.5V8h4M9.5 12.5h6M9.5 16h6" />
  </svg>
);
export const IconMegaphone = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M4 10v4h3l7 4V6l-7 4H4z" />
    <path d="M17.5 9.5a3.5 3.5 0 010 5" />
  </svg>
);
export const IconLock = (p: IconProps) => (
  <svg {...base} {...p}>
    <rect x="5" y="10.5" width="14" height="9.5" rx="1.5" />
    <path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" />
  </svg>
);
export const IconShield = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M12 3.5l7 2.8V11c0 4.5-3 8-7 9.5-4-1.5-7-5-7-9.5V6.3l7-2.8z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);
export const IconPeople = (p: IconProps) => (
  <svg {...base} {...p}>
    <circle cx="9" cy="8.5" r="3" />
    <path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5" />
    <circle cx="17" cy="9.5" r="2.4" />
    <path d="M16 14.6c2.2 0 3.8 1.3 4.5 3.9" />
  </svg>
);
export const IconArrowRight = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const IconWhatsapp = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
    <path d="M12 2.2a9.7 9.7 0 00-8.4 14.6L2.3 21.7l5-1.3A9.7 9.7 0 1012 2.2zm0 17.7a8 8 0 01-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1112 19.9zm4.4-6c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.8.9c-.1.2-.3.2-.5.1a6.5 6.5 0 01-3.2-2.8c-.2-.4.2-.4.7-1.3.1-.1 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 00-.6.3 2.7 2.7 0 00-.9 2c0 1.2.9 2.3 1 2.5.1.2 1.7 2.6 4.2 3.7 1.6.7 2.2.7 3 .6.5-.1 1.4-.6 1.6-1.1.2-.6.2-1 .1-1.1l-.4-.2z" />
  </svg>
);
export const IconMail = (p: IconProps) => (
  <svg {...base} {...p}>
    <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />
    <path d="M4 7l8 6 8-6" />
  </svg>
);
export const IconHeart = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0112 7.3a4.3 4.3 0 017.5 2.5C19.5 15.4 12 20 12 20z" />
  </svg>
);
export const IconBox = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M3.5 7.5L12 3.5l8.5 4v9L12 20.5l-8.5-4v-9z" />
    <path d="M3.5 7.5L12 11.5l8.5-4M12 11.5v9" />
  </svg>
);
export const IconSpark = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />
  </svg>
);
export const IconCheck = (p: IconProps) => (
  <svg {...base} strokeWidth={2.4} {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
