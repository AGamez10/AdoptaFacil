import { Counter, collectDefaultMetrics, Histogram, Registry } from 'prom-client';

/**
 * Plan de escala (B9): one Prometheus registry per process. Labels never carry
 * ids, slugs, tokens or query strings — only the route TEMPLATE
 * (`/public/organizations/:slug`), so cardinality stays bounded and no
 * personal data reaches the metrics.
 */
export const metricsRegistry = new Registry();
collectDefaultMetrics({ register: metricsRegistry });

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency by method, route template and status class',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.15, 0.25, 0.4, 0.6, 1, 2, 5],
  registers: [metricsRegistry],
});

export const publicCacheResults = new Counter({
  name: 'public_cache_requests_total',
  help: 'Public read cache lookups by result (hit, miss)',
  labelNames: ['result'] as const,
  registers: [metricsRegistry],
});

export const rateLimitRejections = new Counter({
  name: 'rate_limit_rejections_total',
  help: 'Requests answered 429 by the scale budgets (public, org_write)',
  labelNames: ['budget'] as const,
  registers: [metricsRegistry],
});
