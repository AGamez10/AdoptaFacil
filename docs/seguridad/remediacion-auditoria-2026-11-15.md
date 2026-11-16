# Registro de remediación — auditoría de seguridad 2026-11-15

**Fuente:** auditoría independiente `adoptafacil-run-1` (Cloudflare Security Audit Skill), rama
`auditoria-2026-11-15`, commit `dae3e013735d7b2b462bb17519d334c0ab5aa62c`. Los siete documentos
originales (REPORT.md, FINDINGS-DETAIL.md, NEEDS-VALIDATION.md, findings.json,
coverage-ledger.json, run-metadata.json, architecture.md) son evidencia independiente: **no se
copian ni se modifican aquí**; este registro solo los cita por fingerprint.

**Rama de trabajo:** `security-remediation/adoptafacil`, creada desde `claude/project-thread-svlwgg`
(`90e9351`). Decisión: `svlwgg` es la rama activa del producto. Comparte base (`0b530f8`) con el
commit auditado; la auditoría añade 2 commits de documentación y `svlwgg` 5 commits de producto
(plantilla documental, IP real tras Cloudflare, guía de producción, URLs de archivos, sesión
simulada). Ninguno de esos 5 commits tocó las causas raíz auditadas (verificado con `git diff`
sobre cada archivo citado: todos existen y conservan la lógica vulnerable). Trabajar sobre `svlwgg`
aplica las correcciones al código vigente sin reescribir historia.

## Resumen

| #   | Fingerprint                                                       | Severidad | Estado inicial | Estado final                                                                          |
| --- | ----------------------------------------------------------------- | --------- | -------------- | ------------------------------------------------------------------------------------- |
| 1   | `tenant-membership-not-revalidated:jwt-org-from-auth-credential`  | Media     | Presente       | **corrected** (ventana residual ≤ TTL del access token en rutas solo-JWT no críticas) |
| 2   | `storage-upload-public-key-overwrite-no-rbac`                     | Media     | Presente       | **corrected**                                                                         |
| 3   | `community-campaign-post-donor-broadcast-no-role-check`           | Media     | Presente       | **corrected**                                                                         |
| 4   | `organization-status.service:change:platform-team-org-suspension` | Media     | Presente       | **corrected**                                                                         |
| 5   | `web/portals/google-maps-embed-host-suffix-bypass`                | Baja      | Presente       | **partially_corrected** (falta CSP `frame-src` aplicada en el edge)                   |
| 6   | `resources/open-offers:cap-bypass-department-notification-fanout` | Baja      | Presente       | **corrected**                                                                         |

---

## 1. `tenant-membership-not-revalidated:jwt-org-from-auth-credential`

- **Estado inicial:** presente. `MembersService.remove` borra roles y refresh tokens, pero
  `auth_credentials.organization_id` sobrevive; login, Google y refresh emitían un JWT con el
  `org` de la organización que expulsó a la persona.
- **Causa raíz:** la emisión de sesión no verificaba la membresía vigente.
- **Corrección:** `TokenService.assertActiveMembership` — una cuenta de tipo `organization` sin
  ningún rol en su organización no recibe sesión. Se aplica en `issueTokens` (login con
  contraseña, Google, paso de MFA, invitación, registro) y en `rotate` (refresh). Código de error
  `401 MEMBERSHIP_REVOKED`. Las cuentas `person` (incluido el personal de plataforma) no se
  revisan: nunca tienen rol en su organización personal. Devolver un cargo
  (`PUT /org/members/:id/role`) permite volver a entrar. Además, las dos rutas de escritura que
  la auditoría identificó como explotables (subida de archivos y publicaciones de comunidad)
  verifican roles en vivo, así que un access token emitido antes de la expulsión ya no sirve
  para ellas (ver hallazgos 2 y 3).
- **Archivos:** `apps/api/src/core/auth/token.service.ts`, `apps/api/src/core/storage/storage.controller.ts`,
  `apps/api/src/modules/community/community-posts.service.ts`.
- **Pruebas:**
  - `test/org-members.integration-spec.ts` › _a removed member cannot sign in or refresh again;
    restoring a role lets them back in_ (login 401 `MEMBERSHIP_REVOKED`, refresh 401, restauración 200).
  - `test/storage.integration-spec.ts` › _refuses a removed member whose access token is still valid (403)_.
  - `test/community.integration-spec.ts` › _a member left without roles cannot publish at all (403)_.
  - `src/core/auth/token.service.spec.ts` › `live membership` (3 casos: emisión, persona, rotación).
- **Resultado:** verde. Control negativo: las pruebas nuevas fallan contra el código original.
- **Estado final:** `corrected`.
- **Riesgo residual:** otras rutas solo-JWT (sin `@Roles`) aceptan el access token ya emitido hasta
  que expira (15 min por defecto; la expulsión ya revocaba los refresh tokens). `RolesGuard` sigue
  sin ser _deny-by-default_ para rutas sin `@Roles` (nota de endurecimiento de la auditoría; cambio
  transversal en ~107 controladores, fuera del alcance de una corrección mínima).

## 2. `storage-upload-public-key-overwrite-no-rbac`

- **Estado inicial:** presente. `PUT /storage/upload` solo comparaba el `org` del JWT con el de la
  llave; la escritura única cubría solo llaves privadas.
- **Corrección:**
  1. Escritura única para **todas** las llaves (públicas y privadas): si ya hay bytes, `409`. Se
     comprueba después de validar tipo y tamaño y antes de transcodificar. Ningún flujo legítimo
     reescribe una llave: cada reserva genera una llave con UUID nuevo, y el cliente web solo
     reintenta tras un 401 (cuando nada se guardó).
  2. Rol requerido para cuentas de organización: Owner, Administrator, Operator, Veterinarian,
     Volunteer o TemporaryCollaborator. ReadOnlyAuditor y quien no tiene rol reciben `403`.
     Cuentas `person` no se revisan (no tienen rol en su organización personal).
- **No implementado (registrado):** reservas de un solo uso ligadas a usuario/propósito/expiración y
  `sha256` en `campaign_evidences` (requieren migración nueva). Con la escritura única, los bytes de
  una evidencia publicada ya no pueden cambiar por la API.
- **Archivos:** `apps/api/src/core/storage/storage.controller.ts`.
- **Pruebas:** `test/storage.integration-spec.ts` › bloque _write-once keys and the uploader role_:
  sobrescritura 409 con bytes intactos (Volunteer y Owner), roles operativos suben llaves nuevas,
  ReadOnlyAuditor 403, exmiembro 403. Las 9 pruebas previas de almacenamiento siguen verdes.
- **Estado final:** `corrected`.
- **Riesgo residual:** la comprobación de existencia y la escritura no son atómicas (dos `PUT`
  simultáneos a una llave nueva); un miembro activo puede subir bytes a una llave no reservada de su
  organización (consume cuota, no reemplaza nada publicado).

## 3. `community-campaign-post-donor-broadcast-no-role-check`

- **Estado inicial:** presente. `POST /community/posts` con `type=campaign` encolaba un correo por
  donante (hasta 5.000) para cualquier miembro.
- **Corrección (en `createOrgPost`, dentro de la transacción y antes de crear la publicación):**
  1. Una cuenta de organización sin roles no publica (`403`).
  2. Solo Owner/Administrator publican `campaign` (`CAMPAIGN_POST_ORG_ROLES`, patrón
     `assertCanManage`); Operator queda como `TODO(client)`.
  3. Tope de difusión: `MAX_CAMPAIGN_BROADCASTS_PER_DAY = 3` por organización en 24 h móviles
     (`TODO(client)`). Pasado el tope la publicación sí sale en el muro, sin volver a escribir a los
     donantes.
- **Sin cambio de permisos para otras publicaciones:** cualquier miembro activo sigue publicando
  `general`, `notice` y `event`, como antes.
- **Archivos:** `apps/api/src/modules/community/community-posts.service.ts`.
- **Pruebas:** `test/community.integration-spec.ts` › bloque _donor broadcast_: ReadOnlyAuditor,
  Volunteer, TemporaryCollaborator y Operator → 403 y 0 correos; sin roles → 403; Administrator y
  Owner difunden; la cuarta campaña del día se publica sin correos.
- **Estado final:** `corrected`.

## 4. `organization-status.service:change:platform-team-org-suspension`

- **Estado inicial:** presente. `change()` aceptaba cualquier organización, incluida la del propio
  equipo de plataforma.
- **Corrección:** `OrganizationStatusService.change()` rechaza (`403`) la organización del propio
  actor y cualquier organización que tenga asignado un rol de plataforma (`PLATFORM_ROLES`), leída
  bajo el contexto RLS de esa organización. La firma pasa a recibir el actor (`id`,
  `organizationId`).
- **Archivos:** `organization-status.service.ts`, `organization-status.controller.ts`.
- **Pruebas:** `test/org-status.integration-spec.ts` › _a PlatformAdmin cannot suspend its own team or
  another platform team (403, unchanged)_; el estado sigue `approved` y el equipo sigue entrando a
  `/platform/*`. Las suites de plataforma (workspace, MFA, dashboards, banner) siguen verdes.
- **Estado final:** `corrected`.
- **Nota:** si algún día hace falta suspender un equipo de plataforma, debe pasar por el flujo de
  cuatro ojos de líderes (`sensitive-actions.service.ts`), no por esta ruta.

## 5. `web/portals/google-maps-embed-host-suffix-bypass`

- **Estado inicial:** presente. Regex anclada solo al final (`maps.google.evil.com` pasaba) y la URL
  de incrustación se devolvía tal cual; el iframe del portal clásico no tenía `sandbox`.
- **Corrección:**
  1. Allowlist exacta de hosts de Google Maps (`google.<tld>`, `www.google.<tld>`,
     `maps.google.<tld>` para com, com.co, co y otros dominios regionales de Google), sin
     credenciales ni puerto.
  2. La URL de incrustación **siempre se reconstruye** sobre un host fijo de Google
     (`https://www.google.com/maps/embed…` o `https://maps.google.com/maps?…`), nunca la entrada cruda.
  3. `sandbox="allow-scripts allow-same-origin allow-popups"` en el iframe del portal clásico (igual
     que las plantillas): el mapa no puede navegar la página del portal.
- **Archivos:** `apps/web/src/features/portals/model/google-maps.ts`,
  `apps/web/src/features/portals/components/portal-contact-info-section.tsx`.
- **Pruebas:** `google-maps.test.ts` (9 hosts parecidos o con credenciales/puerto rechazados; dominios
  regionales aceptados; reconstrucción en host fijo) y `portal-contact-info-section.test.tsx` (un
  `maps.google.evil.com` nunca llega al iframe; el iframe lleva `sandbox`). Las 404 pruebas de
  portales siguen verdes.
- **Estado final:** `partially_corrected`.
- **Pendiente:** aplicar `frame-src` en la CSP del edge (hoy en Report-Only en Caddy). Requiere
  inventariar todos los iframes legítimos (mapas, videos) antes de pasar a modo aplicado; es un
  cambio de despliegue. Opcional: validar el host de `mapUrl` también en el servidor.

## 6. `resources/open-offers:cap-bypass-department-notification-fanout`

- **Estado inicial:** presente. El tope de 5 ofertas abiertas se liberaba al retirar; un ciclo crear →
  retirar notificaba sin límite a las organizaciones del departamento.
- **Corrección:**
  1. Cuota móvil por donante: `MAX_OPEN_OFFERS_PER_DONOR_PER_DAY = 10` ofertas creadas en 24 h,
     contando retiradas y vencidas (`TODO(client)`), `409` con mensaje claro.
  2. `ThrottlerGuard` + `@Throttle` en crear (30 / 10 min) y retirar (60 / 10 min).
- **Archivos:** `resource-open-offers.service.ts`, `resource-open-offers.controller.ts`.
- **Pruebas:** `test/resource-open-offers.integration-spec.ts` › _a create → withdraw loop stops at
  the 24 h quota_; el tope de 5 abiertas sigue igual.
- **Estado final:** `corrected`.
- **Riesgo residual:** el throttle es por IP (tracker por defecto); una persona con muchas cuentas
  queda limitada por la cuota diaria de cada cuenta y por el throttle de IP.

---

## Pendientes de validación (no tratados como vulnerabilidades)

Se validaron en un sandbox local (sin red, datos ficticios, sin producción). **No se cambió código
por ellos.**

| Fingerprint                                                                                            | Qué se midió                                                                                                                                                      | Resultado                                                                                                                                                                                                                                         | Lo que falta                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/animals/bulk-import.service.ts:importFile:xlsx-decompression-unbounded`          | ExcelJS 4.4.0 / JSZip 3.10.1 cargando un XLSX ficticio de 6,35 MB (por debajo del tope de 10 MB) con 1,3 M filas mínimas, mismo `workbook.xlsx.load` del servicio | **El proceso Node aborta por falta de memoria con un heap de 1 GB** antes del tope de 500 filas. Referencia: 0,98 MB → 200 k filas → 138 MB de heap                                                                                               | Límite de memoria, heap y política de reinicio del despliegue (observación del dueño). Recomendación: corregir (rechazar por tamaño descomprimido o leer en streaming con corte a 500 filas)                          |
| `module-multipart-fileinterceptor-no-limits`                                                           | `multer` con `memoryStorage` y sin `limits` (lo que hace `FileInterceptor` sin opciones), cuerpo de 300 MB                                                        | **Bufferiza todo: 200 OK, pico de RSS 701 MB**. Las 6 rutas siguen sin `limits` en `svlwgg`                                                                                                                                                       | Qué edge está activo. **Cambio posterior a la auditoría:** el `Caddyfile` de `svlwgg` subió `request_body max_size` de 20 MB a 100 MB (videos), lo que amplía el margen. Recomendación: añadir `limits` a las 6 rutas |
| `org/document-verification/document-checks:extractNit-extractLegalName:regex-backtracking-on-pdf-text` | Tiempo de las regex con texto sintético, y texto real extraído por pdf-parse 2.4.5 de PDFs construidos                                                            | Regex **super-lineal confirmada**: `extractNit('NIT'+n espacios+'x')` 1.000 → 2,0 s; 2.000 → 14,2 s. `extractLegalName` 40 k saltos → 0,65 s. Pero pdf.js **colapsa** 2.000 espacios en un `Tj` y 2.000 líneas en blanco a rachas de ≤ 2 espacios | Variante con glifos mapeados por ToUnicode a U+00A0/U+2003 (no probada). Recomendación de bajo costo: normalizar y recortar el texto antes de las regex                                                               |

## Áreas diferidas por la auditoría (investigadas, sin cambio de código)

### Ciclo de vida de campañas (`campaigns.service.ts:update`)

- **Evidencia:** `update` escribe `status` sin tabla de transiciones; `closed`/`cancelled` → `active`
  es posible, y `goalAmount`/`deadline` se pueden cambiar después de recibir donaciones. Solo Owner,
  Administrator u Operator (`WRITE_ROLES`), con RLS. Las donaciones nuevas solo entran a campañas
  `active` (`donations.service.ts:1072`).
- **Lectura sin comparación de `organizationId`:** `findUnique` sin el filtro que sí tiene `get()`; la
  RLS (`FORCE`) lo cubre, no hay fuga entre organizaciones.
- **Estado:** `pending` — es una regla de negocio no fijada por el documento base (los estados están
  marcados `TODO(client)`). Se necesita decidir: ¿una campaña cerrada o cancelada puede reabrirse?
  ¿la meta o la fecha pueden bajar después de la primera donación?

### Patrocinios, primer período (`sponsorships.service.ts:subscribe`)

- **Evidencia:** el primer pago se marca `paid` si `createCollection` responde `approved` de forma
  síncrona. El adaptador real de Mercado Pago siempre responde `pending`
  (`mercadopago-payment.adapter.ts:446`), el `disabled` rechaza, y solo el adaptador `fake` (que la
  guarda de producción rechaza) puede responder `approved`. Además la guarda de producción rechaza
  `FEATURE_SPONSORSHIPS` (`env.validation.ts`). `transition()` valida tenant y máquina de estados;
  `listMine` usa una función definer ligada a `actor.id`.
- **Estado:** `pending` — no explotable con la configuración de producción actual. Antes de activar
  patrocinios, el primer pago debe liquidarse solo por webhook verificado, como las donaciones.

## Pruebas ejecutadas

| Prueba                                                                                | Resultado                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm turbo run lint typecheck` (api, web)                                            | Verde                                                                                                                                                                                                                                                                                                            |
| Unitarias API (`jest`, 128 suites)                                                    | 1029 / 1029                                                                                                                                                                                                                                                                                                      |
| Unitarias web (`vitest`, 184 archivos)                                                | 1442 / 1442                                                                                                                                                                                                                                                                                                      |
| Integración API, 4 particiones de CI, PostgreSQL 16 + Redis 7 locales con migraciones | 1227 pasan. Fallan 8 pruebas de **entrega de correo por cola** (`email-queue-load`, `emails-real-flows`, `org-announcements`, `signature-requests-smtp`): fallan igual con el código original en este contenedor (comprobado con `git stash`), son de tiempo de la cola, no de estas correcciones. Queda para CI |
| Ajuste de una prueba existente                                                        | `plans-enforcement` subía dos veces a la misma llave; ahora cada subida usa una llave nueva, como una reserva real (la llave es de escritura única)                                                                                                                                                              |
| Control negativo                                                                      | Con `src/` original y las pruebas nuevas: **12 pruebas de integración y 9 de web fallan**; con las correcciones, todas pasan                                                                                                                                                                                     |
