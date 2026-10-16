import type { SVGProps } from 'react';

/**
 * Ilustraciones propias de AdoptaFácil (marca v3): formas planas, esquinas
 * redondeadas y un trazo oscuro común, para dar calidez sin depender de
 * bancos de imágenes. Son decorativas: siempre `aria-hidden`.
 */
type IllustrationProps = SVGProps<SVGSVGElement>;

const INK = '#14202e';

/** Perro sentado con collar y placa en forma de corazón (mascota de la marca). */
export function DogMascot(props: IllustrationProps) {
  return (
    <svg viewBox="0 0 240 260" fill="none" aria-hidden="true" {...props}>
      {/* sombra */}
      <ellipse cx="122" cy="246" rx="78" ry="10" fill={INK} opacity="0.12" />
      {/* cola */}
      <path d="M178 196c22-4 36-22 34-44" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      <path d="M178 196c22-4 36-22 34-44" stroke="#f2a65a" strokeWidth="11" strokeLinecap="round" />
      {/* cuerpo */}
      <path
        d="M64 240c-6-52 6-96 56-104 50 8 62 52 56 104z"
        fill="#f6b26b"
        stroke={INK}
        strokeWidth="5"
        strokeLinejoin="round"
      />
      {/* pecho */}
      <path d="M96 240c-2-34 8-58 24-62 16 4 26 28 24 62z" fill="#fff4e2" />
      {/* patas delanteras */}
      <rect
        x="88"
        y="200"
        width="22"
        height="42"
        rx="11"
        fill="#f6b26b"
        stroke={INK}
        strokeWidth="5"
      />
      <rect
        x="130"
        y="200"
        width="22"
        height="42"
        rx="11"
        fill="#f6b26b"
        stroke={INK}
        strokeWidth="5"
      />
      {/* collar */}
      <path d="M84 150c22 12 50 12 72 0" stroke="#25baa6" strokeWidth="12" strokeLinecap="round" />
      {/* placa */}
      <path
        d="M120 176c-10-8-16-12-16-18a7 7 0 0 1 16-3 7 7 0 0 1 16 3c0 6-6 10-16 18z"
        fill="#ff7a59"
        stroke={INK}
        strokeWidth="4"
        strokeLinejoin="round"
      />
      {/* orejas */}
      <path
        d="M66 58c-22 6-30 40-20 66 8 4 18 0 22-8z"
        fill="#8a4b2a"
        stroke={INK}
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path
        d="M174 58c22 6 30 40 20 66-8 4-18 0-22-8z"
        fill="#8a4b2a"
        stroke={INK}
        strokeWidth="5"
        strokeLinejoin="round"
      />
      {/* cabeza */}
      <rect
        x="62"
        y="40"
        width="116"
        height="108"
        rx="52"
        fill="#f6b26b"
        stroke={INK}
        strokeWidth="5"
      />
      {/* mancha del ojo */}
      <path d="M140 62c16-4 28 8 26 26-10 6-26 4-32-8z" fill="#fff4e2" />
      {/* hocico */}
      <ellipse cx="120" cy="116" rx="34" ry="24" fill="#fff4e2" stroke={INK} strokeWidth="5" />
      {/* nariz */}
      <path d="M108 104c0-6 24-6 24 0 0 8-6 12-12 12s-12-4-12-12z" fill={INK} />
      {/* boca y lengua */}
      <path d="M120 116v8m-12 0c4 6 20 6 24 0" stroke={INK} strokeWidth="4" strokeLinecap="round" />
      <path
        d="M114 128c0 10 12 10 12 0z"
        fill="#ff7a59"
        stroke={INK}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {/* ojos */}
      <circle cx="98" cy="86" r="7" fill={INK} />
      <circle cx="142" cy="86" r="7" fill={INK} />
      <circle cx="100" cy="84" r="2.2" fill="#fff" />
      <circle cx="144" cy="84" r="2.2" fill="#fff" />
      {/* mejillas */}
      <circle cx="82" cy="108" r="7" fill="#ff7a59" opacity="0.35" />
      <circle cx="158" cy="108" r="7" fill="#ff7a59" opacity="0.35" />
    </svg>
  );
}

/** Gato acostado, compañero de la mascota. */
export function CatMascot(props: IllustrationProps) {
  return (
    <svg viewBox="0 0 220 160" fill="none" aria-hidden="true" {...props}>
      <ellipse cx="112" cy="148" rx="80" ry="8" fill={INK} opacity="0.12" />
      {/* cola */}
      <path d="M176 128c26 2 34-24 18-36" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      <path d="M176 128c26 2 34-24 18-36" stroke="#5b6b7d" strokeWidth="11" strokeLinecap="round" />
      {/* cuerpo */}
      <rect
        x="54"
        y="88"
        width="132"
        height="56"
        rx="28"
        fill="#5b6b7d"
        stroke={INK}
        strokeWidth="5"
      />
      <path
        d="M120 100c10 0 16 10 16 20m6-20c8 0 14 10 14 20"
        stroke="#8796a8"
        strokeWidth="5"
        strokeLinecap="round"
      />
      {/* patas */}
      <rect
        x="62"
        y="124"
        width="34"
        height="20"
        rx="10"
        fill="#fff4e2"
        stroke={INK}
        strokeWidth="5"
      />
      {/* orejas */}
      <path
        d="M30 52 36 14l28 26z"
        fill="#5b6b7d"
        stroke={INK}
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path
        d="M110 52 104 14 76 40z"
        fill="#5b6b7d"
        stroke={INK}
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path d="M40 40 42 26l10 10zM100 40 98 26 88 36z" fill="#ffb3a0" />
      {/* cabeza */}
      <ellipse cx="70" cy="74" rx="48" ry="42" fill="#5b6b7d" stroke={INK} strokeWidth="5" />
      <ellipse cx="70" cy="90" rx="22" ry="15" fill="#fff4e2" />
      {/* ojos cerrados y contentos */}
      <path
        d="M44 72c4-6 12-6 16 0M80 72c4-6 12-6 16 0"
        stroke={INK}
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M66 84h8l-4 5z"
        fill="#ff7a59"
        stroke={INK}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M70 89c-2 5-8 6-11 3m11-3c2 5 8 6 11 3"
        stroke={INK}
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* bigotes */}
      <path
        d="M38 86 18 82m20 10-18 4M102 86l20-4m-20 10 18 4"
        stroke={INK}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Destello de cuatro puntas. */
export function Sparkle(props: IllustrationProps) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" {...props}>
      <path
        d="M20 2c2 10 8 16 18 18-10 2-16 8-18 18-2-10-8-16-18-18C12 18 18 12 20 2z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Huella como sello. */
export function PawStamp(props: IllustrationProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" {...props}>
      <ellipse cx="24" cy="31" rx="11" ry="9" fill="currentColor" />
      <ellipse cx="10" cy="20" rx="5" ry="6.5" fill="currentColor" />
      <ellipse cx="38" cy="20" rx="5" ry="6.5" fill="currentColor" />
      <ellipse cx="18" cy="10" rx="4.5" ry="6" fill="currentColor" />
      <ellipse cx="30" cy="10" rx="4.5" ry="6" fill="currentColor" />
    </svg>
  );
}

/** Corazón con contorno. */
export function HeartSticker(props: IllustrationProps) {
  return (
    <svg viewBox="0 0 48 44" aria-hidden="true" {...props}>
      <path
        d="M24 40C10 30 3 23 3 14A10 10 0 0 1 24 9a10 10 0 0 1 21 5c0 9-7 16-21 26z"
        fill="currentColor"
        stroke={INK}
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Hueso. */
export function BoneSticker(props: IllustrationProps) {
  return (
    <svg viewBox="0 0 64 28" aria-hidden="true" {...props}>
      <path
        d="M14 4a7 7 0 0 1 6 8h24a7 7 0 1 1 6 6 7 7 0 1 1-6 6H20a7 7 0 1 1-6-6 7 7 0 1 1 0-14z"
        fill="currentColor"
        stroke={INK}
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
