# 03 · Auditoría de arquitectura

> Línea base `48cabad`. Este informe une la vista técnica transversal (zona a y b) con el mapa de módulos y la deuda de producto (zona c). La línea base de build y CI está en [`00_BASELINE_Y_BUILD.md`](./00_BASELINE_Y_BUILD.md).

## 1. Veredicto de arquitectura

**Arquitectura sana y reparable.** Monolito modular NestJS + PostgreSQL con RLS real, puertos simulables para integraciones y contratos compartidos en `packages/contracts`. Es exactamente la forma que pide el §3.6 (sin microservicios ni Kubernetes) y no hay evidencia de ninguna causal de reescritura de TANJIRO §31: los tenants **sí** se pueden aislar (0 fugas en 304 pruebas HTTP y RLS FORCE en 54 tablas), el sistema **sí** se puede probar (1.372 unitarias + 589 de integración verdes) y **sí** se puede desplegar con trabajo acotado. Los defectos graves son de **configuración por defecto** (drivers fake sin guarda), **reglas de negocio ausentes** (aprobación por plataforma, último Owner, invitaciones) y **operación** (backups, monitoreo), no de estructura.

## 2. Lo que está bien y no se toca

| Pieza                                                                                                                                                 | Evidencia                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Cadena JWT → RBAC (`@Roles` por endpoint, deny-by-default) → RLS                                                                                      | `apps/api/src/core/{auth,rbac,tenant}`; matriz BOLA en `evidencia/seguridad/06_bola_matrix.csv` |
| Rol de runtime `adoptafacil_app` sin SUPERUSER ni BYPASSRLS, distinto del owner; FORCE en 54/61 tablas                                                | `evidencia/seguridad/09_rls_posture.out`                                                        |
| Helpers `withTenant` / `withOrgContext` que fijan `app.current_org_id` en transacción                                                                 | `apps/api/src/prisma/prisma.service.ts`                                                         |
| Exposición pública solo por 94 funciones `SECURITY DEFINER` con columnas mínimas y sin `EXECUTE` dinámico                                             | `evidencia/seguridad/secdef_functions.txt`                                                      |
| Auditoría append-only con triggers que abortan UPDATE/DELETE/TRUNCATE incluso al superusuario (salvo desactivación del trigger por el owner, SEC-013) | migración `t013_audit_log_append_only`                                                          |
| Sin SQL injection: 0 `$queryRawUnsafe`/`Prisma.raw` en código de la app                                                                               | `evidencia/seguridad/raw_sql_ts.txt`                                                            |
| Puertos `PaymentPort`, `StoragePort`, `NotificationPort`, `IdentityPort`, DIAN                                                                        | `apps/api/src/core/*`, `packages/contracts/src/*`                                               |
| Idempotencia de webhooks por `dedupKey`; HMAC en tiempo constante en el adaptador real de MercadoPago                                                 | `mercadopago-payment.adapter.ts`, `04_SECURITY_AUDIT.md` SEC-002                                |
| Firmas manuscritas cifradas en reposo (AES-256-GCM)                                                                                                   | `apps/api/src/core/crypto/signature-crypto.ts`                                                  |
| Contratos dual ESM/CJS y esquema Prisma dividido por módulo                                                                                           | `packages/contracts`, `prisma/schema/*.prisma`                                                  |

## 3. Defectos estructurales (transversales)

| ID      | Defecto                                                                                                        | Dónde                                                                                              | Por qué importa                                                                                                       |
| ------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| ARQ-001 | **Adaptadores fake por defecto sin guarda de producción** (identidad, pagos, DIAN, firma)                      | `env.validation.ts:66,141`, `identity.module.ts`, `payment.module.ts:25-31`, `org.module.ts:70-87` | Origen común de los tres P0 de seguridad (SEC-001/002/003). Es el mismo patrón raíz del repo anterior, que reaparece. |
| ARQ-002 | **Sin feature flags de módulo**: los 14 módulos responden siempre                                              | `app.module.ts`                                                                                    | No se puede apagar dinero, certificados ni menores sin borrar código (§5.1 lo prohíbe).                               |
| ARQ-003 | 8 tablas sin RLS, dos de ellas con `organization_id` (cuentas bancarias y tokens del PSP)                      | `04_SECURITY_AUDIT.md` SEC-004                                                                     | Pierde la defensa en profundidad justo en los datos más sensibles.                                                    |
| ARQ-004 | Conexión de BullMQ sin índice de base, credenciales ni TLS                                                     | `env.validation.ts:231-237`, `queue.module.ts:19`                                                  | Colas sin autenticar en el VPS; entornos que se roban trabajos (BLD-003).                                             |
| ARQ-005 | Almacenamiento solo en disco local; sin driver S3 ni URLs firmadas                                             | `env.validation.ts:54`                                                                             | Impide D11 (MinIO), backups de archivos y más de una instancia.                                                       |
| ARQ-006 | Funciones `SECURITY DEFINER` propiedad del superusuario de migraciones, con `search_path=public` sin `pg_temp` | `secdef_functions.txt`, SEC-023                                                                    | Cualquier defecto futuro dentro de una función corre como superusuario. Diseño objetivo: dueño dedicado `NOLOGIN`.    |
| ARQ-007 | Sin `EvidenceProofProvider` ni cadena de hashes                                                                | —                                                                                                  | Requisito M de TANJIRO §0 y §27; hoy la auditoría no es verificable frente al owner de la BD.                         |
| ARQ-008 | Bundle web monolítico (1,71 MB)                                                                                | `apps/web/dist`                                                                                    | LCP en móvil; landing y portal son el producto estrella (F4, F6).                                                     |

## 4. Arquitectura objetivo (sin cambiar de stack)

1. **Arranque fail-closed:** en `NODE_ENV=production` la API se niega a iniciar con cualquier driver `fake`/`stub`/`log` o con un rol de BD con bypass; chequeo de postura RLS al arrancar.
2. **Flags de módulo** validados por Zod + guard global (404 para módulo apagado, 503 para dinero sin PSP real) + `GET /public/config/features` para que el web oculte la navegación.
3. **RLS completa:** policies en `organization_bank_accounts` y `organization_mercadopago_accounts`; tablas de identidad accesibles solo por funciones acotadas; dueño dedicado `NOLOGIN` para las `SECURITY DEFINER`.
4. **Cifrado de secretos de terceros** (tokens del PSP, cuentas bancarias) con el mismo esquema AES-256-GCM de las firmas.
5. **Storage S3-compatible** detrás del `StoragePort` con URLs firmadas de corta vida, magic bytes y límites D12.
6. **Evidencia:** `EvidenceProofProvider → InternalProofProvider` (cadena de hashes por tenant) → `BlockchainAnchorProvider` futuro que solo ancla hashes por lote. Sin token ni wallet.
7. **Despliegue D11** según `07_DEPLOYMENT_AND_OPS.md` §3.

---

## 5. Producto: módulos, flags, deuda y código muerto (zona c)

Línea base `48cabad`.

**Evidencia de soporte:**

- `evidencia/producto/endpoints.tsv`: 219 endpoints extraídos de los controladores. La columna de roles es aproximada.
- `evidencia/producto/knip.txt`: análisis de código muerto con knip.
- Build: ver `00_BASELINE_Y_BUILD.md`.

### 5.1 Mapa de módulos M01–M15

**Convenciones de la tabla:**

- LOC = líneas de `apps/api/src/modules/<m>`.
- EP = endpoints.
- U/I = archivos de spec unitarios / de integración.
- Web = archivos en `apps/web/src/features/<m>`.

| Mód. | Nombre (Levantamiento / PM)                                 | Código                                         | LOC           | EP  | U/I  | Web                            | Estado real                                                                                                                                                                 | Decisión MVP 1.0                                                                                                                         |
| ---- | ----------------------------------------------------------- | ---------------------------------------------- | ------------- | --- | ---- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| M01  | Organizaciones, formalización, documentos, rep. legal, DIAN | `modules/org`                                  | 2.752         | 22  | 4/~9 | 21                             | Funciona, pero sin estado operativo ni aprobación o suspensión; formalidad autodeclarada; DIAN falsa                                                                        | **KEEP y reforzar**: añadir estado operativo, aprobación por la plataforma, gate de documentos real y driver DIAN real o apagar ESAL_RTE |
| M02  | Identidad, auth, RBAC, tenant                               | `core/{auth,rbac,tenant,identity}`             | n/d           | ~14 | sí   | auth                           | Login, registro y reset OK. Fallas: Google fake por defecto (suplantación), sin invitaciones, Administrator puede volverse Owner, fallback `x-org-id`                       | **KEEP**: arreglar identidad (fail-closed), añadir invitaciones y reglas de último Owner                                                 |
| M03  | Animales y clínico                                          | `modules/animals`                              | 3.790         | 29  | 9/9  | 22                             | Sólido; sin fuga clínica en `/public/*` (flowB)                                                                                                                             | **KEEP**                                                                                                                                 |
| M04  | Adopciones, contrato y seguimiento                          | `modules/adoptions`                            | 2.841         | 20  | 5/7  | 8                              | El flujo llega a la firma. Defectos: snapshot del cliente, cedente "Adopta Fácil", PDF que se rompe con emoji, animal sin cambio de estado, adoptante sin UI de seguimiento | **KEEP y corregir** (bloqueante del piloto)                                                                                              |
| M05  | Donaciones y certificados                                   | `modules/donations`                            | 1.478         | 11  | 4/6  | 9                              | Solo driver fake verificado; certificado ligado a la DIAN falsa                                                                                                             | **FLAG** `donations` y `donation_certificates` (apagados) hasta resolver D1 y la DIAN                                                    |
| M06  | Campañas y rendición de cuentas                             | `modules/campaigns`                            | 966           | 11  | 5/8  | 8                              | Crear y mostrar evidencia OK; la evidencia se publica sin archivo (URL 404); sin reporte descargable                                                                        | **SIMPLIFY**: campañas sin cobro mientras M05 esté apagado                                                                               |
| M07  | Apadrinamientos (recurrentes)                               | `modules/sponsorships`                         | 2.265         | 16  | 3/4  | 4                              | Facturación recurrente sobre un pago fake                                                                                                                                   | **FLAG / DEFER**                                                                                                                         |
| M08  | Voluntariado y certificados                                 | `modules/volunteering`                         | 2.385         | 21  | 6/~1 | 5                              | Menores sin consentimiento verificable; certificado sin NIT, logo ni verificación                                                                                           | **FLAG / DEFER**; si sale, sin menores                                                                                                   |
| M09  | Recursos (proveedores, blog)                                | `modules/resources`                            | 1.839         | 23  | 2/2  | 11                             | Completo, poco probado                                                                                                                                                      | **DEFER (flag)**                                                                                                                         |
| M10  | Marketplace                                                 | `modules/marketplace`                          | 642           | 8   | 1/2  | 7                              | Catálogo con enlace a WhatsApp, sin carrito                                                                                                                                 | **FLAG**: solo vitrina con WhatsApp                                                                                                      |
| M11  | Comunidad                                                   | `modules/community`                            | 862           | 12  | 2/2  | 6                              | Publicaciones, comentarios y likes; sin moderación ni denuncias                                                                                                             | **DEFER (flag)**: sin moderación es riesgo reputacional                                                                                  |
| M12  | Reputación y reseñas                                        | `modules/reputation`                           | 745           | 10  | 4/0  | 3                              | Sin tests de integración                                                                                                                                                    | **DEFER (flag)**                                                                                                                         |
| M13  | Dashboards                                                  | `modules/dashboards`                           | 447           | 3   | 3/2  | 0 (dentro de org y plataforma) | Cifras incoherentes (aprobadas 1 / recibido $0); copy interno                                                                                                               | **SIMPLIFY**                                                                                                                             |
| M14  | Portales y subdominios                                      | `modules/portals`                              | 357           | 4   | 1/3  | 28                             | Tema y subdominio OK; portal público sin aprobación; reservados solo en el web                                                                                              | **KEEP**, con gate de "org aprobada"                                                                                                     |
| M15  | Pagos, plataforma y auditoría                               | `modules/payments`, `core/audit`, `platform-*` | 1.223 (pagos) | 10  | 4/1  | 1                              | MercadoPago cobra con el token de la plataforma (custodia); sin comisión al momento del cobro; `createPayout` sin implementar; auditoría sin consulta                       | Pagos: **FLAG (apagado)**. Auditoría: **KEEP**, más un endpoint de consulta                                                              |

**DELETE:** ningún módulo. Solo se borra código muerto probado (§4).

### 5.2 Inventario de feature flags

**Hoy no existen flags de módulo** [VERIFICADO]:

- `apps/api/src/config/env.validation.ts` no tiene variables `FEATURE_*`.
- `app.module.ts` registra siempre los 14 módulos, así que ninguna ruta devuelve 404 ni 503 por configuración.
- En el web solo hay `VITE_API_URL`, `VITE_AUTH_MODE` (mock|http), `VITE_GOOGLE_CLIENT_ID`, `VITE_MERCADOPAGO_PUBLIC_KEY` y `VITE_PORTAL_BASE_DOMAIN`.
- `VITE_AUTH_MODE=mock` es en realidad un flag de desarrollo peligroso si llega a un build público. Hay que verificar que el build de producción lo fije en `http`.

**"Interruptores" de facto (drivers):**

| Variable             | Valores            | Default | En producción (`render.yaml`)  | Riesgo                                  |
| -------------------- | ------------------ | ------- | ------------------------------ | --------------------------------------- |
| PAYMENT_DRIVER       | fake / mercadopago | fake    | **fake** (líneas 110-111)      | El webhook sin firma aprueba donaciones |
| AUTH_IDENTITY_DRIVER | fake / google      | fake    | **no definida, queda en fake** | Suplantación (`fake:<email>:<name>`)    |
| NOTIFICATION_DRIVER  | log / smtp         | log     | **log** (líneas 98-99)         | No se envía ningún correo real          |
| STORAGE_DRIVER       | disk / stub        | disk    | disk                           | Impide tener más de una instancia       |
| DIAN                 | solo fake          | fake    | fake                           | RTE siempre verificado                  |
| Signature            | solo fake          | fake    | fake                           | Sin proveedor de firma                  |

**Propuesta mínima:**

- Un `FEATURE_FLAGS` validado por Zod en la API.
- Un guard global que responda 404 en las rutas de módulos apagados y 503 en `/payments/*` si el driver no es real.
- Un `GET /public/config/features` para que el web oculte la navegación correspondiente.
- **Guardas fail-closed:** en producción, rechazar el arranque si cualquier driver es `fake` o `log`.

### 5.3 Deuda técnica de producto

- **76 `TODO(client)` y 98 TODO en total, 0 FIXME.** Los que gatean el negocio:
  - `formalization.machine.ts:43-48`: requisitos de transición.
  - `verification.ts`: niveles de verificación.
  - La tarifa de pasarela (2,65 % + 700, al estilo Wompi).
  - `animal-card.tsx:59-64`: favoritos.
  - `disk-storage.adapter.ts:22`: compresión de imágenes.
- **Documentación que contradice el código:**
  - `docs/manual/Manual_Usuario_Organizacion.md`: estado "Observado" por firma inválida.
  - Los manuales describen "recaudo consolidado + T+1", lo que choca con D1.
  - `docs/manual/Manual_Administracion_Plataforma.md:111` tiene un marcador de conflicto `=======`.
- **Scripts:** `apps/api/package.json` `start: node dist/main.js` está mal; la ruta real es `dist/src/main.js` (`render.yaml` usa la correcta).
- **Configuración:** el `.env` que genera `.env.example` no arranca, porque SMTP y MP están definidos pero vacíos y no pasan `min(1)` (AF-019).
- **Colas:** `queue.module.ts:19` (`parseRedisUrl`) ignora el índice de BD de `REDIS_URL`. Dos entornos con la misma Redis se consumen los jobs entre sí; lo reproduje con la DIAN (FK violada en la otra base, job en db0).
- **Seeds:**
  - `seed-platform-admin.ts:58-61` trae credenciales por defecto.
  - `seed-demo.ts:312` tiene el correo del admin fijo en el código.
  - `seed:demo` avanza la formalización a ESAL antes de subir documentos, así que la demo enseña el defecto como si fuera el flujo normal.

### 5.4 Código muerto (knip, revisado manualmente)

Muerto real, candidato a borrar en un PR propio con typecheck y tests:

- `PlaceholderPage`, `PortalDonateCta` y `OrgVolunteeringPage` (web).
- `EXAMPLE_QUEUE` y `ORG_ID_HEADER` (API). `ORG_ID_HEADER` está ligado al fallback inseguro `x-org-id`: hay que borrar ambos.
- `getSponsorshipPayments` (cliente web).
- `listMyFollowUps` y `submitFollowUp` (cliente web). **No están muertos por diseño: falta la UI.** Se conservan y se construye la pantalla.
- Varios `index.ts` de barrel con exports sin uso.

Falsos positivos de knip: specs, `scripts/*` y la configuración de Vite y Tailwind.

**Mocks en código de producción:**

- `computeProfileCompletenessMock` (`profile-completeness.ts`).
- El favorito local.
- `VITE_AUTH_MODE=mock`.
- Las páginas "Disponible próximamente" (transparencia nacional y reporte exógeno), enlazadas desde el copy de la landing como si existieran.
