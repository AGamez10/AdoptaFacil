# 12 · Runbook de entrega (estado de la Fase 0)

> Qué puede hacer hoy otra persona con este repo, sin depender de quienes lo construyeron. Lo que aún no existe está marcado **FALTA** y se cierra en la Ola 1 (`11_REMEDIATION_PLAN.md`). TANJIRO §24 exige este documento completo antes del piloto.

## 1. Levantar el sistema en local (verificado el 2026-10-07)

Requisitos: Node 20 LTS, pnpm 9.15.9, PostgreSQL 16 y Redis 7 (con Docker: `docker compose up -d`; sin Docker, servicios nativos en los mismos puertos).

```bash
pnpm install --frozen-lockfile        # genera el cliente Prisma en el postinstall
pnpm setup:env                         # crea .env desde .env.example
# BLD-001: comentar en .env las claves SMTP_* y MERCADOPAGO_* que quedan vacías,
# o la API no arranca ("String must contain at least 1 character").
pnpm prisma migrate deploy             # en una base nueva; nunca `migrate dev` sobre una compartida
pnpm --filter @adoptafacil/api build
node apps/api/dist/src/main.js         # el script `start` apunta a una ruta que no existe (R0-5)
pnpm --filter @adoptafacil/web dev
```

Comprobación: `GET http://localhost:3000/health` → `{status, db, redis}`.

## 2. Verificar calidad

| Qué                         | Comando                                                         | Resultado esperado (línea base)                                                    |
| --------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Lint + typecheck            | `pnpm turbo run lint typecheck`                                 | 9/9                                                                                |
| Build                       | `pnpm turbo run build`                                          | api + web                                                                          |
| Unitarias                   | `pnpm turbo run test`                                           | 1.372 verdes (en CI, `password.service.spec.ts` puede exceder el timeout: BLD-002) |
| Integración + `rls-no-leak` | `NODE_ENV=test pnpm --filter @adoptafacil/api test:integration` | 589/589. **No compartir el Redis con otra API en marcha** (BLD-003)                |
| Secretos                    | `gitleaks git . --redact`                                       | Solo fixtures de prueba                                                            |
| Dependencias                | `pnpm audit --prod`                                             | Hoy 1 crítica (BLD-005)                                                            |

## 3. Reproducir la auditoría de seguridad

Scripts en `evidencia/seguridad/scripts/`. Usan una base y una API dedicadas (nunca la de CI ni producción): `env.sh` define `DATABASE_URL` y `DATABASE_URL_APP` hacia una base `adoptafacil_sec`, `REDIS_URL` y el puerto 3100. Orden: `start-api.sh`, `01_actors.sh`, `04_seed_tenants.py`, `05_seed_cross.py`, `06_bola_matrix.py`, `02_rbac_escalation.sh`, `03_af001_google_fake.sh`, `stop-api.sh`. Fijar `AUDIT_DIR` a una carpeta de trabajo antes de ejecutarlos. La matriz BOLA resultante se compara contra `evidencia/seguridad/06_bola_matrix.csv` (0 fugas esperadas).

## 4. Variables de entorno críticas

| Variable                           | Producción exige                                                            | Riesgo si no                            |
| ---------------------------------- | --------------------------------------------------------------------------- | --------------------------------------- |
| `NODE_ENV`                         | `production`                                                                | —                                       |
| `DATABASE_URL`                     | Owner (solo migraciones)                                                    | —                                       |
| `DATABASE_URL_APP`                 | Rol `adoptafacil_app` **con contraseña rotada**, sin SUPERUSER ni BYPASSRLS | RLS inútil (AF-004)                     |
| `AUTH_IDENTITY_DRIVER`             | `google` + `GOOGLE_OAUTH_CLIENT_ID`                                         | Toma de cuentas (SEC-001)               |
| `PAYMENT_DRIVER`                   | Pagos apagados hasta 1.1                                                    | Webhooks falsificables (SEC-002)        |
| `NOTIFICATION_DRIVER`              | `smtp` + `SMTP_*`                                                           | Sin reset de contraseña ni invitaciones |
| `STORAGE_DRIVER`                   | S3 (FALTA el driver)                                                        | Archivos atados a una instancia         |
| `REDIS_URL`                        | Con contraseña (hoy se ignora: BLD-003)                                     | Colas sin autenticar                    |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Aleatorios, ≥ 32 bytes                                                      | Falsificación de sesiones               |
| `API_CORS_ORIGIN`                  | Solo los orígenes reales                                                    | —                                       |

## 5. Operación

| Procedimiento                   | Estado                                                                |
| ------------------------------- | --------------------------------------------------------------------- |
| Despliegue en VPS (D11)         | **FALTA** (R3-1). Hoy solo existe `DEPLOY.md` para Render.            |
| Rollback                        | **FALTA**: no hay tags ni releases; las migraciones no tienen `down`. |
| Backup de base y archivos       | **FALTA** (R3-2)                                                      |
| Restore                         | **FALTA** (R3-2): debe probarse con tiempo medido                     |
| Monitoreo y alertas             | **FALTA** (R3-3)                                                      |
| Rotación de secretos            | **FALTA**: documentar JWT, rol de BD, PSP y SMTP                      |
| Soporte: restablecer contraseña | Depende del correo real (R3-4)                                        |
| Incidentes de datos (Ley 1581)  | **FALTA** (LEG-014)                                                   |

## 6. Documentación existente y faltante (TANJIRO §24)

Existe: README, `AGENTS.md`, `CONTRIBUTING.md`, `docs/ARQUITECTURA.md`, diccionario de datos y MER (`docs/diccionario-datos/`), manuales de usuario (`docs/manual/`, con un marcador de conflicto de merge en `Manual_Administracion_Plataforma.md:111`), `docs/CONTRACTS.md` y esta carpeta.

Falta: guía de despliegue en VPS, rollback, backup/restore, monitoreo, guía de seguridad, data map definitivo (borrador en `04` §5), matriz de permisos (borrador en `evidencia/seguridad/controller_guards.txt`), release notes, inventario de terceros (proveedores, ubicación de datos).

## 7. Dependencias de personas

- **Equipo:** Sebastián (core/backend) y Fabián (web, pagos, portales) según `AGENTS.md`. `CODEOWNERS` usa marcadores que no son usuarios reales (BLD-008).
- **Historial:** reescrito, con todos los commits bajo un solo autor (BLD-007). La autoría original vive en `sebasdev-space/AdoptaFacil`.
- **Token de migración:** según `AGENTS.md`, se avisa a Fabián. En este proyecto el dueño debe confirmar quién lo concede para la rama de integración y para los entornos compartidos.
