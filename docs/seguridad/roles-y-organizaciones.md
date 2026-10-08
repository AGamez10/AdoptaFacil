# Roles y organizaciones (Ola 1 · hilo 2)

Reglas de autoridad dentro de una organización y entre la plataforma y las
organizaciones. Cierra AF-007, AF-008, AF-009, AF-026, AF-037, SEC-003 (parte de
formalización) y SEC-022 de la auditoría de la Fase 0. Las pruebas que lo
demuestran por HTTP están en `apps/api/test/rbac-governance.integration-spec.ts`,
`apps/api/test/formalization.integration-spec.ts` y
`apps/api/test/tenant-context.integration-spec.ts`.

Cadena de seguridad: **JWT** (quién eres y tu organización) → **RBAC**
deny-by-default, siempre dentro del tenant del JWT → **RLS** en PostgreSQL.

## 1. De dónde sale el tenant (AF-009)

- El tenant de una petición sale **solo** del claim `org` de un access token
  válido (`apps/api/src/core/tenant/tenant-context.middleware.ts`).
- Se eliminó el respaldo por cabecera `x-org-id`. Ninguna cabecera, query ni
  body puede fijar ni cambiar el tenant: una petición sin token válido corre sin
  contexto (RLS devuelve cero filas y `withTenant` rechaza).
- Quedan rutas que reciben un `organizationId` del cliente, todas **fuera** del
  contexto de tenant y revisadas:
  - filtros de catálogos públicos (`GET /public/marketplace/products`,
    `GET /public/resources/needs`, `GET /public/donations/organizations/:id/availability`),
    que solo leen datos ya públicos;
  - operaciones de plataforma (`/platform/payouts`, `/platform/reconciliation`,
    `/platform/organizations/:organizationId/...`), protegidas con
    `@Roles(...PLATFORM_ROLES)` y auditadas en la organización destino.

## 2. Roles de organización (§13 del documento base)

`Owner`, `Administrator`, `Operator`, `Volunteer`, `TemporaryCollaborator`,
`Veterinarian`, `ReadOnlyAuditor`. Los roles de plataforma (`PlatformAdmin`,
`PlatformSuperAdmin`) nunca se otorgan ni revocan por los endpoints de la
organización (400): se aprovisionan con `pnpm seed:admin`.

| Endpoint                           | Quién                                 | Reglas                                                                                                                                    |
| ---------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /rbac/my-roles`               | Cualquier usuario autenticado         | Sus propios roles en su organización.                                                                                                     |
| `GET /rbac/roles`                  | Owner, Administrator, ReadOnlyAuditor | Asignaciones de su organización.                                                                                                          |
| `POST /rbac/roles`                 | Owner, Administrator                  | **Solo un Owner otorga `owner`** (AF-007): un Administrator recibe 403, para sí o para otro. Usuario de otra organización: 404. Auditado. |
| `DELETE /rbac/roles/:userId/:role` | Owner                                 | **Nunca se revoca al último Owner** (409, AF-008), con bloqueo de filas contra carreras. Parámetros inválidos: 400 (SEC-022). Auditado.   |

Eventos de auditoría: `role.assigned` y `role.revoked` (actor, usuario afectado,
rol), en la misma transacción que el cambio.

**Para quien construya sobre esto** (adopción, contrato, documentos): protege
cada endpoint nuevo con `@UseGuards(JwtAuthGuard, RolesGuard)` y
`@Roles(...)` explícitos; el guard lee los roles del usuario **dentro del tenant
del JWT**, así que un Administrator de la organización A no tiene autoridad en
la B. Si una acción debe quedar reservada al representante legal, usa
`Role.Owner` solamente.

## 3. Formalización: ESAL y ESAL con RTE solo por la plataforma (R2-2, SEC-003)

- El Owner mueve su organización entre `informal`, `en_proceso` y `formalizada`
  (`POST /org/formalization/transitions`) y puede **bajar** desde `esal` o
  `esal_rte` con motivo.
- **Entrar** en `esal` o `esal_rte` solo lo hace un PlatformAdmin o
  PlatformSuperAdmin:
  `POST /platform/organizations/:organizationId/formalization/transitions`
  con `{ targetState, reason?, evidenceDocumentId }`.
- `evidenceDocumentId` es obligatorio para esos dos estados y debe ser un
  documento **de esa organización**, `approved`, vigente (no vencido), la última
  versión de su tipo y con su archivo presente en el almacenamiento. Si no, 400
  (404 si el documento es de otra organización).
- Qué tipos de documento valen como soporte de cada estado no lo fija el
  documento base: `PLATFORM_TRANSITION_EVIDENCE` en
  `apps/api/src/modules/org/formalization.machine.ts` queda vacío con
  `TODO(client)` (cualquier documento aprobado y vigente).
- En la vía de plataforma, la revisión humana del documento reemplaza la
  verificación automática de la DIAN (no hay API oficial y el adaptador queda
  apagado en producción); el estado DIAN queda en la auditoría.
- Auditoría: `organization.formalization_changed` con `by` (`organization` o
  `platform`), `evidenceDocumentId`, `evidenceType` y `dianStatus`.

## 4. Contraseñas (AF-026)

- Hash **Argon2id** (`@node-rs/argon2`, m = 19 MiB, t = 2, p = 1: mínimo de
  OWASP). Los hashes bcrypt anteriores siguen funcionando y se reemplazan por
  Argon2id en el siguiente inicio de sesión exitoso, sin forzar un reseteo.
- Longitud mínima de una contraseña **nueva**: 12 caracteres
  (`MIN_PASSWORD_LENGTH` en `@adoptafacil/contracts`, compartido por la API y la
  web). Sin reglas de composición (NIST SP 800-63B).

## 5. Sin administrador semilla con contraseña por defecto (AF-037)

- `pnpm seed:admin` ya no tiene valores por defecto: exige
  `PLATFORM_ADMIN_EMAIL` y `PLATFORM_ADMIN_PASSWORD` (o argumentos), aplica la
  longitud mínima y rechaza variantes conocidas del antiguo `changeme123`.
- Nunca cambia en silencio la contraseña de una cuenta existente. Para rotarla:

  ```bash
  PLATFORM_ADMIN_EMAIL=… PLATFORM_ADMIN_PASSWORD='nueva-clave-larga' pnpm seed:admin -- --rotate-password
  ```

  La rotación revoca las sesiones abiertas de esa cuenta.

- Red de seguridad para bases sembradas antes del arreglo: al arrancar, si
  `admin@adoptafacil.local` todavía abre con `changeme123`, la API **no arranca en
  producción** y avisa en los demás entornos
  (`apps/api/src/core/rbac/default-credentials.check.ts`).
- `pnpm seed:demo` se niega a correr con `NODE_ENV=production` y exige
  `PLATFORM_ADMIN_EMAIL`.

## 6. Cómo revertir

Todo el cambio es de código, sin migración: revertir el commit devuelve el
comportamiento anterior. Los hashes ya convertidos a Argon2id **no** vuelven a
bcrypt: si se revirtiera, esas cuentas necesitarían reseteo de contraseña.
