# Guía para la auditoría: AdoptaFácil

Esta carpeta es el punto de entrada para quien audita el proyecto. Está en la rama
`auditoria-2026-11-15`, creada desde el commit `0b530f8`. Lo que cambia respecto a esa base
es solo documentación: no hay cambios de código de producto en esta rama.

Lee primero [PENDIENTES_Y_LIMITACIONES.md](PENDIENTES_Y_LIMITACIONES.md). Dice qué no está
validado, qué está pendiente y qué falta en el paquete.

## 1. Clonar y arrancar

Los pasos completos están en la sección «Auditoría: clonar, verificar y arrancar» del
[README raíz](../README.md). En resumen:

```bash
git clone --branch auditoria-2026-11-15 --single-branch https://github.com/AGamez10/AdoptaFacil.git
cd AdoptaFacil
# Node 24 y pnpm 9.15.9
pnpm install --frozen-lockfile
pnpm --filter @adoptafacil/contracts build   # obligatorio antes de tests y typecheck de la API
pnpm typecheck
pnpm lint
```

Requisitos: Node 24, pnpm 9.15.9, PostgreSQL 16 y Redis (solo para pruebas de integración y para
arrancar la API). Para arrancar local, `pnpm setup:env` crea `.env` a partir de `.env.example`.
`.env` no está versionado.

## 2. Mapa del producto

**Módulos de la API** (`apps/api/src/modules/`):

| Módulo                                 | Qué cubre                                                             |
| -------------------------------------- | --------------------------------------------------------------------- |
| `accounting`, `ledger`                 | Contabilidad, libro mayor, conciliación                               |
| `adoptions`                            | Solicitudes de adopción, contratos, firmas                            |
| `animals`                              | Catálogo de animales y fichas                                         |
| `campaigns`                            | Campañas de recaudo                                                   |
| `coffee`                               | Trazabilidad de lotes de café (publicaciones, aprobación)             |
| `community`                            | Comunidad, directorio de servicios, reseñas, pre-registro de negocios |
| `consents`                             | Consentimientos y tratamiento de datos                                |
| `custody`                              | Custodia de animales y documentación                                  |
| `dashboards`, `reports`, `org-exports` | Paneles, reportes y exportaciones                                     |
| `donations`                            | Donaciones                                                            |
| `marketplace`                          | Recursos y ofertas entre organizaciones                               |
| `org`                                  | Organizaciones, miembros, planes y límites                            |
| `payments`                             | Pagos (Mercado Pago, OAuth, suscripciones, webhooks)                  |
| `platform-workspace`                   | Panel de la plataforma: aprobaciones de cuatro ojos y TOTP            |
| `portals`                              | Portales públicos de cada organización                                |
| `reputation`                           | Reseñas y reputación                                                  |
| `resources`                            | Banco de recursos                                                     |
| `sponsorships`                         | Apadrinamientos                                                       |
| `volunteering`                         | Voluntariado, jornadas y certificados                                 |

**Aplicación web** (`apps/web/src/features/`): `auth`, `adoptions`, `animals`, `campaigns`,
`catalog`, `certificates`, `coffee`, `community`, `consents`, `custody`, `donations`, `guias`,
`guide`, `landing`, `ledger`, `legal`, `marketplace`, `notifications`, `org`, `payments`,
`platform-team`, `portals`, `reputation`, `resources`, `sponsorships`, `transparency`,
`volunteering`.

**Base de datos:** esquemas de Prisma por módulo en `prisma/schema/*.prisma`, migraciones en
`prisma/migrations/`. Multi-tenant con `organization_id` y RLS. La aplicación usa el rol
`adoptafacil_app`, que no es superusuario. Las comprobaciones están en `scripts/ci/`
(`schema-drift.sh` y `rls-posture.sql`).

**Paquetes compartidos:** `packages/contracts` (tipos y validaciones, con build ESM y CJS) y los
paquetes de UI.

## 3. Pruebas

```bash
pnpm --filter @adoptafacil/contracts test     # contratos
pnpm --filter @adoptafacil/api test           # unitarias de la API
pnpm --filter @adoptafacil/web test           # unitarias de la web (vitest)
```

**Integración** (necesita PostgreSQL 16 y Redis en marcha, y el `.env` apuntando a ellos):

```bash
pnpm --filter @adoptafacil/api db:deploy      # migraciones en la base de pruebas
pnpm --filter @adoptafacil/api test:integration
```

Ejemplo de referencia que sí corrimos: `custody.integration-spec.ts`, 9 de 9 en verde.

**Carga (k6):** `scripts/load/`, ver `scripts/load/README.md`. Está pensado para staging
desechable. El script de sembrado se niega con `NODE_ENV=production` y en bases no locales,
salvo `LOAD_SEED_TARGET=staging`. Las cifras de capacidad son hipótesis hasta medirlas en un
entorno igual al de producción. Esto no se ha ejecutado en un servidor.

## 4. Datos de demostración

No hay contraseña de administrador por defecto. Todo se pasa por variables de entorno:

| Comando                                                            | Qué hace                                 | Notas                                                               |
| ------------------------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------- |
| `PLATFORM_ADMIN_EMAIL=… PLATFORM_ADMIN_PASSWORD=… pnpm seed:admin` | Crea el administrador de la plataforma   | Credenciales propias. No hay valores por defecto.                   |
| `SEED_DEMO_PASSWORD=… pnpm seed:demo`                              | Organizaciones y donante de demostración | Sin la variable usa un valor de desarrollo. Se niega en producción. |
| `pnpm seed:trafico --yes-demo`                                     | Datos de tráfico                         | Solo base de demostración.                                          |
| `pnpm seed:volumen --yes-demo`                                     | Volumen de datos                         | Solo base de demostración.                                          |
| `pnpm demo:prepare`                                                | Todo lo anterior en orden                | Para demostración local.                                            |

## 5. Integraciones externas: cómo apagarlas

Para revisar el producto sin tocar servicios reales, en `.env`:

- `PAYMENT_DRIVER=fake` (o `disabled`). Mercado Pago real requiere credenciales de prueba propias.
- `NOTIFICATION_DRIVER=log` (imprime `[SIMULATED]`) o `smtp` apuntando a Mailpit
  (`localhost:1025`, interfaz en `localhost:8025`, incluido en `docker-compose.yml`).
- `STORAGE_DRIVER=disk`.
- `AUTH_IDENTITY_DRIVER=fake` (o `google` con un `GOOGLE_OAUTH_CLIENT_ID` propio).
- `DIAN_DRIVER=fake` y `SIGNATURE_DRIVER=fake`. La facturación electrónica y la firma no se
  validaron con proveedores reales.

La integración OAuth real de Mercado Pago tiene un caso abierto (PSO16, ticket WCS-58365). Está
en el archivo de pendientes.

## 6. Referencias de auditoría anteriores

Ver [REFERENCIAS.md](REFERENCIAS.md). Son documentos de una fase previa (baseline `48cabad`,
7 de octubre de 2026) y un análisis de lógica de negocio del 6 de noviembre de 2026. Algunos de
sus hallazgos pueden estar ya corregidos en `0b530f8`. Hay que verificarlos antes de darlos por
vigentes.
