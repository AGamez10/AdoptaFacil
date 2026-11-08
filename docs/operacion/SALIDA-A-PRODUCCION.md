# Salida a producción: runbook

> Versión 2026-11-06. Orden de ejecución para el primer despliegue en el VPS.
> Complementa a [DESPLIEGUE_VPS.md](./DESPLIEGUE_VPS.md), donde está el detalle de cada paso, y
> a [CORREO.md](./CORREO.md), [BACKUPS.md](./BACKUPS.md) y [MONITOREO.md](./MONITOREO.md).
> Ningún secreto va en el repositorio, en el chat ni en capturas: solo en `deploy/.env` y
> `deploy/api.env` del servidor, con `chmod 600`.

## 0. Cómo queda por defecto

| Qué                      | Valor de salida                                                                              | Cuándo cambia                                        |
| ------------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Pagos y apadrinamientos  | **Apagados** (`FEATURE_PAYMENTS`/`FEATURE_SPONSORSHIPS` ausentes, `PAYMENT_DRIVER=disabled`) | Paso 7, después de la prueba sandbox de Mercado Pago |
| Certificados de donación | Apagados                                                                                     | Con contador y pagos encendidos                      |
| Planes                   | Sin cobro: `PLAN_ENFORCEMENT` ausente, así que todas las organizaciones tienen Pro           | Decisión del dueño                                   |
| Identidad Google         | `AUTH_IDENTITY_DRIVER=disabled`: solo correo y contraseña                                    | Cuando haya `GOOGLE_OAUTH_CLIENT_ID` de producción   |
| DIAN y firma externa     | `disabled`                                                                                   | Sin fecha                                            |
| Voluntariado con menores | Prohibido en producción (la API no arranca)                                                  | Con el concepto del abogado                          |
| Archivos                 | Cloudflare R2 (`STORAGE_DRIVER=s3`)                                                          | —                                                    |
| Correo                   | Relay SMTP (Brevo recomendado)                                                               | Postfix propio en una fase 2                         |

## 1. Lo que solo puede hacer el dueño (cuentas, compras y tokens)

Hazlo en este orden. Guarda cada clave en tu gestor de contraseñas y **no la envíes por el chat**: se pega directo en el servidor en el paso 4.

1. **VPS:** [Hostinger VPS](https://www.hostinger.com/vps-hosting) → **KVM 2** con Ubuntu 24.04 y el centro de datos más cercano (EE. UU. o Brasil). Al comprarlo, agrega tu clave SSH pública. Luego, en hPanel → VPS → Firewall, deja solo 22/tcp, 80/tcp, 443/tcp y 443/udp. Anota la **IP**.
2. **Dominio en Cloudflare:** [dash.cloudflare.com](https://dash.cloudflare.com) → Add a domain → `adoptafacil.org` y cambia los nameservers donde compraste el dominio. Crea estos registros DNS **sin proxy (nube gris)**:
   - `A @ → IP`
   - `A www → IP`
   - `A * → IP`

   Luego ve a My Profile → API Tokens → Create Token → plantilla "Edit zone DNS", limitada a la zona `adoptafacil.org`. Ese es el `CLOUDFLARE_API_TOKEN`.

3. **R2 (archivos):** en Cloudflare → R2 → Create bucket `adoptafacil-media`, privado. Luego Manage API tokens → **Object Read & Write** solo sobre ese bucket. Anota el Account ID, el Access Key ID y el Secret.
4. **Correo:** [Brevo](https://app.brevo.com) → Senders, Domains & Dedicated IPs → Domains → agrega `adoptafacil.org` y crea en Cloudflare los registros que te pida (SPF, DKIM, DMARC). Después ve a SMTP & API → SMTP → genera la clave SMTP. Detalle en [CORREO.md](./CORREO.md).
5. **Respaldos off-site:** [Backblaze B2](https://secure.backblaze.com/b2_buckets.htm) → bucket privado `adoptafacil-backups` → Application Keys → clave limitada a ese bucket. Anota el keyID y la applicationKey.
6. **Alertas:**
   - En la app [ntfy](https://ntfy.sh), suscríbete a un tema largo y aleatorio. Su URL es `ALERT_WEBHOOK_URL`.
   - En [healthchecks.io](https://healthchecks.io), crea un check diario. Su URL de ping es `BACKUP_HEALTHCHECK_URL`.
   - En [UptimeRobot](https://uptimerobot.com), crea un monitor de palabra clave `"status":"ok"` sobre `https://adoptafacil.org/api/health`, cada 5 minutos.
7. **Mercado Pago:** es lo único que queda para el final. Ver la sección 3.

## 2. Despliegue (en el VPS, como `deploy`)

```bash
# 1. Preparar el sistema (una vez): DESPLIEGUE_VPS.md §Primer despliegue, punto 2
# 2. Código
sudo git clone https://github.com/AGamez10/AdoptaFacil /opt/adoptafacil && cd /opt/adoptafacil

# 3. Clave de respaldos: la PRIVADA se queda en tu PC, nunca en el VPS
age-keygen -o ~/adoptafacil-backup.key   # en TU PC; copia la línea "public key: age1…"

# 4. Secretos
sudo cp deploy/.env.example deploy/.env && sudo cp deploy/api.env.example deploy/api.env
sudo chmod 600 deploy/.env deploy/api.env
for k in POSTGRES_PASSWORD APP_DB_PASSWORD JWT_SECRET; do echo "$k=$(openssl rand -hex 24)"; done
echo "SIGNATURE_ENCRYPTION_KEY=$(openssl rand -hex 32)"
sudo nano deploy/.env       # pega lo anterior + la tabla de abajo
sudo nano deploy/api.env    # tabla de abajo; borra las líneas que no uses
sudo rclone config          # remoto "b2" con el keyID/applicationKey del paso 1.5

# 5. Desplegar una versión fija: preflight, respaldo, build, migraciones y humo
sudo -E deploy/scripts/deploy.sh <tag-o-commit-aprobado>

# 6. PlatformAdmin con contraseña fuerte (DESPLIEGUE_VPS.md §PlatformAdmin inicial), y activa la MFA al entrar
# 7. Primer respaldo y restauración probada
sudo deploy/scripts/backup.sh && sudo deploy/scripts/restore-test.sh
# 8. Cron (DESPLIEGUE_VPS.md §Tareas programadas): respaldo diario, restauración semanal y monitor cada 5 min
```

`deploy/scripts/preflight.sh` se niega a seguir si falta un valor obligatorio, si un secreto es corto, si hay una línea `CLAVE=` vacía (la API no arrancaría), si un driver es simulado o si los archivos no tienen `chmod 600`. `deploy/scripts/smoke.sh` comprueba que la API, la web, la redirección https y www, HSTS, el certificado público, el portal por subdominio, que los pagos estén en el estado esperado, que las rutas privadas pidan sesión, que solo Caddy publique puertos y la postura RLS. Se puede volver a correr en cualquier momento.

### `deploy/.env`

| Variable                                                                         | Valor                    |
| -------------------------------------------------------------------------------- | ------------------------ |
| `APP_DOMAIN`                                                                     | `adoptafacil.org`        |
| `ACME_EMAIL`                                                                     | tu correo                |
| `POSTGRES_PASSWORD`, `APP_DB_PASSWORD`, `JWT_SECRET`, `SIGNATURE_ENCRYPTION_KEY` | generados en el punto 4  |
| `PORTALS_TLS`                                                                    | `cloudflare`             |
| `CLOUDFLARE_API_TOKEN`                                                           | paso 1.2                 |
| `VITE_PORTAL_BASE_DOMAIN`                                                        | `adoptafacil.org`        |
| `VITE_PAYMENT_PROVIDER`                                                          | `off` hasta el paso 3    |
| `BACKUP_AGE_RECIPIENT`                                                           | `age1…` (clave pública)  |
| `BACKUP_RCLONE_REMOTE`                                                           | `b2:adoptafacil-backups` |
| `ALERT_WEBHOOK_URL`, `BACKUP_HEALTHCHECK_URL`                                    | paso 1.6                 |

### `deploy/api.env`

```dotenv
AUTH_IDENTITY_DRIVER=disabled
PAYMENT_DRIVER=disabled
DIAN_DRIVER=disabled
SIGNATURE_DRIVER=disabled
NOTIFICATION_DRIVER=smtp
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=<usuario SMTP de Brevo>
SMTP_PASS=<clave SMTP de Brevo>
SMTP_FROM=AdoptaFácil <no-responder@adoptafacil.org>
STORAGE_DRIVER=s3
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=adoptafacil-media
S3_ACCESS_KEY_ID=<R2>
S3_SECRET_ACCESS_KEY=<R2>
```

## 3. Mercado Pago (el último paso)

Requiere que el PR #88 (ADR-PAG-003, OAuth del refugio sin split y sin custodia) esté en la versión desplegada. Detalle en `docs/pagos/mercadopago-oauth.md`.

**Del panel de [Mercado Pago Developers](https://www.mercadopago.com.co/developers/panel/app)**, con la cuenta de AdoptaFácil:

1. Aplicación con Checkout Pro, Suscripciones y OAuth habilitados. Copia el **Client ID** y el **Client Secret**, primero los de prueba y luego los de producción.
2. Redirect URL: `https://adoptafacil.org/api/org/mercadopago/callback`.
3. Webhooks: la URL `https://adoptafacil.org/api/billing/webhooks/mercadopago` con el evento "Planes y suscripciones". Copia la **clave secreta**.
4. Solo si se cobran planes: el **Access Token de producción** de la cuenta de AdoptaFácil.
5. Usuarios de prueba (vendedor y comprador) para el sandbox.

**En el VPS**, agrega esto a `deploy/api.env`:

```dotenv
PAYMENT_DRIVER=mercadopago
MERCADOPAGO_TEST=true                 # sandbox primero; luego bórrala
MERCADOPAGO_CLIENT_ID=<…>
MERCADOPAGO_CLIENT_SECRET=<…>
MERCADOPAGO_WEBHOOK_SECRET=<…>
MERCADOPAGO_OAUTH_PKCE=true           # solo si lo activaste en la app
API_PUBLIC_BASE_URL=https://adoptafacil.org/api
FEATURE_PAYMENTS=true
PAYMENTS_PRODUCTION_APPROVAL_REF=<referencia de tu aprobación escrita>
# MERCADOPAGO_PLATFORM_ACCESS_TOKEN=<…>   solo para cobrar planes
```

Después pon `VITE_PAYMENT_PROVIDER=mercadopago` en `deploy/.env` (la web se reconstruye) y vuelve a desplegar:

```bash
sudo -E deploy/scripts/deploy.sh <mismo-tag>
EXPECT_PAYMENTS=true sudo -E deploy/scripts/smoke.sh
```

Prueba sandbox antes de quitar `MERCADOPAGO_TEST`:

1. Un refugio de prueba conecta su cuenta.
2. Haz una donación con tarjeta de prueba aprobada.
3. Comprueba que llega el webhook y que la donación queda aprobada una sola vez (si reenvías el webhook, no se duplica).
4. Comprueba que el monto llega a la cuenta del vendedor de prueba, no a la de AdoptaFácil.

`PAYMENTS_PRODUCTION_APPROVAL_REF` es la guarda de la API para que nadie encienda dinero sin dejar registro. En modo directo no hay custodia (el dinero va del donante a la cuenta del refugio), pero el concepto del abogado sigue pendiente: la referencia registra que el dueño acepta salir con ese riesgo.
