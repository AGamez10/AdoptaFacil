# Configuración de producción: cada variable, qué valor lleva y de dónde sale

> Revisado el 2026-11-24 sobre `claude/project-thread-svlwgg` (con #158, #159 y #160).
> Inventario hecho leyendo el código: `apps/api/src/config/env.validation.ts` (la API no
> arranca si algo está mal), cada `process.env` de la API y de la web, `deploy/compose.yaml`,
> `deploy/docker/web.Dockerfile` y `deploy/scripts/*.sh`.
> Paso a paso con capturas mentales para cada proveedor: [GUIA-PASO-A-PASO-PRODUCCION.md](./GUIA-PASO-A-PASO-PRODUCCION.md).

## 1. Son dos archivos en el servidor (nunca en el repositorio)

| Archivo          | Plantilla                           | Para qué                                                                      |
| ---------------- | ----------------------------------- | ----------------------------------------------------------------------------- |
| `deploy/.env`    | `deploy/.env.example`               | Dominio, contraseñas de la base, secretos de la API, certificados, respaldos. |
| `deploy/api.env` | `deploy/api.env.produccion.example` | Correo, pagos, planes, archivos, dominios propios.                            |

```bash
cp deploy/.env.example deploy/.env
cp deploy/api.env.produccion.example deploy/api.env
chmod 600 deploy/.env deploy/api.env
deploy/scripts/preflight.sh   # lista en español lo que falta; no imprime secretos
```

Tres reglas que evitan los errores más comunes:

1. **Los interruptores de la API van con `true` o `false`.** `PLAN_ENFORCEMENT=on` antes se leía
   en silencio como apagado; desde este cambio la API no arranca y `preflight.sh` lo marca.
   Solo `CUSTOM_DOMAINS` y `PORTALS_TLS` (de `deploy/.env`, los lee Caddy) usan `on`/`off`.
2. **En `deploy/api.env` no dejes líneas `CLAVE=` vacías.** Lo que no uses va comentado con `#`.
3. **Nada que empiece por `<`** debe quedar: es texto de la plantilla.

## 2. `deploy/.env`

Genera cada contraseña con `openssl rand -hex 24` (copia y pega, no la inventes).

| Variable                   | ¿Obligatoria?                | Valor para producción                                    | De dónde sale                                                                                                                                       |
| -------------------------- | ---------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RELEASE`                  | Sí                           | SHA corto del commit (`git rev-parse --short HEAD`)      | Lo pone `deploy/scripts/deploy.sh`; sirve para volver atrás.                                                                                        |
| `APP_DOMAIN`               | Sí                           | `adoptafacil.org` (sin `https://`)                       | Tu dominio.                                                                                                                                         |
| `ACME_EMAIL`               | Sí                           | `adoptafacil.oficial@gmail.com`                          | Correo al que Let's Encrypt avisa si un certificado falla.                                                                                          |
| `POSTGRES_USER` / `_DB`    | Sí                           | `adoptafacil`                                            | Déjalos así.                                                                                                                                        |
| `POSTGRES_PASSWORD`        | Sí                           | `openssl rand -hex 24`                                   | La generas tú. Guárdala en tu gestor de contraseñas.                                                                                                |
| `APP_DB_PASSWORD`          | Sí                           | `openssl rand -hex 24` (solo letras y números)           | La generas tú. Es la del rol sin privilegios que usa la API (RLS).                                                                                  |
| `JWT_SECRET`               | Sí                           | `openssl rand -hex 24` o más                             | La generas tú. **Si la cambias, todos cierran sesión.**                                                                                             |
| `SIGNATURE_ENCRYPTION_KEY` | Sí                           | `openssl rand -hex 32` (exactamente 64 caracteres)       | La generas tú. Cifra firmas, tokens de Mercado Pago y MFA. **Si la pierdes o la cambias, no se pueden leer las firmas guardadas.** Guárdala aparte. |
| `STORAGE_MAX_FILE_MB`      | No                           | `15`                                                     | Tope de subida.                                                                                                                                     |
| `PORTALS_TLS`              | Sí, para subdominios         | `cloudflare`                                             | Con `off` el portal de cada refugio queda en `/o/<slug>` y no en `refugio.adoptafacil.org`, que es lo que se promete en todos los planes.           |
| `CLOUDFLARE_API_TOKEN`     | Con `PORTALS_TLS=cloudflare` | token con permiso _Zone → DNS → Edit_ solo sobre tu zona | Cloudflare → My Profile → API Tokens → Create Token → plantilla "Edit zone DNS" → Zone Resources: tu dominio.                                       |
| `NAMECHEAP_*`              | Solo con `namecheap`         | —                                                        | Solo si el DNS está en Namecheap.                                                                                                                   |
| `VITE_PORTAL_BASE_DOMAIN`  | Sí, para subdominios         | igual que `APP_DOMAIN`                                   | Se hornea en la web.                                                                                                                                |
| `CUSTOM_DOMAINS`           | Sí, para el plan Pro         | `on`                                                     | Va con `CUSTOM_DOMAIN_CNAME_TARGET` en `api.env` (si falta, `preflight.sh` falla).                                                                  |
| `VITE_GOOGLE_CLIENT_ID`    | No                           | vacío                                                    | Solo si enciendes "Iniciar con Google".                                                                                                             |
| `VITE_PAYMENT_PROVIDER`    | No                           | vacío                                                    | `off` esconde por completo los pagos en la web. Vacío = la web pregunta a la API.                                                                   |
| `BACKUP_AGE_RECIPIENT`     | Sí                           | `age1…` (clave pública)                                  | `age-keygen -o respaldo.key` **en tu computador**; la privada nunca va al VPS. Guía, punto 4.                                                       |
| `BACKUP_RETENTION_DAYS`    | No                           | `14`                                                     | —                                                                                                                                                   |
| `BACKUP_RCLONE_REMOTE`     | Muy recomendada              | `b2:adoptafacil-backups`                                 | Backblaze B2 con clave limitada al bucket. Sin ella el respaldo vive en el mismo VPS que puede perderse. Guía, punto 4.                             |
| `ALERT_WEBHOOK_URL`        | Muy recomendada              | `https://ntfy.sh/<tema-largo-y-secreto>`                 | App ntfy en el teléfono, suscrita al mismo tema. La usan la API (errores 500, conciliación) y los scripts. Guía, punto 6.                           |
| `BACKUP_HEALTHCHECK_URL`   | Muy recomendada              | `https://hc-ping.com/<uuid>`                             | healthchecks.io: avisa si el respaldo diario **no** corrió. Guía, punto 6.                                                                          |

Variables con valor por defecto en el compose que no hace falta tocar: `API_REPLICAS` (2),
`WORKER_REPLICAS` (1), `API_DB_POOL_SIZE` (10), `PGBOUNCER_POOL_SIZE` (20),
`PGBOUNCER_MAX_DB_CONNECTIONS` (40), `TRUST_PROXY_HOPS` (2: Cloudflare + Caddy).

## 3. `deploy/api.env`

| Variable                                                                            | ¿Obligatoria?                              | Valor para producción                                       | De dónde sale                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_IDENTITY_DRIVER`                                                              | Sí                                         | `disabled` (o `google`)                                     | `fake` no arranca.                                                                                                                                                                                                                        |
| `GOOGLE_OAUTH_CLIENT_ID`                                                            | Con `google`                               | `….apps.googleusercontent.com`                              | Google Cloud → APIs y servicios → Credenciales → ID de cliente OAuth (aplicación web), origen `https://adoptafacil.org`. El mismo valor en `VITE_GOOGLE_CLIENT_ID`.                                                                       |
| `DIAN_DRIVER`                                                                       | Sí                                         | `disabled`                                                  | No existe API pública de la DIAN; la verificación es humana.                                                                                                                                                                              |
| `SIGNATURE_DRIVER`                                                                  | Sí                                         | `internal`                                                  | Firma electrónica simple de la plataforma (decisión del 2026-11-24). Con `disabled` firmar un contrato responde 503.                                                                                                                      |
| `NOTIFICATION_DRIVER`                                                               | Sí                                         | `smtp`                                                      | `log` no arranca.                                                                                                                                                                                                                         |
| `SMTP_HOST`                                                                         | Sí                                         | `email-smtp.us-east-1.amazonaws.com`                        | SES → SMTP settings → _SMTP endpoint_.                                                                                                                                                                                                    |
| `SMTP_PORT`                                                                         | Sí                                         | `587`                                                       | Con 587 la API exige cifrado (STARTTLS).                                                                                                                                                                                                  |
| `SMTP_USER` / `SMTP_PASS`                                                           | Sí con SES                                 | credenciales SMTP                                           | SES → SMTP settings → **Create SMTP credentials**. Se ven una sola vez. No son la clave de AWS.                                                                                                                                           |
| `SMTP_FROM`                                                                         | Sí                                         | `"AdoptaFácil" <no-reply@adoptafacil.org>`                  | Dirección del dominio verificado en SES.                                                                                                                                                                                                  |
| `EMAIL_QUEUE_RATE_MAX` / `_DURATION_MS`                                             | Recomendada                                | _Maximum send rate_ de SES − 1 / `1000`                     | SES → Account dashboard.                                                                                                                                                                                                                  |
| `SMTP_DKIM_*`                                                                       | No con SES                                 | —                                                           | Solo con un Postfix propio. SES firma por ti (Easy DKIM).                                                                                                                                                                                 |
| `STORAGE_DRIVER`                                                                    | Recomendada                                | `s3`                                                        | Sin ella los archivos quedan en el disco del VPS.                                                                                                                                                                                         |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` | Con `s3`                                   | R2: `https://<account-id>.r2.cloudflarestorage.com`, `auto` | Cloudflare → R2 → crear bucket privado → _Manage R2 API Tokens_ → permiso "Object Read & Write" solo para ese bucket. Guía, punto 5.                                                                                                      |
| `PAYMENT_DRIVER`                                                                    | Sí                                         | `mercadopago` (o `disabled` si aún no cobras)               | —                                                                                                                                                                                                                                         |
| `FEATURE_PAYMENTS`                                                                  | Para recibir donaciones                    | `true`                                                      | —                                                                                                                                                                                                                                         |
| `PAYMENTS_PRODUCTION_APPROVAL_REF`                                                  | Con `FEATURE_PAYMENTS=true`                | texto, p. ej. `aprobación dueño 2026-11-24`                 | Tu constancia escrita (D1–D7). Sin ella la API no arranca con pagos.                                                                                                                                                                      |
| `API_PUBLIC_BASE_URL`                                                               | Con Mercado Pago                           | `https://adoptafacil.org/api`                               | A esta dirección llegan los avisos de Mercado Pago.                                                                                                                                                                                       |
| `MERCADOPAGO_CLIENT_ID` / `_CLIENT_SECRET`                                          | Con `mercadopago`                          | de la app **Checkout Pro (Orders)**                         | Mercado Pago Developers → Tus integraciones → la app → **Credenciales de producción**. Registra allí la redirección `https://adoptafacil.org/api/org/mercadopago/callback`.                                                               |
| `MERCADOPAGO_ORDERS_WEBHOOK_SECRET`                                                 | Con `mercadopago`                          | clave secreta                                               | Misma app → Webhooks → URL `https://adoptafacil.org/api/donations/webhook/mercadopago`, evento **Order** → _Clave secreta_.                                                                                                               |
| `MERCADOPAGO_PLATFORM_ACCESS_TOKEN`                                                 | Para cobrar planes y café                  | `APP_USR-…` de producción                                   | App **Suscripciones** de la cuenta de AdoptaFácil → Credenciales de producción → _Access token_.                                                                                                                                          |
| `MERCADOPAGO_WEBHOOK_SECRET`                                                        | Con el token de arriba o con `mercadopago` | clave secreta                                               | App Suscripciones → Webhooks → URL `https://adoptafacil.org/api/billing/webhooks/mercadopago`, evento **Planes y suscripciones** → _Clave secreta_. El café envía su propia URL de aviso en cada pago y se verifica con esta misma clave. |
| `MERCADOPAGO_TEST`, `MERCADOPAGO_TEST_PAYER_EMAIL`                                  | **No** en producción                       | sin poner                                                   | Solo sandbox. `TEST_PAYER_EMAIL` no arranca en producción.                                                                                                                                                                                |
| `MERCADOPAGO_OAUTH_PKCE`                                                            | No                                         | `true` solo si activaste PKCE en la app                     | Si no coincide con el panel, conectar la cuenta falla.                                                                                                                                                                                    |
| `MERCADOPAGO_STATEMENT_DESCRIPTOR`                                                  | No                                         | hasta 22 caracteres                                         | Texto en el extracto de la tarjeta.                                                                                                                                                                                                       |
| `PLAN_ENFORCEMENT`                                                                  | Para cobrar planes                         | `true` (no `on`)                                            | Apagado = todos tienen Pro gratis.                                                                                                                                                                                                        |
| `PLAN_LAUNCH_DATE`                                                                  | Con `PLAN_ENFORCEMENT=true`                | `AAAA-MM-DD`                                                | Desde ese día, 3 meses de Pro gratis a quien no pague. Sin ella, quien no paga queda en Gratis al vencer su prueba de 14 días.                                                                                                            |
| `PLAN_NEW_ORG_TRIAL_DAYS`                                                           | No                                         | sin poner (14)                                              | `0` apaga la prueba.                                                                                                                                                                                                                      |
| `COFFEE_QR_DOMAINS`                                                                 | Si tu dominio no es `adoptafacil.org`      | tu `APP_DOMAIN`                                             | Dominio que se imprime en el QR del café.                                                                                                                                                                                                 |
| `CUSTOM_DOMAIN_CNAME_TARGET`                                                        | Con `CUSTOM_DOMAINS=on`                    | `portales.adoptafacil.org`                                  | Crea en Cloudflare un registro A `portales` → IP del VPS en **gris (DNS only)**.                                                                                                                                                          |
| `CUSTOM_DOMAIN_IPV4`                                                                | No                                         | IP del VPS                                                  | Permite a un refugio conectar la raíz de su dominio.                                                                                                                                                                                      |
| `REPORTS_SIGNATURES_ENABLED`                                                        | Para "Listo para firmar"                   | `true`                                                      | Firma del contador y revisor fiscal en informes (Crece y Pro).                                                                                                                                                                            |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`                          | No                                         | par generado / `mailto:adoptafacil.oficial@gmail.com`       | `pnpm --filter @adoptafacil/api exec web-push generate-vapid-keys`. Sin ellas no hay avisos push; correo y bandeja siguen igual.                                                                                                          |
| `STORAGE_PUBLIC_CDN_BASE_URL`                                                       | No                                         | `https://img.adoptafacil.org/api`                           | [ESCALA.md](./ESCALA.md).                                                                                                                                                                                                                 |
| `METRICS_TOKEN`                                                                     | No                                         | `openssl rand -hex 24`                                      | Solo si conectas Prometheus/Grafana.                                                                                                                                                                                                      |
| `FEATURE_SPONSORSHIPS`                                                              | **No**                                     | sin poner                                                   | No arranca en producción: aún no cobra con la cuenta de cada refugio.                                                                                                                                                                     |
| `FEATURE_VOLUNTEERING_MINORS`                                                       | **No**                                     | sin poner                                                   | No arranca en producción (menores).                                                                                                                                                                                                       |
| `FEATURE_DONATION_CERTIFICATES`                                                     | No                                         | sin poner                                                   | Certificado tributario: contador/abogado primero.                                                                                                                                                                                         |
| `FEATURE_COMMUNITY`, `_COMMUNITY_WALL`, `_REPUTATION`, `_RESOURCES`, `_MARKETPLACE` | No                                         | sin poner                                                   | Fases posteriores; enciéndelos solo si alguien va a moderar.                                                                                                                                                                              |

Ajustes finos con buen valor por defecto (no hace falta ponerlos): `PUBLIC_CACHE_TTL_S`,
`PUBLIC_RATE_LIMIT_PER_MIN(UTE)`, `PUBLIC_RATE_LIMIT_BOT_PER_MINUTE`, `ORG_WRITE_RATE_LIMIT_PER_MIN`,
`EMAIL_QUEUE_CONCURRENCY`, `EMAIL_QUEUE_ATTEMPTS`, `REMINDERS_*`, `DOCUMENTS_EXPIRING_SOON_WINDOW_DAYS`,
`FOLLOWUP_VIDEO_MAX_MB`, `PAYMENT_RECONCILE_INTERVAL_MS`, `MERCADOPAGO_TOKEN_REFRESH_*`,
`SPONSORSHIP_*`, `DATABASE_POOL_TIMEOUT_S`, `DATABASE_STATEMENT_TIMEOUT_MS`, `JWT_ACCESS_TTL`,
`JWT_REFRESH_TTL`, `PLATFORM_ACCESS_TTL_SECONDS`, `PLATFORM_MFA_MAX_SECONDS`,
`PLATFORM_IDLE_TIMEOUT_SECONDS`, `PLATFORM_APPROVAL_TTL_SECONDS`, `ORG_NAME_SIMILARITY_THRESHOLD`,
`STUDENT_SERVICE_MIN_HOURS` (80), `ADOPTION_FOLLOWUP_SCAN_INTERVAL_MS`, `FFMPEG_PATH`, `FFPROBE_PATH`.

## 4. Las que pone el compose (no las escribas)

`NODE_ENV=production`, `APP_ROLE`, `API_PORT`, `DATABASE_URL`, `DATABASE_URL_APP`,
`DATABASE_PGBOUNCER`, `DATABASE_POOL_SIZE`, `REDIS_URL`, `REDIS_CACHE_URL`, `API_CORS_ORIGIN`,
`WEB_BASE_URL`, `STORAGE_DISK_ROOT`, `STORAGE_PUBLIC_BASE_URL`, `JWT_SECRET`,
`SIGNATURE_ENCRYPTION_KEY`, `TRUST_PROXY_HOPS`, `THROTTLER_STORAGE=redis`, `HTTP_ACCESS_LOG`,
`ALERT_WEBHOOK_URL` (desde `deploy/.env`). En la web: `VITE_API_URL=/api`, `VITE_APP_DOMAIN`.
`PLATFORM_MFA_REQUIRED` no se pone: viene encendido y en producción no se puede apagar.

## 5. Solo para desarrollo o scripts (no van en producción)

`ALLOW_LOOPBACK_PUBLIC_URLS`, `SKIP_SERVICE_PREFLIGHT`, `STORAGE_STUB_BASE_URL`,
`DIAN_FAKE_FAILURES`, `DIAN_FAKE_LATENCY_MS`, `SEED_DEMO_PASSWORD`, `SMOKE_*`, `UPDATE_ROLE_MATRIX`,
`CERT_PDF_OUT`, `CAP_SERVER_URL` (app móvil), `VITE_AUTH_MODE`. `PLATFORM_ADMIN_EMAIL`,
`PLATFORM_ADMIN_NAME`, `PLATFORM_ADMIN_PASSWORD` y `PLATFORM_TEAM_ORG_ID` se pasan **una vez** en la
línea de comandos al crear el superadministrador (`seed-platform-admin`), no se guardan en un archivo.
`VITE_BILLING_CONTACT_URL` no se pasa al build: el botón "Quiero este plan" abre el WhatsApp oficial.

## 6. Correos con la marca de la organización (Crece y Pro): qué hacen exactamente

Verificado en el código (`core/notifications/branding/*`, `templated-notification.adapter.ts`,
`smtp-notification.adapter.ts`):

- **Proveedor:** la API envía por SMTP con nodemailer. **Amazon SES funciona sin cambiar código**:
  SES ofrece un servidor SMTP (`email-smtp.<región>.amazonaws.com:587`). No hace falta el SDK de AWS.
- **Con plan Crece o Pro**, los correos a adoptantes, donantes y voluntarios salen con:
  - remitente visible **"Nombre del refugio vía AdoptaFácil"**;
  - **Responder a** = correo de contacto del perfil del refugio (si lo tiene);
  - nombre del refugio en el encabezado y el **color de su portal** en la barra y el botón.
- **La dirección real sigue siendo `no-reply@adoptafacil.org`.** Por eso basta verificar **un solo
  dominio** en SES; ningún refugio tiene que tocar su DNS. Enviar desde `@turefugio.org` no está
  construido ni se promete (la oferta dice "con tu marca", no "desde tu dominio").
- Tope mensual: Crece 5.000, Pro 20.000. Pasado el tope el correo **sale igual**, con la marca de AdoptaFácil.
- Correos que **nunca** llevan la marca del refugio (son de AdoptaFácil): restablecer contraseña,
  verificación en dos pasos, cobros y avisos del plan, café.
- **Brecha cerrada en este cambio:** tres correos a personas del refugio salían siempre con la marca
  de AdoptaFácil aunque el refugio pagara: el código de entrega del animal, el aviso de seguimiento
  vencido y la aprobación/rechazo de horas de voluntariado. Ahora llevan la marca como los demás.

**Firma de contratos (decisión del dueño, 2026-11-24):** `SIGNATURE_DRIVER=internal` firma con
una **firma electrónica simple** de la propia plataforma: persona autenticada, imagen de la firma
dibujada (cifrada), huella SHA-256 del contrato, fecha UTC, identificador único `afs1:…` y evento de
auditoría. No es firma digital certificada; que baste para el contrato de adopción (Ley 527 de 1999,
art. 7, y Decreto 2364 de 2012) queda **por confirmar con abogado**. Antes de este cambio el único
valor permitido en producción era `disabled` y firmar respondía 503.

Verificar dominio y salir del sandbox de SES: [GUIA-PASO-A-PASO-PRODUCCION.md, punto 2](./GUIA-PASO-A-PASO-PRODUCCION.md)
(pasos A a L: Easy DKIM 2048, MAIL FROM `bounce`, DMARC `p=none`, lista de supresión, credenciales
SMTP y texto en inglés para pedir producción). Resumen de DNS en [CORREO.md §4](./CORREO.md).

## 7. Lo que se ofrece en los planes y depende solo de configuración

| Se ofrece                                                                                                    | Plan      | Depende de                                                                                                     |
| ------------------------------------------------------------------------------------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------- |
| Portal público en tu subdominio                                                                              | Todos     | `PORTALS_TLS=cloudflare` + `CLOUDFLARE_API_TOKEN` + `VITE_PORTAL_BASE_DOMAIN` (`deploy/.env`)                  |
| Correos (recibos, contratos, seguimientos…)                                                                  | Todos     | SES fuera del sandbox + `SMTP_*`                                                                               |
| Recaudo de donaciones                                                                                        | Todos     | `PAYMENT_DRIVER=mercadopago`, `FEATURE_PAYMENTS=true`, `PAYMENTS_PRODUCTION_APPROVAL_REF`, credenciales Orders |
| Adopciones con contrato                                                                                      | Todos     | `SIGNATURE_DRIVER=internal`                                                                                    |
| Pagar Crece/Pro en línea y comprobante por cobro                                                             | Crece/Pro | `PLAN_ENFORCEMENT=true`, `PLAN_LAUNCH_DATE`, `MERCADOPAGO_PLATFORM_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` |
| Correos con tu marca                                                                                         | Crece/Pro | Lo mismo que "Correos". Nada por refugio.                                                                      |
| Dominio propio                                                                                               | Pro       | `CUSTOM_DOMAINS=on` + `CUSTOM_DOMAIN_CNAME_TARGET` + registro `portales` en gris                               |
| "Listo para firmar" (contador/revisor fiscal)                                                                | Crece/Pro | `REPORTS_SIGNATURES_ENABLED=true`                                                                              |
| Plantillas Pro, sin sello, Excel, PDF de impacto, cierre mensual, exporte contable, miembros, almacenamiento | Crece/Pro | Nada: lo hace cumplir el código con `PLAN_ENFORCEMENT=true`                                                    |
| Soporte prioritario por WhatsApp                                                                             | Pro       | Proceso del equipo (no es configuración)                                                                       |

## 8. Cómo saber que quedó bien

1. `deploy/scripts/preflight.sh` → `Preflight OK`.
2. Al desplegar, si algo está mal la API **no arranca** y el log lista cada variable con el motivo:
   `dc logs api --since 5m | grep -A20 "Invalid environment"`.
3. `pnpm mp:doctor` (desde tu computador, con las mismas variables) muestra las URLs exactas que
   hay que registrar en Mercado Pago, sin imprimir secretos.
4. Correo: "Olvidé mi contraseña" con tu Gmail → `dc logs worker --since 10m | grep NotificationPort`
   dice `result=ok` → en Gmail "Mostrar original": SPF, DKIM y DMARC en **PASS**.
