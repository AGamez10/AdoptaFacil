# Gates de CI: seguridad, dependencias y esquema

> Hilo 4 de la Ola 1 (R0-3, R0-4, R1-10). Qué comprueba cada gate, qué deuda
> queda congelada y cómo se mantiene. Fuente de los hallazgos: `docs/auditoria/`
> (PR #1), en particular `00_BASELINE_Y_BUILD.md` y `04_SECURITY_AUDIT.md`.

## Mapa de gates

| Gate                            | Dónde                                                                        | Bloquea si…                                                                                                                                                                                                                                           | Hallazgo        |
| ------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Lint · typecheck · build · unit | `ci.yml` → `quality`                                                         | cualquier fallo                                                                                                                                                                                                                                       | BLD-002         |
| Integración + `rls-no-leak`     | `ci.yml` → `rls-no-leak`                                                     | cualquier prueba falla (PostgreSQL 16 y Redis 7 reales)                                                                                                                                                                                               | RNF03           |
| Postura RLS                     | `ci.yml` → `rls-no-leak`, paso "RLS posture" (`scripts/ci/rls-posture.sql`)  | una tabla de `public` con `organization_id` sin `ENABLE` + `FORCE` + policy; el rol `adoptafacil_app` es superusuario, `BYPASSRLS` o dueño de tablas/funciones; una `SECURITY DEFINER` sin `search_path`; una función PL/pgSQL con `EXECUTE` dinámico | AF-004, F31     |
| Deriva de esquema               | `ci.yml` → `rls-no-leak`, paso "Schema drift" (`scripts/ci/schema-drift.sh`) | `prisma/schema` y `prisma/migrations` divergen en algo que **no** esté en la línea base congelada                                                                                                                                                     | AF-018          |
| Secretos                        | `security.yml` → `secrets`                                                   | gitleaks encuentra un secreto en cualquier commit de la historia                                                                                                                                                                                      | §7.6            |
| Dependencias                    | `security.yml` → `deps`                                                      | `pnpm audit --prod` reporta una vulnerabilidad **alta o crítica** en runtime                                                                                                                                                                          | BLD-005, AF-027 |
| SQL injection (SAST)            | `security.yml` → `semgrep` (`.semgrep/sql-injection.yml`)                    | `$queryRawUnsafe`/`$executeRawUnsafe`, `Prisma.raw()` con algo distinto de un literal, o `$queryRaw(...)`/`$executeRaw(...)` llamados con SQL concatenado                                                                                             | F31             |
| Imágenes y compose              | `ci.yml` → `docker`                                                          | `docker build` de `api` o `web` falla, o `docker compose config` del despliegue es inválido                                                                                                                                                           | OPS-003         |

`security.yml` también corre a diario a las 06:00 hora Colombia (11:00 UTC):
un CVE publicado hoy pone rojo el gate aunque nadie haya tocado el código.

La **guarda de drivers en producción** (§7.6) la entrega el hilo "Arranque
seguro y flags" como prueba unitaria; corre dentro de `quality`.

## Excepciones vigentes (cada una con motivo)

### Secretos (`.gitleaks.toml`)

Las 7 coincidencias de la historia (334 commits, línea base `48cabad`) son
valores de prueba que la regla `generic-api-key` confunde con claves. Cada
excepción exige **ruta exacta y valor exacto** a la vez:

| Archivo                                                          | Valor                 | Qué es                                        |
| ---------------------------------------------------------------- | --------------------- | --------------------------------------------- |
| `apps/api/test/sponsorships.integration-spec.ts`                 | `tok_test_1234567890` | token de tarjeta ficticio del Brick           |
| `apps/api/src/core/payments/mercadopago-payment.adapter.spec.ts` | `123456789-approved`  | clave de idempotencia ficticia                |
| `apps/api/src/core/payments/wompi-payment.adapter.spec.ts`       | `trx-1-APPROVED`      | ídem, adaptador Wompi borrado (solo historia) |

Prueba negativa hecha: un `AKIA…` y el mismo `dedupKey` en otro archivo sí se
detectan. No hay allowlist global.

### Postura RLS

| Tabla              | Motivo                                                                                                           | Salida                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `auth_credentials` | El login la consulta por correo antes de conocer el tenant, por eso no tiene RLS. Contiene hashes de contraseña. | Moverla tras una función `SECURITY DEFINER` acotada (hilo de seguridad) y retirar la excepción. |

Avisos que **no bloquean** hoy (deuda registrada, se ven en el log del paso):

- **SQLI-03:** las 94 funciones `SECURITY DEFINER` fijan `search_path=public`
  sin `pg_temp` al final. Corregirlo exige una migración (una por PR, con token).
- Tres `SECURITY DEFINER` ejecutables por `PUBLIC`
  (`donation_certificate_public`, `organization_slug_by_subdomain`,
  `donation_certificate_for_donor`): confirmar que deben serlo.

### Deriva de esquema (AF-018)

`scripts/ci/schema-drift.baseline.sql` congela las 55 sentencias de deriva de
la entrega: 54 llaves foráneas (sobre todo `*_organization_id_fkey`) que crean
las migraciones y `prisma/schema` no declara, y el índice trigram
`organizations_name_trgm_idx`. Riesgo concreto: un `prisma migrate dev` hoy
generaría una migración que **borra** esas llaves. El gate impide que crezca;
cuando alguien declare relaciones en `prisma/schema`, el job avisa y se encoge
la línea base con `scripts/ci/schema-drift.sh --update-baseline` (requiere
`SHADOW_DATABASE_URL` apuntando a una base vacía y desechable).

### Dependencias

`pnpm.overrides` del `package.json` raíz, acotados al rango vulnerable para no
mover versiones sanas:

| Paquete            | Antes          | Después        | Aviso que cierra                                                  |
| ------------------ | -------------- | -------------- | ----------------------------------------------------------------- |
| `proxy-addr`       | 2.0.7          | 2.0.8          | GHSA-jqcg-44mw-7w3h (**crítica**, suplantación de IP)             |
| `multer`           | 2.0.2          | 2.4.0          | 6 altas (DoS) y 2 moderadas/bajas                                 |
| `nodemailer`       | 9.0.3          | 10.0.16        | 2 altas (ReDoS) y 5 moderadas; cambio mayor: solo exige Node ≥ 20 |
| `brace-expansion`  | 1.1.16 / 2.1.2 | 1.1.21 / 2.1.7 | 4 altas (vía `exceljs`)                                           |
| `lodash`           | 4.17.21        | 4.18.1         | GHSA-r5fr-rjxr-66jc (alta)                                        |
| `qs`               | 6.14.2         | 6.16.0         | 3 moderadas                                                       |
| `body-parser`      | 1.20.4         | 1.20.8         | 1 baja                                                            |
| `react-router-dom` | 6.30.4         | 6.30.6         | GHSA-jjmj-jmhj-qwj2 (moderada)                                    |

Resultado: `pnpm audit --prod` pasa de **1 crítica, 17 altas, 21 moderadas,
2 bajas** a **0 críticas, 0 altas, 7 moderadas**.

Moderadas de runtime que quedan (solo se cierran con un cambio de versión
mayor; se aceptan hasta que un hallazgo lo justifique):

| Paquete                               | Arreglo | Por qué no ahora                                    |
| ------------------------------------- | ------- | --------------------------------------------------- |
| `@nestjs/core` 10                     | 11.1.18 | migrar NestJS 10 → 11 toca toda la API              |
| `file-type` 20 (vía `@nestjs/common`) | 21.3.2  | lo fija NestJS 10                                   |
| `uuid` 8/9 (transitivo)               | 11.1.1  | cambio mayor en dependencias de terceros            |
| `react-router` 6 (2 avisos)           | 7.18    | migración mayor del router del web (zona de Fabián) |

Árbol completo (incluye herramientas de desarrollo): 3 críticas y 26 altas,
todas en devDependencies: `vitest` 2 / `tinypool` 1 (RCE solo con el servidor
UI de Vitest expuesto o con opciones controladas por un atacante; el CI no lo
usa), `vite` 5 (servidor de desarrollo), `@nestjs/cli`, `commitlint`,
`html-to-docx`. No llegan a la imagen de producción. Cerrarlas pide Vitest 4 y
Vite 6+: tarea propia, fuera de este PR. El gate las muestra en el resumen del
job sin bloquear.

## Cómo reproducir en local

```bash
pnpm audit --prod --audit-level high                       # gate de dependencias
gitleaks git . --config .gitleaks.toml --redact            # gitleaks 8.24.3
semgrep scan --config .semgrep --error --metrics=off \
  --exclude '*.spec.ts' --exclude '*.integration-spec.ts' --exclude test \
  apps packages scripts
psql "postgresql://adoptafacil:adoptafacil@localhost:5433/adoptafacil" \
  -v ON_ERROR_STOP=1 -v app_role=adoptafacil_app -f scripts/ci/rls-posture.sql
SHADOW_DATABASE_URL=postgresql://adoptafacil:adoptafacil@localhost:5433/shadow \
  scripts/ci/schema-drift.sh
```
