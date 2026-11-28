/*
 * Ilustraciones navideñas propias (SVG dibujado a mano para AdoptaFácil, sin
 * recursos de terceros). Las usan las plantillas de temporada Navidad y Bola de
 * nieve. Todo es decorativo (`aria-hidden`) y se anima solo con CSS, que cada
 * plantilla apaga con `prefers-reduced-motion`.
 */

/** Generador pseudoaleatorio con semilla: la escena sale igual en cada visita. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Un reno galopando, mirando a la derecha (origen en el centro del cuerpo). */
function reindeer(x: number, y: number, rudolph = false): string {
  const fur = '#8A5A33';
  const dark = '#5E3B1F';
  return `<g transform="translate(${x} ${y})">
<g class="lg lg-a"><path d="M14 4 L30 14 L33 12" stroke="${dark}" stroke-width="4" stroke-linecap="round" fill="none"/><path d="M-14 5 L-30 12 L-33 9" stroke="${dark}" stroke-width="4" stroke-linecap="round" fill="none"/></g>
<g class="lg lg-b"><path d="M10 6 L22 20 L25 19" stroke="${fur}" stroke-width="4" stroke-linecap="round" fill="none"/><path d="M-10 6 L-22 19 L-25 17" stroke="${fur}" stroke-width="4" stroke-linecap="round" fill="none"/></g>
<ellipse cx="0" cy="0" rx="22" ry="10.5" fill="${fur}"/>
<ellipse cx="-2" cy="4" rx="14" ry="5" fill="#C89B6D" opacity=".55"/>
<path d="M-21 -3 q-8 -4 -9 -10 q6 2 10 6z" fill="#F4EDE4"/>
<path d="M14 -4 Q22 -12 25 -20 L31 -17 Q27 -8 20 2z" fill="${fur}"/>
<ellipse cx="31" cy="-20" rx="9" ry="5.6" fill="${fur}" transform="rotate(-12 31 -20)"/>
<path d="M25 -24 q-2 -10 -8 -14 M22 -31 l-6 -2 M25 -24 q4 -10 1 -17 M27 -35 l5 -4" stroke="${dark}" stroke-width="2.4" stroke-linecap="round" fill="none"/>
<path d="M24 -24 l-4 -3" stroke="${dark}" stroke-width="3" stroke-linecap="round"/>
<circle cx="32" cy="-22" r="1.4" fill="#1B0F08"/>
${rudolph ? `<circle class="nose" cx="40" cy="-22" r="3.6" fill="#FF3B3B"/><circle cx="40" cy="-22" r="9" fill="#FF3B3B" opacity=".28" class="nose-glow"/>` : `<circle cx="39.5" cy="-22" r="2.4" fill="#2A160A"/>`}
<path d="M12 -6 q4 3 8 1" stroke="#C62828" stroke-width="3" fill="none"/><circle cx="17" cy="-3" r="2" fill="#FFD25A"/>
</g>`;
}

/** Trineo con Papá Noel, el saco y regalos (origen: esquina izquierda del patín). */
function sleigh(x: number, y: number): string {
  return `<g transform="translate(${x} ${y})">
<path d="M-8 14 L84 14 Q102 14 106 -2" stroke="#E7B85A" stroke-width="3.4" stroke-linecap="round" fill="none"/>
<path d="M16 5 V14 M62 7 V14" stroke="#E7B85A" stroke-width="3"/>
<circle cx="20" cy="-40" r="13" fill="#7A4E2D"/><path d="M14 -52 q6 -6 12 0" stroke="#5E3B1F" stroke-width="3" fill="none"/>
<rect x="26" y="-48" width="11" height="10" rx="1.5" fill="#3FA36B"/><path d="M31.5 -48 v10 M26 -43 h11" stroke="#FFD25A" stroke-width="2"/>
<circle cx="44" cy="-34" r="15" fill="#D32F2F"/>
<rect x="30" y="-33" width="28" height="5" fill="#2A160A"/><rect x="41" y="-33.5" width="6" height="6" rx="1" fill="#FFD25A"/>
<circle cx="53" cy="-51" r="7" fill="#F6CBA6"/>
<path d="M46 -49 q7 14 15 0 q-2 8 -7.5 9 q-6 -1 -7.5 -9z" fill="#FFFFFF"/>
<circle cx="55" cy="-53" r="1.2" fill="#1B0F08"/><circle cx="58" cy="-49" r="1.6" fill="#F08A7A"/>
<path d="M45 -55 Q48 -72 36 -72 Q40 -64 44 -57z" fill="#D32F2F"/><rect x="44" y="-58" width="16" height="4.5" rx="2.2" fill="#FFFFFF"/><circle cx="35" cy="-71" r="3.4" fill="#FFFFFF"/>
<g class="wave"><path d="M56 -40 L70 -56" stroke="#D32F2F" stroke-width="5.5" stroke-linecap="round"/><circle cx="71" cy="-58" r="4" fill="#FFFFFF"/></g>
<path d="M2 -30 H66 Q80 -30 82 -14 L84 2 Q62 10 12 6 Q0 4 2 -12z" fill="#C62828"/>
<path d="M2 -30 H66 Q80 -30 82 -14" stroke="#E7B85A" stroke-width="3" fill="none"/>
<path d="M14 -18 q8 -6 16 0 q8 6 16 0 q8 -6 16 0" stroke="#E7B85A" stroke-width="2" fill="none" opacity=".8"/>
<path d="M82 -14 Q92 -36 106 -30 Q98 -26 95 -17" stroke="#E7B85A" stroke-width="4" stroke-linecap="round" fill="none"/>
</g>`;
}

/** Papá Noel en su trineo con tres renos (Rodolfo adelante), ~360×100. */
export function sleighTeam(): string {
  return `<g class="sl-trail">${[0, 1, 2, 3, 4, 5, 6]
    .map(
      (i) =>
        `<circle cx="${-14 - i * 22}" cy="${6 + Math.sin(i) * 6}" r="${3 - i * 0.35}" fill="#FFE9A8" style="--d:${i * 0.12}s"/>`,
    )
    .join('')}</g>
<path d="M104 -14 C150 -20 190 -30 330 -36" stroke="#E7B85A" stroke-width="1.6" fill="none" opacity=".9"/>
${sleigh(0, 0)}
${reindeer(170, -24)}${reindeer(240, -30)}${reindeer(310, -38, true)}`;
}

/** Pino con luces, guirnalda y estrella (base en 0,0; alto ~h). */
function bigTree(x: number, y: number, h: number): string {
  const r = seeded(7);
  const w = h * 0.62;
  const layer = (t: number, b: number, half: number, c: string) =>
    `<path d="M0 ${-h * t} L${half} ${-h * b} Q0 ${-h * b + 14} ${-half} ${-h * b}z" fill="${c}"/>`;
  const colors = ['#FF4D4D', '#FFD24D', '#6FB7FF', '#FF8AD8', '#7CF0A0'];
  const lights = Array.from({ length: 26 }, (_, i) => {
    const t = 0.12 + r() * 0.72;
    const half = w * 0.5 * t * 1.05;
    const lx = (r() * 2 - 1) * half * 0.85;
    const ly = -h * (0.95 - t * 0.95) - 4;
    return `<circle class="tw" cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="4" fill="${colors[i % colors.length]}" style="--d:${(r() * 2.4).toFixed(2)}s"/>`;
  }).join('');
  return `<g transform="translate(${x} ${y})">
<rect x="-10" y="-18" width="20" height="22" rx="3" fill="#6B3E1F"/>
${layer(1, 0.62, w * 0.3, '#2E8B57')}${layer(0.78, 0.36, w * 0.4, '#257A4B')}${layer(0.55, 0.06, w * 0.5, '#1E6B41')}
<path d="M${-w * 0.36} ${-h * 0.18} Q0 ${-h * 0.1} ${w * 0.42} ${-h * 0.24} M${-w * 0.28} ${-h * 0.42} Q0 ${-h * 0.34} ${w * 0.3} ${-h * 0.48} M${-w * 0.18} ${-h * 0.66} Q0 ${-h * 0.6} ${w * 0.2} ${-h * 0.7}" stroke="#F2C14E" stroke-width="3" fill="none" opacity=".9"/>
${lights}
<g class="star" transform="translate(0 ${-h - 6})"><circle r="22" fill="#FFE27A" opacity=".35" class="star-glow"/><path d="M0 -17 L5 -5 L18 -5 L8 3 L12 16 L0 8 L-12 16 L-8 3 L-18 -5 L-5 -5z" fill="#FFD24D" stroke="#F2A900" stroke-width="1.5"/></g>
</g>`;
}

function house(x: number, y: number, s: number, roof: string): string {
  return `<g transform="translate(${x} ${y}) scale(${s})">
<rect x="-26" y="-34" width="52" height="34" fill="${roof === 'a' ? '#B5483E' : '#8C5A3C'}"/>
<path d="M-32 -32 L0 -58 L32 -32z" fill="#FFFFFF"/><path d="M-32 -32 L0 -58 L32 -32" stroke="#D8E4F2" stroke-width="2" fill="none"/>
<rect x="14" y="-62" width="8" height="16" fill="#6E4A33"/><rect x="13" y="-64" width="10" height="4" fill="#FFFFFF"/>
<rect x="-18" y="-24" width="12" height="11" rx="1.5" fill="#FFD66B" class="win"/><rect x="6" y="-24" width="12" height="11" rx="1.5" fill="#FFD66B" class="win"/>
<rect x="-6" y="-16" width="12" height="16" rx="2" fill="#5A3622"/>
<g class="smoke"><circle cx="18" cy="-72" r="4" fill="#E9EEF6" opacity=".7"/><circle cx="22" cy="-82" r="5" fill="#E9EEF6" opacity=".5"/></g>
</g>`;
}

function pine(x: number, y: number, s: number): string {
  return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 -60 L16 -28 L8 -28 L22 0 L-22 0 L-8 -28 L-16 -28z" fill="#1D4E3A"/><path d="M0 -60 L7 -46 L-7 -46z M-8 -28 L8 -28 L4 -22 L-4 -22z" fill="#F4F8FD"/></g>`;
}

function snowman(x: number, y: number): string {
  return `<g transform="translate(${x} ${y})">
<circle cx="0" cy="-26" r="26" fill="#FFFFFF" stroke="#D2DEEE" stroke-width="2"/>
<circle cx="0" cy="-66" r="18" fill="#FFFFFF" stroke="#D2DEEE" stroke-width="2"/>
<circle cx="-6" cy="-70" r="2.2" fill="#1B1B1B"/><circle cx="6" cy="-70" r="2.2" fill="#1B1B1B"/>
<path d="M0 -65 L14 -62 L0 -61z" fill="#F08A24"/>
<path d="M-7 -59 q7 5 14 0" stroke="#1B1B1B" stroke-width="1.8" fill="none" stroke-linecap="round"/>
<path d="M-17 -52 q17 8 34 0 l-2 6 q-15 6 -30 0z" fill="#D32F2F"/><path d="M8 -48 l4 20 l6 -2 l-3 -18z" fill="#D32F2F"/>
<rect x="-14" y="-92" width="28" height="6" rx="2" fill="#20262E"/><rect x="-9" y="-108" width="18" height="18" rx="2" fill="#20262E"/><rect x="-9" y="-95" width="18" height="4" fill="#C62828"/>
<circle cx="0" cy="-36" r="2.4" fill="#1B1B1B"/><circle cx="0" cy="-24" r="2.4" fill="#1B1B1B"/>
<path d="M-24 -52 L-44 -66 M-36 -60 l-4 -8 M22 -52 L42 -64 M36 -60 l3 -8" stroke="#6B3E1F" stroke-width="3" stroke-linecap="round"/>
</g>`;
}

function gift(x: number, y: number, w: number, h: number, box: string, rib: string): string {
  return `<g transform="translate(${x} ${y})"><rect x="0" y="${-h}" width="${w}" height="${h}" rx="3" fill="${box}"/><rect x="${w / 2 - 4}" y="${-h}" width="8" height="${h}" fill="${rib}"/><rect x="-3" y="${-h - 6}" width="${w + 6}" height="10" rx="2" fill="${box}"/><path d="M${w / 2} ${-h - 6} q-14 -16 -18 -4 q2 6 18 4 q14 -16 18 -4 q-2 6 -18 4" fill="${rib}"/></g>`;
}

/**
 * Escena de portada: cielo con estrellas y luna, colinas nevadas, pueblito,
 * muñeco de nieve, el gran árbol con regalos y el trineo cruzando el cielo.
 * El cielo es transparente: el color lo pone la sección (sin costuras). El
 * trineo NO va aquí: vuela aparte (`flyingSleigh`) para cruzar todo el ancho
 * visible, que el recorte `slice` del SVG cambia con cada pantalla.
 */
export function nightScene(): string {
  const r = seeded(42);
  const stars = Array.from({ length: 70 }, () => {
    const x = (r() * 1440).toFixed(0);
    const y = (r() * 440).toFixed(0);
    const s = (0.8 + r() * 1.6).toFixed(1);
    return `<circle class="tw" cx="${x}" cy="${y}" r="${s}" fill="#FFFFFF" style="--d:${(r() * 3).toFixed(2)}s"/>`;
  }).join('');
  return `<svg class="nv-art-scene" viewBox="0 0 1440 800" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
<defs><radialGradient id="nvMoon"><stop offset="0" stop-color="#FFF6D8" stop-opacity=".55"/><stop offset="1" stop-color="#FFF6D8" stop-opacity="0"/></radialGradient></defs>
${stars}
<circle cx="1180" cy="150" r="150" fill="url(#nvMoon)"/><circle cx="1180" cy="150" r="58" fill="#FFF6D8"/><circle cx="1162" cy="140" r="10" fill="#F1E5BE"/><circle cx="1196" cy="170" r="7" fill="#F1E5BE"/>
<path d="M0 560 C200 500 380 520 560 548 C760 585 900 500 1100 520 C1260 535 1360 560 1440 550 L1440 800 L0 800z" fill="var(--hill-far)"/>
${pine(120, 545, 0.9)}${pine(170, 540, 0.7)}${pine(1010, 520, 0.8)}${pine(1080, 528, 1)}${pine(1130, 532, 0.7)}
${house(600, 562, 0.9, 'a')}${house(690, 568, 0.75, 'b')}${house(470, 555, 0.7, 'b')}
<path d="M0 650 C240 596 520 612 760 650 C1000 690 1220 618 1440 628 L1440 800 L0 800z" fill="var(--hill-near)"/>
<path d="M0 650 C240 596 520 612 760 650 C1000 690 1220 618 1440 628" stroke="#FFFFFF" stroke-width="3" fill="none" opacity=".8"/>
${snowman(340, 650)}
${pine(1010, 690, 1.4)}${pine(880, 700, 1.1)}${pine(60, 690, 1.3)}
${bigTree(1270, 668, 250)}
${gift(1314, 690, 46, 34, '#D32F2F', '#FFD25A')}${gift(1190, 694, 40, 30, '#2E7DD7', '#FFFFFF')}${gift(1360, 698, 34, 26, '#3FA36B', '#D32F2F')}
</svg>`;
}

/** Trineo pequeño para la barra de avance de la campaña. */
export function miniSleigh(): string {
  return `<svg viewBox="-120 -82 480 112" aria-hidden="true" focusable="false">${sleighTeam()}</svg>`;
}

/** Trineo de la portada: vuela por su carril de borde a borde. */
export function flyingSleigh(): string {
  return `<svg viewBox="-160 -84 520 116" aria-hidden="true" focusable="false">${sleighTeam()}</svg>`;
}
