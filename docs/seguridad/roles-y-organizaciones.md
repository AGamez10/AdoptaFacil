# Roles y organizaciones (Ola 1 · hilo 2)

Reglas de autoridad dentro de una organización y entre la plataforma y las
organizaciones. Cierra AF-007, AF-008, AF-009, AF-017, AF-023, AF-026, AF-037,
SEC-003 (parte de formalización) y SEC-022 de la auditoría de la Fase 0. Las
pruebas que lo demuestran por HTTP están en `apps/api/test/`:
`rbac-governance`, `formalization`, `tenant-context`, `org-status`,
`invitations` y `rls-no-leak-organization-invitations` (`*.integration-spec.ts`).

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
    `/platform/organizations/:organizationId/...` de formalización y estado), protegidas con
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

## 6. Estado operativo de la organización (R2-1, AF-023, MVP-RF-07/10)

Segunda dimensión de estado, independiente de la formalización:
`draft` → `pending_review` → `observed` / `approved` / `rejected`, y
`approved` ⇄ `suspended`.

| Transición                                            | Quién                      | Endpoint                                              |
| ----------------------------------------------------- | -------------------------- | ----------------------------------------------------- |
| `draft` u `observed` → `pending_review`               | Owner de la organización   | `POST /org/status/submit`                             |
| `pending_review` → `approved`, `observed`, `rejected` | PlatformAdmin / SuperAdmin | `POST /platform/organizations/:organizationId/status` |
| `observed` → `rejected`; `rejected` → `observed`      | PlatformAdmin / SuperAdmin | ídem                                                  |
| `approved` → `suspended`, `observed`                  | PlatformAdmin / SuperAdmin | ídem                                                  |
| `suspended` → `approved`                              | PlatformAdmin / SuperAdmin | ídem                                                  |

- Las transiciones viven en `ORGANIZATION_STATUS_TRANSITIONS`
  (`@adoptafacil/contracts`). Cualquier otra es 400. `observed`, `rejected` y
  `suspended` exigen motivo, que la organización lee en `GET /org/status`.
- Dos revisores a la vez: actualización condicional, solo uno gana (409 o 400
  para el otro).
- Cola de revisión: `GET /platform/organizations?status=pending_review` (solo
  organizaciones reales, nunca la organización personal de una persona).
- Auditoría: `organization.status_changed` en la organización afectada, con
  `from`, `to`, `reason` y `by` (`organization` o `platform`).
- **Solo las `approved` son públicas.** El filtro está en la base: las 12
  funciones `SECURITY DEFINER` de la superficie pública (portal por slug y
  subdominio, tema, animales, campañas y su rendición de cuentas, voluntariado,
  marketplace y banco de recursos) exigen `o.status = 'approved'`; el catálogo
  global de animales lo filtra en `public-animals.service.ts`.
- **Suspensión:** `JwtAuthGuard` lee el estado en cada petición autenticada
  (no del token, así que aplica de inmediato a tokens ya emitidos) y responde
  403 con `code: "ORGANIZATION_SUSPENDED"`. Siguen abiertos `/auth/*` y
  `GET /org/status`. No se borra nada.
- Las organizaciones existentes antes de este cambio quedaron `approved`. Las
  nuevas nacen `draft`; las cuentas de persona y la del administrador de
  plataforma nacen `approved` (no tienen portal ni revisión).
- Qué debe estar completo para enviar a revisión no lo fija el documento base:
  `TODO(client)` en `OrganizationStatusService.submit` (sin requisito por ahora).
- Pendiente para la experiencia (R3-6, `apps/web`): botón "Enviar a revisión",
  aviso de estado y de suspensión en el backoffice, y la cola de revisión en el
  panel de plataforma. La API ya está lista.

## 7. Invitaciones de miembros (R2-3, AF-017, condición C9)

| Endpoint                         | Quién                      | Reglas                                                                                                            |
| -------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `POST /org/invitations`          | Owner, Administrator       | `{ email, role }` con rol de organización. **Solo un Owner invita a un Owner.** Correo con cuenta existente: 409. |
| `GET /org/invitations`           | Owner, Administrator       | Las de su organización, con estado `pending`/`accepted`/`revoked`/`expired`.                                      |
| `DELETE /org/invitations/:id`    | Owner, Administrator       | Revoca una pendiente (204); la de un Owner solo la revoca un Owner.                                               |
| `POST /auth/invitations/preview` | Público, con límite por IP | `{ token }` → organización, correo, rol y vencimiento.                                                            |
| `POST /auth/invitations/accept`  | Público, con límite por IP | `{ token, displayName, password }` → crea la cuenta en esa organización con ese rol y devuelve la sesión.         |

- Token aleatorio de 32 bytes. En la base solo queda su hash SHA-256; el token
  viaja únicamente en el correo, en el fragmento del enlace
  (`{WEB_BASE_URL}/invitacion#token=…`), así que no llega a logs, proxies ni al
  `Referer`. Nunca se devuelve en la API ni se audita.
- Un solo uso (actualización condicional: dos aceptaciones simultáneas crean una
  sola cuenta), ligado a una organización y a un correo, con vencimiento de 7
  días (`INVITATION_TTL_MS`, `TODO(client)` para confirmar). Reinvitar el mismo
  correo revoca el enlace anterior.
- Todo token inválido, vencido, usado o revocado recibe la misma respuesta
  (400), sin revelar cuál fue el caso. Una organización suspendida o rechazada
  no incorpora a nadie por un enlace pendiente.
- Tabla `organization_invitations` con RLS (ENABLE + FORCE + `tenant_isolation`)
  y sin DELETE para el rol de la app. El invitado aún no tiene tenant: el token se
  resuelve con la función acotada `organization_invitation_by_token_hash`.
- Auditoría: `invitation.created`, `invitation.revoked`, `invitation.accepted`.
- Pendiente para la experiencia (R3-6, `apps/web`): pantalla de equipo para
  invitar y la página `/invitacion` que lee el token del fragmento.

## 8. Cómo revertir

Hay una migración, `20261008050000_ola1_org_status_invitations` (aditiva). Para
revertir: revertir el commit y, en la base, aplicar a mano el rollback que trae
la migración en su cabecera (borrar la función de invitaciones y la tabla,
recrear las 12 funciones públicas desde sus migraciones anteriores y quitar las
columnas de estado). Nunca se aplica en un entorno compartido sin aprobación del
dueño. Los hashes ya convertidos a Argon2id **no** vuelven a bcrypt: si se
revirtiera esa parte, esas cuentas necesitarían reseteo de contraseña.
