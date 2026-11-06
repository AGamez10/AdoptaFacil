// Escenario 3 · Trabajo del refugio autenticado: listar animales, crear uno y
// leer adopciones. Objetivo (hipótesis): 1.000 usuarios concurrentes, 150
// escrituras/s, p95 500 ms, errores < 0,1 %.
//
// Necesita tokens de cuentas de prueba de VARIOS refugios (uno por línea) en
// ORG_TOKENS_FILE: el límite por refugio (ORG_WRITE_RATE_LIMIT_PER_MIN) hace
// que un solo refugio no pueda generar 150 escrituras/s, a propósito.
//
//   k6 run -e API_URL=... -e ORG_TOKENS_FILE=tokens.txt scripts/load/k6/refugio.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, pick, scaled } from './lib.js';

const tokens = open(__ENV.ORG_TOKENS_FILE || './tokens.txt')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

export const options = {
  scenarios: {
    refugio: {
      executor: 'ramping-vus',
      stages: [
        { target: scaled(1000), duration: '3m' },
        { target: scaled(1000), duration: __ENV.DURATION || '10m' },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.001'],
    'http_req_duration{expected_response:true}': ['p(95)<500'],
  },
};

export default function () {
  const headers = {
    Authorization: `Bearer ${pick(tokens)}`,
    'Content-Type': 'application/json',
  };
  const list = http.get(`${API}/animals?limit=20`, { headers, tags: { name: 'animales' } });
  check(list, { 'listar 200': (r) => r.status === 200 });
  if (Math.random() < 0.15) {
    const created = http.post(
      `${API}/animals`,
      JSON.stringify({ name: `Carga ${Date.now()}`, species: 'dog', sex: 'female', size: 'small' }),
      { headers, tags: { name: 'crear-animal' } },
    );
    check(created, { 'crear 201': (r) => r.status === 201 });
  }
  http.get(`${API}/adoptions?limit=20`, { headers, tags: { name: 'adopciones' } });
  sleep(1 + Math.random() * 2);
}
