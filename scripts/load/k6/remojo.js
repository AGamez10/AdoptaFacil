// Escenario 6 · Remojo (soak): 50 % de la carga pública durante 4 h. Sirve para
// ver fugas de memoria y de conexiones. Criterio: memoria de la API sin crecer
// > 10 % (métrica process_resident_memory_bytes de /metrics) y errores < 0,1 %.
//
//   k6 run -e API_URL=... scripts/load/k6/remojo.js
import publico, { setup as publicSetup } from './publico.js';
import { scaled } from './lib.js';

const rate = scaled(750);

export const options = {
  scenarios: {
    remojo: {
      executor: 'constant-arrival-rate',
      rate,
      timeUnit: '1s',
      duration: __ENV.DURATION || '4h',
      preAllocatedVUs: scaled(1000),
      maxVUs: scaled(5000),
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.001'],
    'http_req_duration{expected_response:true}': ['p(95)<150'],
  },
};

export const setup = publicSetup;
export default publico;
