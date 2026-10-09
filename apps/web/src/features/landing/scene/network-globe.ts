import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  LineBasicMaterial,
  LineSegments,
  PerspectiveCamera,
  Points,
  QuadraticBezierCurve3,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderer,
} from 'three';

/**
 * Escena three.js del hero de la landing (F4/F8): una esfera de puntos
 * —el territorio— con nodos que laten —las organizaciones— unidos por arcos
 * por los que viajan pulsos de luz. Es una metáfora de lo que es AdoptaFácil
 * (infraestructura que conecta refugios, personas y evidencia), no un dato:
 * ni el número de nodos ni su posición representan organizaciones reales.
 *
 * Presupuesto: ~1.000 puntos, ~40 segmentos de arco, un solo draw call por
 * capa, DPR máximo 1,75 y pausa automática fuera de pantalla o con la pestaña
 * oculta (lo controla quien monta la escena con `setRunning`).
 */

export interface NetworkGlobeOptions {
  /** Sin animación: dibuja un único cuadro (prefers-reduced-motion). */
  staticFrame?: boolean;
}

export interface NetworkGlobeHandle {
  setRunning(running: boolean): void;
  dispose(): void;
}

const TEAL = new Color('#25baa6');
const MINT = new Color('#9be8dc');
const GOLD = new Color('#f2b94d');

const SPHERE_POINTS = 950;
const NODE_COUNT = 34;
const RADIUS = 1.45;
const PULSES = 14;

const pointVertex = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float pulse = aPhase < 0.0 ? 1.0 : 0.75 + 0.25 * sin(uTime * 2.0 + aPhase);
    gl_PointSize = aSize * pulse * uPixelRatio * (6.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
    // Los puntos de la cara trasera se atenúan: da profundidad sin luces.
    vec3 n = normalize((modelMatrix * vec4(position, 1.0)).xyz);
    vAlpha = smoothstep(-0.6, 0.9, n.z);
    vColor = aColor;
  }
`;

const pointFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float disc = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor, disc * vAlpha);
  }
`;

/** Distribución uniforme sobre la esfera (espiral de Fibonacci). */
function fibonacciSphere(count: number, radius: number): Vector3[] {
  const points: Vector3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i += 1) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i;
    points.push(new Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r).multiplyScalar(radius));
  }
  return points;
}

/** PRNG determinista: la escena es idéntica en cada visita (sin parpadeos raros). */
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

export function mountNetworkGlobe(
  canvas: HTMLCanvasElement,
  { staticFrame = false }: NetworkGlobeOptions = {},
): NetworkGlobeHandle {
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
  const camera = new PerspectiveCamera(42, 1, 0.1, 50);
  camera.position.set(0, 0, 5.2);

  const globe = new Group();
  globe.rotation.set(0.32, -0.6, 0.08);
  scene.add(globe);

  const random = mulberry32(20261007);

  // --- Capa 1: territorio + nodos (un solo Points con atributos) -----------
  const surface = fibonacciSphere(SPHERE_POINTS, RADIUS);
  const nodeIndexes = new Set<number>();
  while (nodeIndexes.size < NODE_COUNT) {
    // Evita los polos: los nodos quedan donde la vista los lee mejor.
    const index = Math.floor(SPHERE_POINTS * (0.18 + random() * 0.64));
    nodeIndexes.add(index);
  }
  const nodes = [...nodeIndexes].map((index) => surface[index]!.clone().multiplyScalar(1.015));

  const total = SPHERE_POINTS + NODE_COUNT;
  const positions = new Float32Array(total * 3);
  const sizes = new Float32Array(total);
  const phases = new Float32Array(total);
  const colors = new Float32Array(total * 3);
  surface.forEach((p, i) => {
    positions.set([p.x, p.y, p.z], i * 3);
    sizes[i] = 2.2 + random() * 1.4;
    phases[i] = -1;
    const tint = TEAL.clone().lerp(MINT, random() * 0.5);
    colors.set([tint.r, tint.g, tint.b], i * 3);
  });
  nodes.forEach((p, n) => {
    const i = SPHERE_POINTS + n;
    positions.set([p.x, p.y, p.z], i * 3);
    sizes[i] = 9 + random() * 5;
    phases[i] = random() * Math.PI * 2;
    const tint = n % 5 === 0 ? GOLD : MINT;
    colors.set([tint.r, tint.g, tint.b], i * 3);
  });

  const pointGeometry = new BufferGeometry();
  pointGeometry.setAttribute('position', new BufferAttribute(positions, 3));
  pointGeometry.setAttribute('aSize', new BufferAttribute(sizes, 1));
  pointGeometry.setAttribute('aPhase', new BufferAttribute(phases, 1));
  pointGeometry.setAttribute('aColor', new BufferAttribute(colors, 3));
  const pointMaterial = new ShaderMaterial({
    vertexShader: pointVertex,
    fragmentShader: pointFragment,
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: pixelRatio } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  globe.add(new Points(pointGeometry, pointMaterial));

  // --- Capa 2: arcos entre nodos cercanos ----------------------------------
  // Solo vecinos cercanos: arcos cortos que abrazan la superficie (un arco
  // largo atravesaría la esfera y se leería como ruido).
  const curves: QuadraticBezierCurve3[] = [];
  const linked = new Set<string>();
  nodes.forEach((a, i) => {
    const nearest = nodes
      .map((b, j) => ({ j, d: a.distanceTo(b) }))
      .filter(({ j, d }) => j !== i && d < RADIUS * 0.95)
      .sort((x, y) => x.d - y.d)
      .slice(0, 3);
    for (const { j, d } of nearest) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (linked.has(key)) continue;
      linked.add(key);
      const b = nodes[j]!;
      const mid = a
        .clone()
        .add(b)
        .multiplyScalar(0.5)
        .normalize()
        .multiplyScalar(RADIUS * (1.06 + d * 0.16));
      curves.push(new QuadraticBezierCurve3(a, mid, b));
    }
  });
  const SEGMENTS = 24;
  const arcPositions = new Float32Array(curves.length * SEGMENTS * 2 * 3);
  curves.forEach((curve, c) => {
    const pts = curve.getPoints(SEGMENTS);
    for (let s = 0; s < SEGMENTS; s += 1) {
      const offset = (c * SEGMENTS + s) * 6;
      arcPositions.set([pts[s]!.x, pts[s]!.y, pts[s]!.z], offset);
      arcPositions.set([pts[s + 1]!.x, pts[s + 1]!.y, pts[s + 1]!.z], offset + 3);
    }
  });
  const arcGeometry = new BufferGeometry();
  arcGeometry.setAttribute('position', new BufferAttribute(arcPositions, 3));
  const arcMaterial = new LineBasicMaterial({
    color: TEAL,
    transparent: true,
    opacity: 0.32,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  globe.add(new LineSegments(arcGeometry, arcMaterial));

  // --- Capa 3: pulsos que viajan por los arcos -----------------------------
  const pulseState = Array.from({ length: PULSES }, (_, k) => ({
    curve: curves[(k * 7) % curves.length]!,
    t: random(),
    speed: 0.12 + random() * 0.18,
  }));
  const pulsePositions = new Float32Array(PULSES * 3);
  const pulseSizes = new Float32Array(PULSES).fill(10);
  const pulsePhases = new Float32Array(PULSES).fill(-1);
  const pulseColors = new Float32Array(PULSES * 3);
  for (let k = 0; k < PULSES; k += 1) pulseColors.set([1, 0.93, 0.78], k * 3);
  const pulseGeometry = new BufferGeometry();
  const pulsePositionAttr = new BufferAttribute(pulsePositions, 3);
  pulseGeometry.setAttribute('position', pulsePositionAttr);
  pulseGeometry.setAttribute('aSize', new BufferAttribute(pulseSizes, 1));
  pulseGeometry.setAttribute('aPhase', new BufferAttribute(pulsePhases, 1));
  pulseGeometry.setAttribute('aColor', new BufferAttribute(pulseColors, 3));
  globe.add(new Points(pulseGeometry, pointMaterial));

  const scratch = new Vector3();
  const placePulses = (delta: number) => {
    pulseState.forEach((pulse, k) => {
      pulse.t += pulse.speed * delta;
      if (pulse.t > 1) {
        pulse.t = 0;
        pulse.curve = curves[Math.floor(random() * curves.length)]!;
      }
      pulse.curve.getPoint(pulse.t, scratch);
      pulsePositions.set([scratch.x, scratch.y, scratch.z], k * 3);
    });
    pulsePositionAttr.needsUpdate = true;
  };

  // --- Tamaño, puntero y bucle --------------------------------------------
  const resize = () => {
    const { clientWidth: width, clientHeight: height } = canvas;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // En lienzos estrechos (móvil) la cámara se aleja para que la esfera quepa.
    camera.position.z = camera.aspect < 0.9 ? 6.4 : 5.2;
    camera.updateProjectionMatrix();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();

  const pointer = { x: 0, y: 0 };
  const onPointerMove = (event: PointerEvent) => {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
  };

  let frame = 0;
  let running = false;
  let last = performance.now();
  let elapsed = 0;
  const tick = (now: number) => {
    const delta = Math.min((now - last) / 1000, 0.05);
    last = now;
    elapsed += delta;
    pointMaterial.uniforms.uTime!.value = elapsed;
    globe.rotation.y += delta * 0.07;
    globe.rotation.x += (0.32 + pointer.y * 0.12 - globe.rotation.x) * 0.04;
    globe.rotation.z += (0.08 - pointer.x * 0.08 - globe.rotation.z) * 0.04;
    placePulses(delta);
    renderer.render(scene, camera);
    if (running) frame = requestAnimationFrame(tick);
  };

  placePulses(0);
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

  if (!staticFrame) window.addEventListener('pointermove', onPointerMove, { passive: true });

  return {
    setRunning,
    dispose() {
      running = false;
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onPointerMove);
      resizeObserver.disconnect();
      pointGeometry.dispose();
      arcGeometry.dispose();
      pulseGeometry.dispose();
      pointMaterial.dispose();
      arcMaterial.dispose();
      renderer.dispose();
    },
  };
}
