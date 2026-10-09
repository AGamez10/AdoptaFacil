# 04 · Auditoría de seguridad adversarial y aislamiento

> Repo: `/home/claude/AdoptaFacil` · línea base commit `48cabad` · fecha 2026-10-07.
> Entorno de pruebas: PostgreSQL 16 en `localhost:5433`, base **`adoptafacil_sec`** (aislada de `adoptafacil`), API compilada corriendo en el puerto **3100** con la configuración por defecto (`PAYMENT_DRIVER=fake`, `AUTH_IDENTITY_DRIVER=fake`, `STORAGE_DRIVER=disk`, `NOTIFICATION_DRIVER=log`) — la MISMA que `render.yaml` despliega.
> Todo hallazgo lleva `[VERIFICADO EJECUTANDO]` salvo que diga lo contrario. Scripts en `evidencia/seguridad/scripts/`, salidas crudas en `evidencia/seguridad/`.

## 0. Resumen ejecutivo (10 líneas)

1. El **aislamiento entre organizaciones por HTTP es sólido**: ~70 endpoints con `:id` × 4 actores (Owner A, Admin A, Operator A, Persona ajena) = **0 fugas y 0 escrituras cross-tenant** (`06_bola_matrix.csv`, 304 requests, 283 denegadas 403/404/400, 21 respuestas 2xx todas del propio tenant o catálogo público).
2. La **RLS en PostgreSQL funciona** sobre las 54 tablas de negocio: `ENABLE+FORCE`, rol runtime `adoptafacil_app` sin SUPER ni BYPASSRLS y distinto del owner; con contexto A no se ven ni se pueden insertar/actualizar filas de B; `audit_logs` niega UPDATE/DELETE/TRUNCATE incluso al superusuario (vía trigger).
3. Pero hay **P0 de integridad por los drivers fake activos por defecto y sin guarda de producción** (regresión del patrón raíz del proyecto anterior): **SEC-001** suplantación de PlatformSuperAdmin con token Google falso; **SEC-002** webhook de pago falsificable sin firma; **SEC-003** auto-emisión de certificados tributarios "auténticos" con DIAN fake.
4. **8 tablas sensibles sin RLS** (credenciales, tokens de refresh/reset, cuentas bancarias, tokens OAuth de MercadoPago, platform_settings): el rol runtime las lee/escribe cross-tenant (**SEC-004**), y los tokens del PSP y las cuentas bancarias están **en texto plano** (**SEC-005**).
5. **Escalamiento vertical real**: un Administrator se asigna Owner (**SEC-006**) y el último Owner puede quedar la org sin dueño (**SEC-007**) — AF-007/AF-008 **no** fueron corregidos en este repo.
6. Higiene de plataforma pendiente: admin semilla `changeme123` (**SEC-008**), sin helmet/HSTS/CSP y `X-Powered-By` expuesto (**SEC-009**), rate-limit en memoria sin `trust proxy` (**SEC-010**), password del rol de BD hardcodeado en la migración (**SEC-011**).
7. XSS almacenado por URLs `javascript:`/`data:` en el portal público (**SEC-012**); auditoría no inmutable frente al owner de la BD y sin cadena de hashes (**SEC-013**).
8. Autenticación: bcrypt en vez de Argon2id y política débil "12345678" (**SEC-016**); rotación de refresh sin detección de reuso de familia (**SEC-017**); enumeración de cuentas en el registro (**SEC-019**).
9. Sin vías de **SQL injection**: todas las consultas crudas usan `Prisma.sql` parametrizado o funciones con firma tipada; 0 `queryRawUnsafe`/`executeRawUnsafe`/`Prisma.raw` en el código de la app; sin `EXECUTE` dinámico en las funciones. **SSRF: no aplica** (no hay fetch de URLs controladas por el usuario).
10. **Veredicto de aislamiento**: GO-WITH-CONDITIONS para un piloto **sin dinero** solo tras cerrar SEC-001..SEC-008; **NO-GO para pagos y lanzamiento público** hasta cerrar P0+P1. Cualquier fuga que existe hoy es de **integridad/autenticación**, no de lectura cross-tenant por HTTP.

## 1. Metodología

- Se compiló (`dist` presente) y arrancó la API en el puerto 3100 contra `adoptafacil_sec` con las variables del enunciado (ver `scripts/env.sh`), sin tocar la base `adoptafacil` del CI.
- Se sembró el PlatformSuperAdmin con el seed del repo (`seed-platform-admin.ts`, credenciales por defecto) y se crearon los actores TENANT_A, TENANT_B, USER_A_LOW (Operator), USER_A_ADMIN (Administrator), USER_B_LOW, SUPERADMIN + auxiliares (`scripts/01_actors.sh`, tokens en `evidencia/seguridad/actors.env` (no versionado: contiene tokens de sesión de prueba)). Se amplió el TTL del access token (`JWT_ACCESS_TTL=86400`) solo para la sesión de prueba.
- Inventario de rutas desde el arranque de Nest (219 rutas, `evidencia/seguridad/routes.txt`) y de guards/roles por controlador (`evidencia/seguridad/controller_guards.txt`).
- Se sembraron objetos de negocio sintéticos en A y B (`scripts/04_seed_tenants.py`, `05_seed_cross.py`) y se ejecutó la matriz BOLA/IDOR (`06_bola_matrix.py`).
- Pruebas SQL directas como `adoptafacil_app` y como owner contra `adoptafacil_sec`.
- Lo no ejecutable (p. ej. firma real de MercadoPago en sandbox, que requiere credenciales del cliente) queda marcado UNVERIFIABLE con el motivo.

## 2. Postura de aislamiento (lo que SÍ está bien)

| Control                               | Evidencia                                                                                                                                                                                                           | Estado                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Rol runtime sin privilegio            | `pg_roles`: `adoptafacil_app` rolsuper=f, rolbypassrls=f, no es owner                                                                                                                                               | [VERIFICADO EJECUTANDO]                        |
| RLS ENABLE+FORCE en tablas de negocio | 54/61 tablas con `relrowsecurity=t` y `relforcerowsecurity=t`, cada una con policy `tenant_isolation`                                                                                                               | [VERIFICADO EJECUTANDO]                        |
| RLS filtra lectura/escritura          | con contexto A: 1 animal (A), 0 donaciones (B); INSERT en B → `new row violates row-level security policy`; UPDATE de B → 0 filas                                                                                   | [VERIFICADO EJECUTANDO]                        |
| Auditoría append-only                 | triggers `audit_logs_no_update/delete/truncate` abortan incluso al superusuario; app role sin UPDATE/DELETE/TRUNCATE                                                                                                | [VERIFICADO EJECUTANDO]                        |
| BOLA/IDOR por HTTP                    | 304 requests A/ajeno→B: 0 con marcador de B en respuesta 2xx; escrituras cross-tenant 403/404                                                                                                                       | [VERIFICADO EJECUTANDO] (`06_bola_matrix.csv`) |
| Funciones SECURITY DEFINER            | 94 funciones, todas owner `adoptafacil`, `search_path=public`, sin `EXECUTE` dinámico; solo 3 ejecutables por PUBLIC (verificación pública de certificado y slug por subdominio — exposición intencional y acotada) | [VERIFICADO EJECUTANDO]                        |
| SQL injection                         | 0 `*RawUnsafe`/`Prisma.raw` en la app; `set_config('app.current_org_id', $1, true)` parametrizado; funciones con parámetros tipados                                                                                 | [VERIFICADO]                                   |
| SSRF                                  | sin fetch de URLs del usuario en el backend (solo base fija de MercadoPago)                                                                                                                                         | [VERIFICADO]                                   |
| CORS                                  | lista fija de orígenes; `Origin: https://evil.example` → sin `Access-Control-Allow-Origin`                                                                                                                          | [VERIFICADO EJECUTANDO]                        |

El token de tenant tiene precedencia sobre el header `x-org-id`: un caller A con `x-org-id: <ORG_B>` siguió viendo datos de A (`06_bola_matrix.out`, `/org/payout-bank-account`, `/animals`).

## 3. Verificación de las hipótesis AF-xxx (estado en ESTE repo)

| AF      | Título abreviado                         | Estado actual                                            | Evidencia                                                                                                                                                          |
| ------- | ---------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AF-001  | Suplantación vía Google fake             | **SIGUE PRESENTE** → SEC-001                             | `03_af001.out`: `fake:admin@adoptafacil.local:atacante` devuelve sesión con `["platform_admin","platform_super_admin"]` y 200 en `/platform/dashboard/super-admin` |
| AF-002  | Webhook de pago falsificable             | **SIGUE PRESENTE** (driver fake default) → SEC-002       | webhook sin firma `{"status":"approved"}` → donación `approved` + recibo emitido; replay = no-op                                                                   |
| AF-003  | Certificados de fundación fantasma       | **SIGUE PRESENTE** → SEC-003                             | Owner recorre informal→esal_rte, DIAN fake auto-verifica (`{"status":"verified"}`), `/public/donations/certificates/<code>` devuelve el certificado como válido    |
| AF-004  | RLS no aplicada                          | **CORREGIDO para 54 tablas / PRESENTE para 8** → SEC-004 | FORCE+rol sin bypass OK; 8 tablas sin RLS                                                                                                                          |
| AF-007  | Administrator→Owner                      | **SIGUE PRESENTE** → SEC-006                             | `02_rbac_escalation.out`: Admin se asigna `owner` → HTTP 201                                                                                                       |
| AF-008  | Último Owner se queda sin org            | **SIGUE PRESENTE** → SEC-007                             | Admin revoca Owner original (204) y luego su propio owner (204): org sin Owner                                                                                     |
| AF-009  | Fallback `x-org-id` sin auth             | **MITIGADO (código presente)** → SEC-021                 | el claim JWT gana; rutas de negocio exigen JWT                                                                                                                     |
| AF-010  | XSS `javascript:` en portal              | **SIGUE PRESENTE** → SEC-012                             | perfil guarda `javascript:alert(...)`/`data:text/html,<script>` y el portal público los devuelve; front los pone en `<a href>` sin saneo                           |
| AF-012  | Sin cabeceras / X-Powered-By             | **SIGUE PRESENTE** → SEC-009                             | `08_headers.out`: `X-Powered-By: Express`, sin HSTS/CSP/nosniff/Referrer-Policy                                                                                    |
| AF-013  | Uploads confían en MIME                  | **PRESENTE (parcial)** → SEC-014                         | HTML subido como `image/png` se guarda y sirve; mitigado: Content-Type derivado de extensión, SVG no permitido                                                     |
| AF-014  | Tokens PSP y cuentas en claro            | **SIGUE PRESENTE** → SEC-005                             | `mercadopago-connect.service.ts:131` guarda `access_token`/`refresh_token` directos; cuenta bancaria `String` plano; ambas tablas sin RLS                          |
| AF-015  | Rate limit en memoria sin trust proxy    | **SIGUE PRESENTE** → SEC-010                             | `ThrottlerModule.forRoot([...])` sin storage Redis; `main.ts` sin `trust proxy`                                                                                    |
| AF-016  | Password del rol en la migración         | **SIGUE PRESENTE** → SEC-011                             | migración init `CREATE ROLE adoptafacil_app ... PASSWORD 'adoptafacil_app'` (documentado en DEPLOY.md)                                                             |
| AF-024  | Adopción de animal inexistente           | **SIGUE PRESENTE** → SEC-015                             | POST /adoptions con `animalId=1111...` y snapshot `INVENTADO` → 201                                                                                                |
| AF-025  | Refresh sin detección de reuso           | **PRESENTE (parcial)** → SEC-017                         | reuso de token rotado se rechaza, pero no revoca la familia; access token válido hasta TTL tras logout                                                             |
| AF-026  | Password débil + bcrypt                  | **SIGUE PRESENTE** → SEC-016                             | `bcryptjs` cost 12 (no Argon2id); registro con `12345678` → 201                                                                                                    |
| AF-028  | Audit log mutable por owner BD           | **SIGUE PRESENTE** → SEC-013                             | `ALTER TABLE audit_logs DISABLE TRIGGER ALL; UPDATE...` → `UPDATE 39`; sin columna de hash-chain                                                                   |
| AF-032  | Log imprime firma/cola del secreto       | **SIGUE PRESENTE** → SEC-018                             | `mercadopago-payment.adapter.ts:411` `logger.debug(... secret_tail=...${secret.slice(-6)} computed=${computed} ...)`                                               |
| AF-034  | Anidados 200 vacío con id ajeno          | **SIGUE PRESENTE** → SEC-020                             | `GET /animals/<id-de-B o inexistente>/clinical-events` → 200 `[]` (no 404)                                                                                         |
| AF-035  | Enumeración en registro                  | **SIGUE PRESENTE** → SEC-019                             | registro email existente → 409 "Email already registered"; nuevo → 201 (reset/login sí uniformes)                                                                  |
| AF-037  | Admin semilla changeme123                | **SIGUE PRESENTE** → SEC-008                             | `seed:admin` crea `admin@adoptafacil.local`; login con `changeme123` → 200                                                                                         |
| SQLI-03 | SECURITY DEFINER search_path sin pg_temp | **PRESENTE (teórico)** → SEC-023                         | 94 funciones `search_path=public` sin `pg_temp`; TEMP concedido a PUBLIC y al app role                                                                             |

## 4. Hallazgos (formato TANJIRO §11/§33)

### SEC-001 — Suplantación de cualquier cuenta (incl. PlatformSuperAdmin) vía Google Sign-In falso · P0

- CWE-287 · OWASP A07:2021 · ASVS V2.1 · prob. alta · impacto crítico.
- **Endpoint:** `POST /auth/google`. **Archivo:** `packages/contracts/src/identity.ts:153` (`FakeIdentityAdapter`), `apps/api/src/core/identity/identity.module.ts:75` (binding por `AUTH_IDENTITY_DRIVER`, default `fake`), `apps/api/src/config/env.validation.ts:140` (no hay guarda que impida `fake` en producción).
- **Precondiciones:** `AUTH_IDENTITY_DRIVER` sin fijar o `=fake` (el valor por defecto, y `GOOGLE_OAUTH_CLIENT_ID` no está provisto, así que `fake` es el único camino hoy).
- **Reproducción:** `curl -X POST /auth/google -d '{"idToken":"fake:admin@adoptafacil.local:atacante"}'` → sesión válida del PlatformSuperAdmin; `GET /platform/dashboard/super-admin` → 200. También acepta un JSON base64url sin prefijo `fake:` para entrar a cualquier email existente (`03_af001.out`).
- **Observado:** cualquiera obtiene un JWT de cualquier cuenta por email. **Esperado:** en producción la API no arranca con driver fake; Google solo con verificación real de firma/aud.
- **Causa raíz:** adaptador fake activo por defecto, sin guarda de entorno (patrón raíz heredado).
- **Remediación:** (1) guarda de arranque: si `NODE_ENV=production` y cualquier driver (`AUTH_IDENTITY_DRIVER`/`PAYMENT_DRIVER`/`STORAGE_DRIVER`) es fake/stub → abortar el bootstrap; (2) quitar `fake` de `render.yaml`/exigir `google` en prod; (3) eliminar el botón "Google (prueba)" del build de producción.
- **Test de regresión:** test de configuración que cargue `render.yaml`/env de prod y falle si declara un driver fake; e2e que `POST /auth/google` con `fake:` sea 401 cuando `AUTH_IDENTITY_DRIVER=google`.
- **Esfuerzo:** S. **Bloquea:** piloto, pagos, lanzamiento, escala.

### SEC-002 — Webhook de donaciones falsificable (driver de pago fake por defecto) · P0

- CWE-345 · A08:2021 · prob. alta · impacto crítico. **Endpoint:** `POST /donations/webhook`.
- **Archivo:** `packages/contracts/src/payments.ts:433` (`FakePaymentAdapter.verifyAndNormalizeWebhook` ignora la firma `_signature`), `apps/api/src/modules/donations/donations.controller.ts:136`.
- **Reproducción:** `POST /donations/webhook` sin cabecera de firma, body `{"collectionId":"<col>","status":"approved","eventId":"forged-evt-1"}` → `{"applied":true,"status":"approved"}`, donación `approved` + recibo emitido; segundo envío = no-op (idempotencia por `dedupKey` OK).
- **Observado:** un tercero aprueba donaciones y dispara emisión de recibo/certificado sin pagar. **Esperado:** rechazo sin firma válida.
- **Nota:** el adaptador real (`mercadopago-payment.adapter.ts:392`) **sí** verifica HMAC-SHA256 con `timingSafeEqual` y re-consulta `GET /v1/orders/:id` como fuente autoritativa del estado (anti-forgery correcto) — el problema es que el driver desplegado es `fake` (`render.yaml: PAYMENT_DRIVER=fake`) y no hay guarda de producción. La verificación del adaptador real contra el sandbox de MercadoPago queda **UNVERIFIABLE** (sin credenciales del cliente).
- **Remediación:** misma guarda de arranque que SEC-001; apagar donaciones/apadrinamientos/certificados por flag hasta tener PSP real (condición C2). **Esfuerzo:** S. **Bloquea:** piloto, pagos, lanzamiento, escala.

### SEC-003 — Auto-declaración de ESAL/RTE y emisión de certificado tributario "auténtico" · P0

- CWE-285 · A01:2021. **Endpoints:** `POST /org/formalization/transitions`, `POST /org/formalization/dian-verification/retry`, `GET /public/donations/certificates/:code`.
- **Archivo:** `formalization.machine.ts:43` (`TRANSITION_REQUIREMENTS` vacío → ningún paso forward exige documentos aprobados), `fake-dian.adapter.ts:17` (devuelve `verified` en la 1ª llamada), `org.module.ts:76` (único driver DIAN = fake, sin guarda prod).
- **Reproducción:** Owner recorre `informal→en_proceso→formalizada→esal` sin gate; fija NIT; `dian-verification/retry` → estado `verified`; `→esal_rte` con `rteVigente:true`; una donación aprobada genera certificado cuyo `GET /public/donations/certificates/<code>` devuelve `{amount, organizationNit, organizationName, contentHash}` como válido (sin auth).
- **Observado:** una organización se "verifica" a sí misma y emite certificados tributarios con verificación pública afirmativa. **Esperado:** el cambio de nivel y el RTE los aprueba un PlatformAdmin con documento revisado; certificados apagados hasta concepto de contador/abogado (D9).
- **Remediación:** gate de transición por revisión de plataforma; sustituir/duro-bloquear el DIAN fake en prod; apagar certificados por flag. **Esfuerzo:** M. **Bloquea:** pagos, lanzamiento, escala.

### SEC-004 — Tablas sensibles sin RLS (aislamiento solo en la capa de app) · P1

- CWE-1230 · A01:2021. **Tablas:** `organizations`, `auth_credentials`, `refresh_tokens`, `password_reset_tokens`, `donation_access_links`, `platform_settings`, `organization_bank_accounts`, `organization_mercadopago_accounts` (0 policies, `relrowsecurity=f`).
- **Reproducción:** como `adoptafacil_app` **sin** contexto de tenant: `SELECT email,password_hash FROM auth_credentials` devuelve credenciales de TODOS los tenants (11 filas); igual con `refresh_tokens` (20), `organizations` (11), `platform_settings` (1).
- **Impacto:** no explotable hoy por HTTP (el código accede por claves únicas: email, tokenHash, userId), pero cualquier bug de lógica, un `include` de más, o una inyección futura expone cuentas/tokens/cuentas bancarias de todos los tenants. Se pierde la defensa en profundidad que el resto del sistema sí tiene. `organization_bank_accounts` y `organization_mercadopago_accounts` **llevan `organization_id`** y aun así no tienen policy — deberían tenerla (el gate `rls-no-leak` debería cubrirlas).
- **Remediación:** activar RLS+FORCE+`tenant_isolation` en `organization_bank_accounts` y `organization_mercadopago_accounts`; para las tablas de identidad (auth/refresh/reset) sin `organization_id`, acceso solo vía funciones `SECURITY DEFINER` acotadas o revocar el acceso directo del rol app y usar funciones. **Esfuerzo:** M. **Bloquea:** lanzamiento, escala.

### SEC-005 — Tokens OAuth de MercadoPago y cuentas bancarias en texto plano · P1

- CWE-312 · A02:2021. **Archivo:** `mercadopago-connect.service.ts:131` (`accessToken: tokens.access_token`, `refreshToken: ...`), `prisma/schema/payments.prisma:10,46` (`accountNumber`, `accessToken`, `refreshToken` como `String` plano).
- **Impacto:** quien lea la BD (backup, dump, SEC-004, acceso de soporte) obtiene tokens que permiten cobrar/mover dinero en nombre de la organización y los números de cuenta bancaria. **Remediación:** cifrar en reposo con AES-256-GCM (ya existe `signature-crypto.ts` como patrón) + RLS en esas tablas; nunca devolver el token en ninguna respuesta (hoy `getStatus` solo expone `mpUserId`, correcto). **Esfuerzo:** M. **Bloquea:** pagos, lanzamiento, escala.

### SEC-006 — Escalamiento vertical Administrator → Owner · P1

- CWE-269 · A01:2021. **Endpoint:** `POST /rbac/roles`. **Archivo:** `rbac.controller.ts:126` (`@Roles(Owner, Administrator)`), `rbac.schemas.ts:84` (`role ∈ ORG_ROLES`, que incluye `owner`).
- **Reproducción:** como Administrator de A, `POST /rbac/roles {"userId":"<yo>","role":"owner"}` → 201 y `my-roles` = `["administrator","owner"]`.
- **Observado:** un Administrator se vuelve Owner. **Esperado:** solo un Owner otorga Owner (como en el diseño del proyecto anterior). **Remediación:** si el rol a asignar es `owner`, exigir que el actor sea Owner; o quitar `owner` del conjunto asignable por Administrator. **Esfuerzo:** S. **Bloquea:** piloto, lanzamiento, escala.

### SEC-007 — El último Owner puede dejar la organización sin dueño · P1

- CWE-840 · A01:2021. **Endpoint:** `DELETE /rbac/roles/:userId/:role`. **Archivo:** `rbac.service.ts:74` (`revokeRole` hace `deleteMany` sin guarda de último-owner).
- **Reproducción:** revocar el rol `owner` de todos los Owners → org sin Owner; nadie puede volver a otorgar Owner (solo Owner puede). **Remediación:** rechazar (409) la revocación del último Owner de la org. **Esfuerzo:** S. **Bloquea:** piloto, lanzamiento.

### SEC-008 — PlatformSuperAdmin semilla con contraseña por defecto · P1

- CWE-1392 · A07:2021. **Archivo:** `apps/api/scripts/seed-platform-admin.ts:57` (`admin@adoptafacil.local` / `changeme123`), conecta como superusuario (`DATABASE_URL`).
- **Reproducción:** `pnpm seed:admin` sin args; `POST /auth/login` con `changeme123` → 200. **Remediación:** exigir password por env/CLI sin default, o `--rotate-password`; forzar cambio en el primer login. **Esfuerzo:** S. **Bloquea:** piloto, lanzamiento, escala.

### SEC-009 — Sin cabeceras de seguridad; `X-Powered-By` expuesto · P1

- CWE-693 · A05:2021. **Archivo:** `apps/api/src/main.ts` (sin helmet, sin `app.disable('x-powered-by')`). **Evidencia:** `08_headers.out` — `X-Powered-By: Express`, sin HSTS/CSP/X-Content-Type-Options/Referrer-Policy/Permissions-Policy. **Remediación:** `helmet()` global + `app.disable('x-powered-by')`; HSTS/CSP/nosniff. **Esfuerzo:** S. **Bloquea:** lanzamiento, escala.

### SEC-010 — Rate limiting en memoria y sin `trust proxy` · P1

- CWE-307 · A07:2021. **Archivo:** `auth.module.ts:25` (`ThrottlerModule.forRoot` sin storage Redis), `main.ts` (sin `trust proxy`). **Impacto:** detrás de Caddy/Render el límite se aplica a la IP del proxy (una sola cubeta para todos) y no se comparte entre instancias → fuerza bruta efectiva y DoS de cuentas legítimas. **Remediación:** `trust proxy` por nº de saltos + `ThrottlerStorageRedis`. **Esfuerzo:** S. **Bloquea:** lanzamiento, escala.

### SEC-011 — Password del rol de BD hardcodeado en la migración inicial · P1

- CWE-798 · A07:2021. **Archivo:** `prisma/migrations/20260716051053_init/migration.sql` (`CREATE ROLE adoptafacil_app ... PASSWORD 'adoptafacil_app'`), DEPLOY.md documenta que hay que rotarlo. **Remediación:** crear el rol sin password en la migración y fijarlo por `ALTER ROLE` fuera de versión de control; el `render-setup-roles.sh` ya rota — hacerlo obligatorio. **Esfuerzo:** S. **Bloquea:** lanzamiento, escala.

### SEC-012 — XSS almacenado por URLs `javascript:`/`data:` en el portal público · P1

- CWE-79 · A03:2021. **Endpoints:** `PUT /org/profile` → `GET /public/organizations/:slug`. **Archivo:** `org.schemas.ts:9` (`z.string().url()` acepta `javascript:`/`data:`), `apps/web/.../portal-social-links.tsx:62` y `portal-contact-info-section.tsx:74` (`<a href={url}>` sin saneo de esquema).
- **Reproducción:** guardar `socialLinks.instagram="javascript:alert(document.cookie)"` → el portal público lo devuelve y el front lo pone en `href`; un clic de la víctima ejecuta el script. **Remediación:** validar esquema `https?:` (y `mailto:` donde aplique) en el backend y en el front; rechazar `javascript:`/`data:`. **Esfuerzo:** S. **Bloquea:** lanzamiento, escala.

### SEC-013 — Auditoría no inmutable frente al owner de la BD; sin cadena de hashes · P1

- CWE-778 · A09:2021. **Reproducción:** como owner, `ALTER TABLE audit_logs DISABLE TRIGGER ALL; UPDATE audit_logs SET action='x'` → `UPDATE 39`. No hay columna `prev_hash`/encadenamiento. **Nota:** frente al rol runtime la inmutabilidad SÍ se sostiene (sin UPDATE/DELETE y sin poder desactivar triggers — `must be owner of table`). **Remediación:** `InternalProofProvider` con cadena de hashes (event_id, ts, actor, tenant, payload_hash); documentar que PostgreSQL no da inmutabilidad total frente al superusuario. **Esfuerzo:** M. **Bloquea:** lanzamiento, escala.

### SEC-014 — Subidas confían en el MIME del cliente (sin magic bytes) · P2

- CWE-434 · A04:2021. **Archivo:** `storage.controller.ts:92` (valida `file.mimetype` del cliente contra `ALLOWED_CONTENT_TYPES`). **Reproducción:** HTML subido con `type=image/png` se guarda y sirve. **Mitigantes:** al servir, el Content-Type se deriva de la extensión del key (no del tipo guardado) y `image/svg+xml` no está permitido, así que el XSS activo directo es limitado; combinado con la falta de `nosniff` (SEC-009) sigue siendo riesgo. **Remediación:** validar magic bytes en servidor + `X-Content-Type-Options: nosniff` + `Content-Disposition: attachment` en privados. **Esfuerzo:** S. **Bloquea:** lanzamiento, escala.

### SEC-015 — Adopciones aceptan animales inexistentes/ajenos con snapshot del cliente · P2

- CWE-20 · A04:2021. **Archivo:** `create_adoption_request` (sin verificar existencia/pertenencia del animal; sin FK en `animal_id`). **Reproducción:** `POST /adoptions animalId=1111...` con snapshot `INVENTADO` → 201. **Impacto:** contaminación del kanban de evaluación de cualquier org, contenido controlado por el atacante en el snapshot. **Remediación:** validar que el animal exista, pertenezca a `organizationId` y esté adoptable; construir el snapshot en el servidor. **Esfuerzo:** S. **Bloquea:** lanzamiento.

### SEC-016 — bcrypt en vez de Argon2id; política de contraseña débil · P2

- CWE-916 · A02:2021. **Archivo:** `password.service.ts:11` (bcryptjs cost 12), `auth.schemas.ts:8` (`min(8)` sin complejidad). **Reproducción:** registro con `12345678` → 201. **Remediación:** Argon2id; política mínima (longitud ≥12 y/o lista de bloqueo). **Esfuerzo:** S. **Bloquea:** lanzamiento, escala.

### SEC-017 — Rotación de refresh sin detección de reuso; access válido tras logout · P2

- CWE-613 · A07:2021. **Archivo:** `token.service.ts:113` (reuso de token rotado se rechaza pero no revoca la familia), `jwt-auth.guard.ts:262` (solo verifica firma+exp). **Reproducción:** tras rotar, el token viejo da 401, pero el rotado sigue válido (no se mata la familia); el access token sobrevive hasta el TTL (15 min) después de `logout`. **Remediación:** al presentar un refresh ya revocado, revocar toda la familia del usuario; opcional lista de revocación de access de corta vida. **Esfuerzo:** M. **Bloquea:** lanzamiento.

### SEC-018 — El log del webhook imprime firma calculada y cola del secreto · P2

- CWE-532 · A09:2021. **Archivo:** `mercadopago-payment.adapter.ts:411` `logger.debug(... secret_tail=...${webhookSecret.slice(-6)} computed=${computed} received_v1=${v1})`. **Impacto:** fuga parcial del secreto y de la firma esperada en logs (nivel debug; en Nest por defecto se emiten todos los niveles salvo config explícita). **Remediación:** eliminar ese log o reducir a un booleano de resultado sin secreto/firma. **Esfuerzo:** S. **Bloquea:** escala.

### SEC-019 — Enumeración de cuentas en el registro · P3

- CWE-204 · A07:2021. **Archivo:** `auth.service.ts:89` (409 "Email already registered"). **Reproducción:** email existente → 409, nuevo → 201. **Nota:** reset (202/202) y login (dummy hash) sí son uniformes. **Remediación:** respuesta neutra en registro + verificación de correo. **Esfuerzo:** S. **Bloquea:** escala.

### SEC-020 — Endpoints anidados devuelven 200 vacío en vez de 404 · P3

- CWE-209 · A01:2021. Varios `GET /animals/:id/clinical-events`, `/campaigns/:id/evidences`, `/adoptions/followups/by-contract/:id`, `/service-hours?enrollmentId=`, `/animals/:id/behavior-disclosures/current` devuelven 200 `[]`/`204` para ids de otra org o inexistentes (no filtran datos — RLS vacía la consulta — pero son inconsistentes). **Remediación:** 404 cuando el recurso padre no existe/pertenece. **Esfuerzo:** M. **Bloquea:** escala.

### SEC-021 — Fallback de tenant por header `x-org-id` (latente) · P3

- CWE-639 · A01:2021. **Archivo:** `tenant-context.middleware.ts:44`. El claim del JWT tiene precedencia y las rutas de negocio exigen JWT, así que hoy no es explotable; sigue siendo deuda. **Remediación:** eliminar el fallback (tenant solo del JWT). **Esfuerzo:** S. **Bloquea:** escala.

### SEC-022 — `DELETE /rbac/roles/:userId/:role` sin validación de entrada → 500 · P3

- CWE-20 · A05:2021. **Archivo:** `rbac.controller.ts:137` (sin `ParseUUIDPipe` ni validación de enum). **Reproducción:** `DELETE /rbac/roles/not-a-uuid/whatever` → 500 (SQLSTATE 22P02) en vez de 400. **Remediación:** `ParseUUIDPipe` + validar `role ∈ ORG_ROLES`. **Esfuerzo:** S. **Bloquea:** escala.

### SEC-023 — Funciones SECURITY DEFINER con `search_path=public` sin `pg_temp`; TEMP a PUBLIC · P3

- CWE-426 · A05:2021. 94 funciones con `search_path=public` (sin `pg_temp` al final); `TEMP` concedido a PUBLIC y al rol app. Riesgo teórico de secuestro de objetos temporales. **Remediación:** `SET search_path = public, pg_temp` y `REVOKE TEMP ... FROM PUBLIC`. **Esfuerzo:** S. **Bloquea:** escala. **Nota:** no se halló explotación práctica (ninguna función usa objetos sin calificar de forma vulnerable).

## 5. Data map — ¿quién puede leer/modificar/enumerar/descargar cada clase de dato?

| Clase de dato                                                          | Tabla / ruta                                                   | RLS                                   | ¿Lectura no autorizada por HTTP?                                                                             | ¿Modif. no autorizada?                       | ¿Enumerable?              | ¿Descargable?                                      |
| ---------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------- | -------------------------------------------------- |
| Credenciales (hash)                                                    | `auth_credentials`                                             | **NO**                                | No por HTTP (sin endpoint); **sí** a nivel SQL para el rol app (SEC-004)                                     | No por HTTP                                  | No por HTTP               | —                                                  |
| Tokens refresh/reset                                                   | `refresh_tokens`, `password_reset_tokens`                      | **NO**                                | No por HTTP; sí SQL (SEC-004)                                                                                | No por HTTP                                  | No                        | —                                                  |
| Datos personales adoptante/donante/voluntario                          | `adoption_requests.applicant`, `donations.payer`, `users`      | Sí (54-tabla)                         | **No** (BOLA 0 fugas)                                                                                        | No                                           | No                        | —                                                  |
| Expediente clínico                                                     | `clinical_events`, adjuntos privados                           | Sí                                    | **No** (A→B 200 `[]`, SEC-020; archivos privados 403/404)                                                    | No                                           | No                        | Solo Owner de la org o PlatformAdmin, auditado     |
| Firmas manuscritas                                                     | contrato/representante, storage privado cifrado                | Sí + AES-256-GCM                      | **No**                                                                                                       | No                                           | No                        | Solo firmante/gestión con RBAC; cifradas en reposo |
| Documentos legales/tributarios                                         | `organization_documents`, `storage private`                    | Sí                                    | **No** (privado solo Owner/PlatformAdmin)                                                                    | No                                           | No                        | Owner/PlatformAdmin, auditado                      |
| Cuentas bancarias                                                      | `organization_bank_accounts`                                   | **NO**                                | No por HTTP (RBAC MANAGE_ROLES de la propia org); **sí** SQL cross-tenant (SEC-004) y **en claro** (SEC-005) | No por HTTP                                  | No                        | —                                                  |
| Tokens OAuth PSP                                                       | `organization_mercadopago_accounts`                            | **NO**                                | Nunca por HTTP (solo `mpUserId`); **sí** SQL cross-tenant + en claro (SEC-004/005)                           | No por HTTP                                  | No                        | —                                                  |
| Contratos de adopción                                                  | `adoption_contracts`                                           | Sí                                    | **No** (BOLA 404 cross-tenant)                                                                               | No                                           | No                        | PDF solo gestión/firmante                          |
| Certificados tributarios                                               | `donation_certificates` + `GET /public/.../certificates/:code` | n/a (verificación pública por código) | Verificación pública por código (intencional) — pero emitibles por org auto-declarada (SEC-003)              | —                                            | No (código no secuencial) | —                                                  |
| Auditoría                                                              | `audit_logs`                                                   | Sí + append-only                      | **No**                                                                                                       | No por app; **sí** por owner de BD (SEC-013) | No                        | —                                                  |
| Catálogo público (animales, campañas, productos, necesidades, reseñas) | funciones `public_*` SECURITY DEFINER                          | exposición acotada intencional        | Público por diseño (solo columnas mínimas)                                                                   | No                                           | Sí (diseño)               | —                                                  |

**Conclusión de aislamiento:** por HTTP, ninguna clase de dato privado de la organización B es legible, modificable, enumerable ni descargable por un actor de A o por una persona ajena (0/304 en la matriz BOLA). La exposición residual es a nivel SQL para 8 tablas sin RLS (SEC-004) y el cifrado faltante de tokens/cuentas (SEC-005), más la integridad (SEC-001/002/003) y el escalamiento de rol dentro de la propia org (SEC-006/007).

## 6. No ejecutado / UNVERIFIABLE

- Verificación de firma del webhook de MercadoPago contra el **sandbox real**: requiere credenciales del cliente (no provistas). El código del adaptador real verifica HMAC + re-consulta la orden; no se pudo ejercer de punta a punta. → UNVERIFIABLE.
- `createPayout`/dispersión T+1 (Fase 2): no implementado por diseño (pendiente aprobación de Disbursements). → NO APLICA.
- Escaneos de secretos/dependencias/licencias (gitleaks/semgrep/trivy/osv/pnpm audit): los ejecuta otro auditor; no se repiten aquí.
