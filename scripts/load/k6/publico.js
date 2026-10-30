// Escenario 1 · Navegación pública: portal, catálogo nacional, ficha de
// campaña y listados. Objetivo del plan (hipótesis hasta medir): 10.000
// usuarios concurrentes, 1.500 lecturas/s sostenidas 30 min, p95 150 ms con
// caché y errores < 0,1 %.
//
//   k6 run -e API_URL=https://staging.../api scripts/load/k6/publico.js
//   k6 run -e SCALE=0.05 -e DURATION=1m scripts/load/k6/publico.js   # humo local
import { sleep } from 'k6';
import { API, discoverSlugs, getJson, pick, scaled } from './lib.js';

const rate = scaled(1500);

export const options = {
  scenarios: {
    publico: {
      executor: 'ramping-arrival-rate',
      startRate: Math.max(1, Math.round(rate / 10)),
      timeUnit: '1s',
      preAllocatedVUs: scaled(2000),
      maxVUs: scaled(10000),
      stages: [
        { target: rate, duration: __ENV.RAMP || '5m' },
        { target: rate, duration: __ENV.DURATION || '30m' },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.001'],
    'http_req_duration{expected_response:true}': ['p(95)<150'],
  },
};

export function setup() {
  const slugs = discoverSlugs();
  if (slugs.length === 0)
    throw new Error(`Sin refugios públicos en ${API}: carga seed-escala primero`);
  return { slugs };
}

const SPECIES = ['', 'dog', 'cat'];

export default function ({ slugs }) {
  const roll = Math.random();
  if (roll < 0.35) {
    const species = pick(SPECIES);
    const page = 1 + Math.floor(Math.random() * 3);
    getJson(
      `/public/animals?limit=50&page=${page}${species ? `&species=${species}` : ''}`,
      'catalogo',
    );
  } else if (roll < 0.6) {
    getJson(`/public/organizations/${pick(slugs)}`, 'portal');
  } else if (roll < 0.8) {
    getJson(`/public/organizations/${pick(slugs)}/animals?limit=20`, 'portal-animales');
  } else if (roll < 0.95) {
    getJson('/public/campaigns?limit=20', 'campanas');
  } else {
    getJson('/public/hero-banner', 'banner');
  }
  sleep(0.1);
}
