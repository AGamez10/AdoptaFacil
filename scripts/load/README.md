# Pruebas de carga (plan de escala, cambio 1)

Toda cifra de capacidad de AdoptaFácil es una **hipótesis** hasta que estos
escenarios la confirmen contra un entorno igual al de producción (mismo VPS,
mismo compose, CDN delante). Un resultado en un portátil o en CI compartido
solo sirve para encontrar el primer cuello de botella, no para prometer
capacidad.

## 1. Datos sintéticos

```bash
# Owner de la base (DATABASE_URL), nunca producción.
scripts/load/seed-escala.sh                          # 1.000 refugios, 200.000 animales, 5.000 campañas
ORGS=50 ANIMALS_PER_ORG=40 scripts/load/seed-escala.sh   # versión corta
```

Se niega con `NODE_ENV=production` y si la base no es local, salvo
`LOAD_SEED_TARGET=staging` (un staging desechable). Todo queda marcado con
`Escala …` y slugs `escala-…`.

## 2. Escenarios k6

| Archivo               | Escenario del plan                                              | Objetivo (hipótesis)                                   |
| --------------------- | --------------------------------------------------------------- | ------------------------------------------------------ |
| `k6/publico.js`       | Navegación pública: catálogo nacional, portal, campañas, banner | 1.500 lecturas/s 30 min, p95 < 150 ms, errores < 0,1 % |
| `k6/campana-viral.js` | Pico sobre una campaña: 0 → 5.000 lecturas/s en 60 s            | p95 < 200 ms, errores < 0,5 %                          |
| `k6/refugio.js`       | Refugios autenticados: listar, crear animal, adopciones         | 1.000 usuarios, p95 < 500 ms, errores < 0,1 %          |
| `k6/remojo.js`        | 50 % de la carga pública durante 4 h                            | memoria estable (± 10 %), errores < 0,1 %              |

```bash
k6 run -e API_URL=https://staging.adoptafacil.org/api scripts/load/k6/publico.js
# Humo local al 10 % de la carga:
k6 run -e API_URL=http://localhost:3000 -e SCALE=0.1 -e RAMP=20s -e DURATION=40s scripts/load/k6/publico.js
```

Las variables: `API_URL`, `SCALE` (1 = objetivo del plan), `RAMP`, `DURATION`,
`CAMPAIGN_ID` (campaña viral) y `ORG_TOKENS_FILE` (tokens de varios refugios de
prueba, uno por línea, para `refugio.js`). Los umbrales del plan están en cada
script: k6 termina con código distinto de 0 si se cruzan.

Mientras corre, `GET /metrics` (con `METRICS_TOKEN`) muestra la latencia por
ruta, los aciertos de caché (`public_cache_requests_total`), los 429
(`rate_limit_rejections_total`) y la memoria del proceso.

**Los escenarios de subida de fotos y de alertas de mascotas del plan quedan
pendientes** hasta que existan la subida directa a R2 y las alertas.

## 3. Primera medición (2026-10-30, entorno compartido, NO representativo)

Una sola API (`APP_ROLE=api`) detrás de PgBouncer, caché de Redis activa,
datos de `seed-escala.sh` (200.000 animales), en un contenedor de 4 vCPU
compartido con Postgres, Redis, k6 y otras pruebas:

| Carga                         | Resultado                                                        |
| ----------------------------- | ---------------------------------------------------------------- |
| 10 % (150 lecturas/s)         | p95 6,7 ms, 0 errores                                            |
| 100 % (1.500 lecturas/s)      | Satura en ~300 peticiones/s; p95 24,7 s, 27 % errores            |
| Consultas sueltas en Postgres | catálogo nacional 40–60 ms (el `count(*)` domina), campañas 3 ms |

Lectura: con una réplica en una máquina compartida el cuello es la CPU del
proceso Node, no Postgres. Por eso el compose de producción ya trae 2 réplicas
y la CDN debe absorber la mayoría de lecturas. La cifra real sale de correr
`publico.js` en el VPS con Cloudflare delante.
