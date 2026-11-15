// Escenario 5 · Perfil del animal bajo uso real: muchas personas del refugio
// viendo el perfil (lista, ficha, registro clínico, carnet) MIENTRAS el equipo
// registra eventos clínicos y edita fichas. Objetivo (hipótesis): 500 lectores
// y 50 personas escribiendo a la vez, p95 de lectura < 400 ms aun con las
// escrituras en curso, errores < 0,1 %.
//
// Necesita tokens de cuentas de prueba de VARIOS refugios (uno por línea) en
// ORG_TOKENS_FILE, cada refugio con animales ya creados (seed-escala.sh).
//
//   k6 run -e API_URL=... -e ORG_TOKENS_FILE=tokens.txt scripts/load/k6/perfil-animal.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, pick, scaled } from './lib.js';

const tokens = open(__ENV.ORG_TOKENS_FILE || './tokens.txt')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const RAMP = __ENV.RAMP || '2m';
const DURATION = __ENV.DURATION || '10m';

export const options = {
  scenarios: {
    lectores: {
      executor: 'ramping-vus',
      exec: 'leer',
      stages: [
        { target: scaled(500), duration: RAMP },
        { target: scaled(500), duration: DURATION },
      ],
    },
    equipo: {
      executor: 'ramping-vus',
      exec: 'operar',
      stages: [
        { target: scaled(50), duration: RAMP },
        { target: scaled(50), duration: DURATION },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.001'],
    'http_req_duration{tipo:lectura,expected_response:true}': ['p(95)<400'],
    'http_req_duration{tipo:escritura,expected_response:true}': ['p(95)<800'],
  },
};

function headersFor(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function animalsOf(headers) {
  const list = http.get(`${API}/animals`, { headers, tags: { name: 'animales', tipo: 'lectura' } });
  check(list, { 'listar 200': (r) => r.status === 200 });
  return list.status === 200 ? list.json() : [];
}

/** Una persona abre la lista y salta entre perfiles de animales distintos. */
export function leer() {
  const headers = headersFor(pick(tokens));
  const animals = animalsOf(headers);
  for (let i = 0; i < 3 && animals.length > 0; i++) {
    const animal = pick(animals);
    const tags = { tipo: 'lectura' };
    const detail = http.get(`${API}/animals/${animal.id}`, {
      headers,
      tags: { ...tags, name: 'ficha' },
    });
    check(detail, {
      'ficha 200': (r) => r.status === 200,
      'es el animal pedido': (r) => r.status === 200 && r.json('id') === animal.id,
    });
    http.get(`${API}/animals/${animal.id}/clinical-events`, {
      headers,
      tags: { ...tags, name: 'registro-clinico' },
    });
    http.get(`${API}/animals/${animal.id}/clinical-events/carnet`, {
      headers,
      tags: { ...tags, name: 'carnet' },
    });
    sleep(0.5 + Math.random());
  }
  sleep(1 + Math.random() * 2);
}

/** El equipo registra un evento clínico y actualiza la ficha del mismo animal. */
export function operar() {
  const headers = headersFor(pick(tokens));
  const animals = animalsOf(headers);
  if (animals.length === 0) return sleep(2);
  const animal = pick(animals);
  const tags = { tipo: 'escritura' };
  const event = http.post(
    `${API}/animals/${animal.id}/clinical-events`,
    JSON.stringify({
      type: 'treatment',
      occurredAt: new Date().toISOString(),
      details: { motivo: 'control de carga' },
    }),
    { headers, tags: { ...tags, name: 'evento-clinico' } },
  );
  check(event, { 'evento 201': (r) => r.status === 201 });
  const patch = http.patch(
    `${API}/animals/${animal.id}`,
    JSON.stringify({ description: `Actualizado en prueba de carga ${Date.now()}` }),
    { headers, tags: { ...tags, name: 'editar-ficha' } },
  );
  check(patch, { 'editar 200': (r) => r.status === 200 });
  sleep(2 + Math.random() * 3);
}
