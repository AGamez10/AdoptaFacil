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
  - operaciones de plataforma (`/platform/organizations/:organizationId/...` de formalización y estado), protegidas con
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

### 7.1 Qué acepta quien entra por invitación (2026-11-21)

Antes, todo invitado (voluntario, operador, auditor, contador…) aceptaba las
_Condiciones para organizaciones_ con la casilla "En nombre de la organización…
declaro que puedo obligarla", como si fuera su representante legal. Ahora lo que
se acepta depende del cargo invitado (`legalAudienceForInvitation` en
`@adoptafacil/contracts`):

| Cargo invitado                                                               | Acepta                                                                                     |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Propietario                                                                  | Términos, alcance, datos y **Condiciones para organizaciones** (habla por la organización) |
| Cualquier otro (incluidos contador, revisor fiscal y personal de plataforma) | Términos, alcance, datos y **Condiciones para miembros de un equipo** (no la obliga)       |

- El texto nuevo es `docs/legal/condiciones-miembros-equipo/2026-11-21.md`
  (borrador sujeto a abogado): el miembro actúa dentro de su cargo y por encargo
  de la organización, no la representa, guarda la confidencialidad de los datos
  de terceros y firma solo lo que su cargo o designación permiten.
- La API valida el cargo de la invitación (400 `LEGAL_ACCEPTANCE_REQUIRED` con
  `missing`), y la constancia de un miembro **nunca** registra el contrato de la
  organización aunque el cliente lo envíe.
- `GET /legal/me` devuelve `audience` (`organization`, `member` o `person`) y lo
  pendiente según los roles actuales: si un miembro asciende a propietario se le
  pide aceptar las condiciones de la organización; los miembros que entraron
  antes de este cambio verán una vez la casilla de las condiciones de miembro.
- Pruebas: `invitation-legal-by-role.integration-spec.ts` (API),
  `accept-invitation-page.test.tsx` y `consent.test.ts` (web), `legal.test.ts`
  (contratos).

## 8. Cómo revertir

Hay una migración, `20261008050000_ola1_org_status_invitations` (aditiva). Para
revertir: revertir el commit y, en la base, aplicar a mano el rollback que trae
la migración en su cabecera (borrar la función de invitaciones y la tabla,
recrear las 12 funciones públicas desde sus migraciones anteriores y quitar las
columnas de estado). Nunca se aplica en un entorno compartido sin aprobación del
dueño. Los hashes ya convertidos a Argon2id **no** vuelven a bcrypt: si se
revirtiera esa parte, esas cuentas necesitarían reseteo de contraseña.

## 9. Matriz de roles: qué puede hacer cada cargo (2026-11-21)

La matriz completa, ruta por ruta, es `docs/seguridad/matriz-roles-api.md`. La
genera `apps/api/src/core/rbac/role-matrix.spec.ts` desde los decoradores reales
y falla si alguien cambia un permiso sin regenerarla, así cada cambio queda a la
vista en el PR. Esa prueba también fija las reglas que no se pueden romper:

- toda ruta autenticada declara `@Roles` o está en la lista revisada de rutas
  "solo lo propio" (su cuenta, sus donaciones, sus solicitudes…);
- el auditor solo escribe su propia firma, la decisión de un reporte que le toca
  firmar y la marca de avisos leídos;
- voluntario y colaborador temporal solo ven el estado de la organización, la
  vista previa de su portal y su panel "Mi trabajo" (`/team/me/*`), sin datos
  de adoptantes ni donantes (lo que promete su invitación);
- el veterinario solo entra a animales, historia clínica, recordatorios y su
  panel; publicar le exige el permiso expreso `animals.publish`;
- el gobierno del equipo y de la cuenta es solo de propietario y administrador,
  y lo del representante legal, solo del propietario;
- los roles de plataforma solo entran a `/platform`, y los de organización nunca.

`role-matrix-http.integration-spec.ts` lo comprueba por HTTP con una cuenta real
de cada cargo, y `nav-roles-vs-api.test.ts` (web) exige que cada menú pida los
mismos roles que la API para su página.

| Cargo                        | Puede                                                                                                                                                                                                                         | No puede                                                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Propietario                  | Todo lo de la organización; además dar o quitar el cargo de propietario, retirar roles, designar firmantes, enviar a revisión, formalización y política de firmas                                                             | Nada de plataforma                                                                                                                |
| Administrador                | Operación completa: animales, adopciones, campañas, voluntariado, donaciones, apadrinamientos, contabilidad, reportes, perfil, portal, dominio, plan, cobros; invitar y cambiar cargos                                        | Tocar a un propietario, designar firmantes, enviar a revisión, formalización, firmar como representante legal                     |
| Operador                     | Animales e historia clínica, publicar en el portal, adopciones y contratos, campañas y evidencias, recursos, custodia (crea cobros, ver §9.1), encargar tareas y animales al equipo, ver donaciones recibidas y libro público | Equipo, plan, perfil, portal, documentos legales, contabilidad, reportes, voluntariado, apadrinamientos; anular o devolver cobros |
| Veterinario/a                | Animales, historia clínica, recordatorios de salud, evaluación de comportamiento; marcar "apto para adopción"; publicar solo con permiso expreso                                                                              | Publicar sin ese permiso, adopciones, campañas, dinero, equipo, documentos                                                        |
| Voluntario/a                 | Estado de la organización y vista previa del portal; "Mi trabajo": sus tareas, ficha básica de los animales a su cargo y registro de cuidados; jornadas, horas y certificados                                                 | Datos de adoptantes y donantes, historia clínica, animales que no tiene a cargo                                                   |
| Colaborador/a temporal       | Igual que voluntario                                                                                                                                                                                                          | Igual que voluntario                                                                                                              |
| Auditor/a de solo lectura    | Leer animales, clínica, campañas, contabilidad, reportes, documentos, voluntariado, apadrinamientos, libro y custodia                                                                                                         | Crear, editar o borrar                                                                                                            |
| Contador/a, revisor/a fiscal | Lo del auditor, más registrar su propia firma y firmar los reportes de su cargo                                                                                                                                               | Firmar por otro, cualquier otra escritura                                                                                         |
| Admin. de plataforma         | Solo `/platform` (revisión de organizaciones, documentos, moderación), con segundo factor obligatorio                                                                                                                         | Entrar a los datos de una organización por sus rutas                                                                              |
| Superadmin de plataforma     | Lo del admin de plataforma, más el tablero financiero y aprobar acciones sensibles                                                                                                                                            | Igual                                                                                                                             |

### 9.1 Reglas por cargo que decide el servicio (2026-11-22)

Decisión del dueño: el panel de cada cargo tiene que tener sentido para ese
cargo. Lo que no cabe en `@Roles` se decide en el servicio, dentro de la
transacción de la organización:

- **Veterinario: ficha clínica primero.** Crea y edita fichas e historia
  clínica, y marca a un animal como apto para adopción
  (`POST /animals/:id/adoption-readiness`, auditado; avisa a quien publica).
  Un animal que crea queda `unavailable` (fuera del portal). Publicar o retirar
  (cambiar el estado a uno público, `activate`/`deactivate`) le responde 403,
  salvo que el propietario o un administrador le dé el permiso expreso
  `animals.publish` (`PUT /org/members/:userId/permissions`, tabla
  `member_permission_grants`, auditado como `member.permissions_changed`). El
  permiso se borra si le cambian el cargo o lo retiran.
- **Operador: crea cobros de custodia** con autoría auditada y al valor de la
  tarifa: mensualidad (`boarding_fee`) y alimentación (`food`) deben ser
  exactamente las del contrato emitido o vigente; gastos (`veterinary`,
  `transport`, `other`) exigen soporte; el recargo por mora (`late_fee`) es
  solo de propietario y administrador. Anular o devolver sigue siendo solo de
  propietario y administrador.
- **Voluntario y colaborador temporal: panel mínimo** en `/mi-trabajo`
  (`/team/me/*`): sus tareas (las marca hechas), la ficha básica de los
  animales que tiene a cargo (sin adoptantes, donantes ni historia clínica) y
  el registro de cuidados (paseo, alimentación, limpieza, observación;
  `animal_care_logs`, solo se agrega, hasta 7 días atrás). Solo registra
  cuidados de un animal con un encargo abierto a su nombre (si no, 404).
  Jornadas, horas y certificados siguen en `/voluntariado`. Quien necesite más
  recibe el cargo de operador.
- **Encargos** (`team_assignments`): los crean propietario, administrador y
  operador (`POST /team/assignments`) para cualquier cargo del equipo menos el
  auditor; la persona recibe un aviso en su bandeja.
