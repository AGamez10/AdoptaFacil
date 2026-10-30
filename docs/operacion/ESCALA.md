# Escala: qué hay en el despliegue y cómo se mide

Plan de escala del MVP (cambios 1–13). Toda cifra de capacidad es hipótesis
hasta que `scripts/load/` la confirme en el VPS (ver `scripts/load/README.md`).

## Topología del compose de producción (`deploy/compose.yaml`)

```
Cloudflare (CDN) → Caddy → api ×API_REPLICAS (APP_ROLE=api, solo HTTP)
                                 │
                 worker ×WORKER_REPLICAS (APP_ROLE=worker, colas y correo)
                                 │
          pgbouncer (modo transacción) → postgres
          redis (colas, noeviction)   redis-cache (lecturas públicas, allkeys-lru)
```

| Servicio      | Qué hace                                                                                                                                                                            | Variables en `deploy/.env`                                      |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `api`         | HTTP, 2 réplicas por defecto. Los `@Processor` quedan inactivos                                                                                                                     | `API_REPLICAS` (2), `API_DB_POOL_SIZE` (10 por réplica)         |
| `worker`      | Correo, recordatorios, seguimientos, verificaciones                                                                                                                                 | `WORKER_REPLICAS` (1)                                           |
| `pgbouncer`   | Reparte pocas conexiones reales de Postgres entre todas las réplicas. El RLS sigue intacto: `app.current_org_id` y `statement_timeout` se fijan con `SET LOCAL` en cada transacción | `PGBOUNCER_POOL_SIZE` (20), `PGBOUNCER_MAX_DB_CONNECTIONS` (40) |
| `redis-cache` | Caché de lecturas públicas; perderlo solo enfría la caché                                                                                                                           | `REDIS_CACHE_MAXMEMORY` (256mb)                                 |

Las migraciones (servicio `migrate`) van directo a Postgres, nunca por PgBouncer.

## Variables nuevas de la API (`apps/api/src/config/env.validation.ts`)

| Variable                                         | Por defecto | Para qué                                              |
| ------------------------------------------------ | ----------- | ----------------------------------------------------- |
| `APP_ROLE`                                       | `all`       | `api`, `worker` o ambos (desarrollo)                  |
| `DATABASE_POOL_SIZE` / `DATABASE_POOL_TIMEOUT_S` | Prisma / 10 | Pool explícito por proceso                            |
| `DATABASE_PGBOUNCER`                             | `false`     | `true` si `DATABASE_URL_APP` apunta a PgBouncer       |
| `DATABASE_STATEMENT_TIMEOUT_MS`                  | 15000       | Tope por sentencia dentro de transacciones con tenant |
| `REDIS_CACHE_URL` / `PUBLIC_CACHE_TTL_S`         | vacío / 30  | Caché de lecturas públicas y `s-maxage` para la CDN   |
| `PUBLIC_RATE_LIMIT_PER_MIN`                      | 600         | Lecturas públicas por IP y minuto                     |
| `ORG_WRITE_RATE_LIMIT_PER_MIN`                   | 300         | Escrituras por organización y minuto                  |
| `STORAGE_PUBLIC_CDN_BASE_URL`                    | vacío       | Host de CDN para fotos y logos públicos               |
| `METRICS_TOKEN`                                  | vacío (404) | `GET /metrics` con `Authorization: Bearer`            |
| `HTTP_ACCESS_LOG`                                | `false`     | Una línea JSON por petición, sin URL, IP ni usuario   |

## Cloudflare (pasos en el panel, no en el repo)

1. Subdominio de imágenes (p. ej. `img.adoptafacil.org`) con proxy activo hacia
   el VPS y `STORAGE_PUBLIC_CDN_BASE_URL=https://img.adoptafacil.org/api`.
2. Regla de caché "Cache everything, respetar el TTL del origen" para
   `/api/storage/public*` y `/api/public/*`. La API ya manda `Cache-Control`.
3. Con Cloudflare delante hay un salto más: `TRUST_PROXY_HOPS=2`, o el límite
   por IP contaría a todos los visitantes como la IP de Cloudflare.

## Métricas que deciden el siguiente paso

Los disparadores del plan (réplica de lectura, Postgres aparte, más nodos)
se leen en `/metrics`: `http_request_duration_seconds` por ruta,
`public_cache_requests_total`, `rate_limit_rejections_total` y las métricas de
proceso (CPU, memoria). Hace falta un Prometheus o Grafana Cloud que las
recoja; eso se configura fuera del repo.
