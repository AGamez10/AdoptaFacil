import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from 'three';

/**
 * Escena three.js de la plantilla Órbita (Ola 3): miles de partículas que
 * llegan desde una nube dispersa y se ordenan en una huella, respiran, giran
 * suavemente y se apartan del cursor. Es decorativa: no representa datos.
 *
 * El color sale del color principal de la organización. Presupuesto: un solo
 * draw call, la animación vive en el shader (la CPU solo actualiza uniformes),
 * DPR máximo 1,75 y pausa fuera de pantalla (lo controla quien la monta).
 */

export type ConstellationDensity = 'suave' | 'media' | 'intensa';

export interface PawConstellationOptions {
  staticFrame?: boolean;
  density?: ConstellationDensity;
  /** Color principal como canales HSL de CSS ("174 72% 30%") o hex. */
  color?: string;
}

export interface PawConstellationHandle {
  setRunning(running: boolean): void;
  dispose(): void;
}

const COUNTS: Record<ConstellationDensity, number> = { suave: 900, media: 1700, intensa: 2800 };

/** Óvalos de la huella: almohadilla y cuatro dedos (x, y, rx, ry, peso). */
const PAW: ReadonlyArray<[number, number, number, number, number]> = [
  [0, -0.55, 0.95, 0.78, 0.44],
  [-1.25, 0.45, 0.36, 0.48, 0.13],
  [-0.48, 1.12, 0.36, 0.5, 0.15],
  [0.48, 1.12, 0.36, 0.5, 0.15],
  [1.25, 0.45, 0.36, 0.48, 0.13],
];

const vertex = /* glsl */ `
  attribute vec3 aTarget;
  attribute float aSize;
  attribute float aSeed;
  attribute float aGold;
  uniform float uTime;
  uniform float uIntro;
  uniform float uPixelRatio;
  uniform vec2 uPointer;
  varying float vGold;
  varying float vAlpha;
  void main() {
    // Llegada: de la nube (position) a la huella (aTarget), escalonada por semilla.
    float t = clamp(uIntro * 1.4 - aSeed * 0.4, 0.0, 1.0);
    t = t * t * (3.0 - 2.0 * t);
    vec3 p = mix(position, aTarget, t);
    // Respiración y deriva.
    float wobble = sin(uTime * 0.9 + aSeed * 40.0);
    p.xy += vec2(cos(aSeed * 91.0 + uTime * 0.6), sin(aSeed * 57.0 + uTime * 0.7)) * 0.035;
    p *= 1.0 + 0.025 * sin(uTime * 1.2);
    p.z += wobble * 0.12;
    // El cursor aparta las partículas cercanas.
    vec2 d = p.xy - uPointer * 2.6;
    float push = smoothstep(1.1, 0.0, length(d));
    p.xy += normalize(d + 0.0001) * push * 0.45;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = aSize * uPixelRatio * (6.0 / -mv.z) * (0.85 + 0.3 * wobble);
    gl_Position = projectionMatrix * mv;
    vGold = aGold;
    vAlpha = 0.55 + 0.45 * t;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uGold;
  varying float vGold;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float disc = smoothstep(0.5, 0.0, d);
    vec3 c = mix(uColor, uGold, vGold);
    gl_FragColor = vec4(c, disc * vAlpha);
  }
`;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** "174 72% 30%" o "#0ea397" → Color; con cualquier otra cosa, el teal de marca. */
export function parseBrandColor(value: string | undefined): Color {
  const fallback = new Color('#25baa6');
  if (!value) return fallback;
  const trimmed = value.trim();
  if (trimmed.startsWith('#')) return new Color(trimmed);
  const match = /^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/.exec(trimmed);
  if (!match) return fallback;
  const color = new Color();
  // Un poco más de luz: sobre fondo oscuro el color de marca se ve apagado.
  const light = Math.min(Number(match[3]) / 100 + 0.22, 0.78);
  color.setHSL(Number(match[1]) / 360, Number(match[2]) / 100, light);
  return color;
}

export function mountPawConstellation(
  canvas: HTMLCanvasElement,
  { staticFrame = false, density = 'media', color }: PawConstellationOptions = {},
): PawConstellationHandle {
  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'low-power',
  });
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 0.1, 50);
  camera.position.set(0, 0, 7);

  const random = mulberry32(20261009);
  const count = COUNTS[density] ?? COUNTS.media;
  const start = new Float32Array(count * 3);
  const target = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const seeds = new Float32Array(count);
  const gold = new Float32Array(count);

  const weights = PAW.map((oval) => oval[4]);
  for (let i = 0; i < count; i += 1) {
    // Nube inicial: cáscara esférica amplia.
    const u = random() * 2 - 1;
    const theta = random() * Math.PI * 2;
    const radius = 3.5 + random() * 2.5;
    const r = Math.sqrt(1 - u * u);
    start.set([Math.cos(theta) * r * radius, u * radius, Math.sin(theta) * r * radius], i * 3);

    // Destino: un punto dentro de un óvalo de la huella (más denso hacia el borde).
    let pick = random();
    let oval = PAW[0]!;
    for (let k = 0; k < PAW.length; k += 1) {
      pick -= weights[k]!;
      if (pick <= 0) {
        oval = PAW[k]!;
        break;
      }
    }
    const angle = random() * Math.PI * 2;
    const rr = Math.sqrt(random()) * (0.55 + 0.45 * random());
    target.set(
      [
        oval[0] + Math.cos(angle) * oval[2] * rr,
        oval[1] + Math.sin(angle) * oval[3] * rr,
        (random() - 0.5) * 0.5,
      ],
      i * 3,
    );
    sizes[i] = 2 + random() * 3.2;
    seeds[i] = random();
    gold[i] = random() < 0.06 ? 1 : 0;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(start, 3));
  geometry.setAttribute('aTarget', new BufferAttribute(target, 3));
  geometry.setAttribute('aSize', new BufferAttribute(sizes, 1));
  geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1));
  geometry.setAttribute('aGold', new BufferAttribute(gold, 1));
  const material = new ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      uTime: { value: 0 },
      uIntro: { value: staticFrame ? 1 : 0 },
      uPixelRatio: { value: pixelRatio },
      uPointer: { value: [9, 9] },
      uColor: { value: parseBrandColor(color) },
      uGold: { value: new Color('#f2b94d') },
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const points = new Points(geometry, material);
  points.rotation.z = -0.08;
  scene.add(points);

  const resize = () => {
    const { clientWidth: width, clientHeight: height } = canvas;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.position.z = camera.aspect < 0.9 ? 9 : 7;
    camera.updateProjectionMatrix();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();

  const pointer = { x: 9, y: 9, tx: 9, ty: 9 };
  const onPointerMove = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointer.tx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.ty = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  };
  const onPointerLeave = () => {
    pointer.tx = 9;
    pointer.ty = 9;
  };

  let frame = 0;
  let running = false;
  let last = performance.now();
  let elapsed = 0;
  const uniforms = material.uniforms;
  const tick = (now: number) => {
    const delta = Math.min((now - last) / 1000, 0.05);
    last = now;
    elapsed += delta;
    uniforms.uTime!.value = elapsed;
    uniforms.uIntro!.value = Math.min(1, (uniforms.uIntro!.value as number) + delta * 0.45);
    pointer.x += (pointer.tx - pointer.x) * 0.08;
    pointer.y += (pointer.ty - pointer.y) * 0.08;
    uniforms.uPointer!.value = [pointer.x, pointer.y];
    points.rotation.y = Math.sin(elapsed * 0.25) * 0.35;
    renderer.render(scene, camera);
    if (running) frame = requestAnimationFrame(tick);
  };

  renderer.render(scene, camera);

  const setRunning = (next: boolean) => {
    if (staticFrame || next === running) return;
    running = next;
    if (running) {
      last = performance.now();
      frame = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(frame);
    }
  };

  if (!staticFrame) {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    canvas.ownerDocument.addEventListener('pointerleave', onPointerLeave);
  }

  return {
    setRunning,
    dispose() {
      running = false;
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onPointerMove);
      canvas.ownerDocument.removeEventListener('pointerleave', onPointerLeave);
      resizeObserver.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    },
  };
}
