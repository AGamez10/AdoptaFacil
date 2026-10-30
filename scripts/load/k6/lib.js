// Utilidades comunes de los escenarios k6 (plan de escala, cambio 1).
import http from 'k6/http';
import { check } from 'k6';

/** Base de la API, p. ej. https://staging.adoptafacil.org/api o http://localhost:3000 */
export const API = (__ENV.API_URL || 'http://localhost:3000').replace(/\/+$/, '');

/** Escala de la carga: 1 = objetivos del plan; 0.05 = humo local. */
export const SCALE = Number(__ENV.SCALE || '1');

export const scaled = (n) => Math.max(1, Math.round(n * SCALE));

export function getJson(path, tags) {
  const res = http.get(`${API}${path}`, { tags: { name: tags || path } });
  check(res, { 'status 200': (r) => r.status === 200 });
  return res;
}

/** Slugs de refugios públicos, leídos una vez en setup() del catálogo nacional. */
export function discoverSlugs(max = 200) {
  const slugs = new Set();
  let cursor = '';
  for (let i = 0; i < 10 && slugs.size < max; i += 1) {
    const res = http.get(`${API}/public/animals?limit=50${cursor ? `&cursor=${cursor}` : ''}`);
    if (res.status !== 200) break;
    const body = res.json();
    for (const a of body.data) slugs.add(a.organization.slug);
    if (!body.nextCursor) break;
    cursor = encodeURIComponent(body.nextCursor);
  }
  return [...slugs];
}

export const pick = (list) => list[Math.floor(Math.random() * list.length)];
