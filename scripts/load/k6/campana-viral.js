// Escenario 2 · Pico de campaña viral: de 0 a 5.000 lecturas/s en 60 s sobre
// UNA campaña, sostenido 5 min. Objetivo (hipótesis): p95 200 ms, errores < 0,5 %.
//
//   k6 run -e API_URL=... -e CAMPAIGN_ID=<uuid> scripts/load/k6/campana-viral.js
import http from 'k6/http';
import { API, getJson, scaled } from './lib.js';

const peak = scaled(5000);

export const options = {
  scenarios: {
    viral: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: scaled(1000),
      maxVUs: scaled(8000),
      stages: [
        { target: peak, duration: '60s' },
        { target: peak, duration: __ENV.DURATION || '5m' },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.005'],
    'http_req_duration{expected_response:true}': ['p(95)<200'],
  },
};

export function setup() {
  if (__ENV.CAMPAIGN_ID) return { id: __ENV.CAMPAIGN_ID };
  const res = http.get(`${API}/public/campaigns?limit=1`);
  const id = res.status === 200 ? res.json().items?.[0]?.id : undefined;
  if (!id) throw new Error('Sin campañas activas: pasa CAMPAIGN_ID o carga seed-escala');
  return { id };
}

export default function ({ id }) {
  getJson(`/public/campaigns/${id}`, 'campana');
  if (Math.random() < 0.2) getJson(`/public/campaigns/${id}/accountability`, 'rendicion');
}
