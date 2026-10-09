# Despliegue en el VPS de Hostinger (Docker Compose + Caddy)

> Decisión D11: VPS Hostinger, Docker Compose, Caddy con TLS automático, sin
> Kubernetes. Dominio: **adoptafacil.org**, con portales por subdominio
> (`<org>.adoptafacil.org`). Este runbook cierra OPS-003/AF-019 en lo que el
> repo puede cerrar; los pasos marcados **[VPS]** solo se ejecutan en el
> servidor del dueño y quedan como verificación pendiente.

## Lo que necesitas antes de empezar

| Qué                                    | Recomendación                                                                                     | Para qué                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| VPS                                    | Hostinger **KVM 2** (2 vCPU, 8 GB RAM, 100 GB NVMe), plantilla **Ubuntu 24.04 LTS** sin panel     | todo el stack; ver §Tamaño                                 |
| Dominio `adoptafacil.org`              | ya registrado en **Namecheap** (un año); renovación automática activada, ver §Renovación          | —                                                          |
| DNS con API                            | **Cloudflare** (plan Free), decidido; ver §DNS                                                    | certificado comodín de los portales por DNS-01             |
| Cuenta de **Backblaze B2**             | un bucket privado `adoptafacil-backups` y una clave de aplicación limitada a ese bucket           | copia off-site de los respaldos cifrados                   |
| App **ntfy** en el celular             | un tema con nombre largo y aleatorio (`openssl rand -hex 12`)                                     | alertas del servidor (`ALERT_WEBHOOK_URL`)                 |
| Cuenta gratuita de **UptimeRobot**     | monitor HTTPS cada 5 min a `https://adoptafacil.org/api/health` con palabra clave `"status":"ok"` | aviso si el VPS entero cae (lo que el VPS no puede avisar) |
| Cuenta gratuita de **healthchecks.io** | un check diario con 2 h de gracia                                                                 | aviso si el respaldo diario no corre                       |
| Clave SSH                              | la tuya, cargada al crear el VPS                                                                  | entrar al servidor sin contraseña                          |
| Par de claves **age**                  | generado en tu computador (`age-keygen -o adoptafacil-backup.key`); la privada nunca va al VPS    | cifrar los respaldos; ver `BACKUPS.md`                     |

**Secretos: solo en el servidor.** Contraseñas, `JWT_SECRET`, las credenciales
del DNS (Cloudflare o Namecheap), la clave de B2, el SMTP y, cuando se enciendan los pagos, el access
token y el secreto del webhook de Mercado Pago se escriben **directamente** en
`deploy/.env` o `deploy/api.env` del VPS (`chmod 600`). Nunca en el repositorio,
en un PR, en un issue ni en el chat. Lo único público son las `VITE_*` (llaves
públicas que el navegador ve de todas formas).

## Tamaño

Medido con este compose: en reposo la API usa ~111 MB, Postgres ~25 MB, Caddy
~13 MB y Redis ~5 MB. Lo que pesa es **construir** las imágenes en el propio VPS
(`pnpm install` + build de API y web), que pide 2–3 GB de RAM durante unos
minutos. Por eso KVM 2: deja margen para construir sin detener el servicio y
para que Postgres crezca. KVM 1 (1 vCPU, 4 GB) arranca, pero cada despliegue
compite con la API por la única CPU. Centro de datos: el más cercano a Colombia
que ofrezca Hostinger al comprar (Sudamérica o EE. UU.).

## Qué se despliega

| Servicio   | Imagen                                       | Red            | Puertos publicados |
| ---------- | -------------------------------------------- | -------------- | ------------------ |
| `caddy`    | `deploy/docker/web.Dockerfile` (SPA + Caddy) | `edge`         | 80, 443 (TCP/UDP)  |
| `api`      | `deploy/docker/api.Dockerfile` → `runtime`   | `edge`, `data` | ninguno            |
| `migrate`  | `deploy/docker/api.Dockerfile` → `migrate`   | `data`         | ninguno (one-shot) |
| `postgres` | `postgres:16`                                | `data`         | ninguno            |
| `redis`    | `redis:7` (AOF, `noeviction` para BullMQ)    | `data`         | ninguno            |

- Cada host sirve el SPA y, en `/api/*`, la API: `https://adoptafacil.org/api`
  en el dominio principal y `https://<org>.adoptafacil.org/api` en cada portal.
  El front se compila con `VITE_API_URL=/api` (relativa), así que nunca hay
  llamadas entre dominios: sin CORS cruzado y la cookie de sesión no sale de su
  host. `www.adoptafacil.org` redirige al dominio principal.
- `data` es una red **interna**: Postgres y Redis no tienen salida a internet ni
  puertos en el host.
- La API corre como usuario `node` (no root), solo con dependencias de
  producción, y **nunca recibe la contraseña del owner** de la base: se conecta
  como `adoptafacil_app` (sin `BYPASSRLS`).
- `migrate` corre antes de la API en cada `up`: aplica migraciones
  (`prisma migrate deploy`), rota la contraseña de `adoptafacil_app` (la
  migración inicial la deja fija, AF-016) y ejecuta el chequeo de postura RLS.
  Si la postura falla, **la API no arranca**.
- Los procesadores de colas (BullMQ) corren dentro del proceso de la API.
- Archivos subidos: driver `disk` sobre el volumen `api_storage` (incluido en
  los respaldos). El paso a S3 compatible (F28) depende del adaptador S3, que no
  existe aún.

## Antes de poner datos reales (condiciones)

1. **Guarda de drivers en producción (R0-1, hilo "Arranque seguro y flags").**
   Hoy, sin `AUTH_IDENTITY_DRIVER`/`PAYMENT_DRIVER`, la API arranca con los
   adaptadores `fake` (AF-001: suplantación por Google falso). No se abre a
   usuarios reales hasta que esa guarda esté en la rama desplegada.
2. **Redis con contraseña (BLD-003, R1-7, mismo hilo).** La API descarta las
   credenciales de `REDIS_URL`; mientras tanto Redis va sin contraseña pero
   aislado en la red interna. Cuando R1-7 llegue, añadir `--requirepass` y la
   contraseña en `REDIS_URL`.
3. **Correo real (R3-4)**: sin proveedor SMTP no llegan reset de contraseña ni
   invitaciones.
4. **Respaldo off-site** funcionando y primera prueba de restauración registrada.
5. **Pagos apagados** hasta la decisión del cliente: no se cargan credenciales de
   Mercado Pago de producción.

## DNS [fuera del VPS]

El dominio `adoptafacil.org` está registrado en Namecheap y hoy su DNS también.
El certificado comodín `*.adoptafacil.org` solo se puede emitir por desafío
DNS-01: Caddy crea un registro TXT temporal en la zona a través de la **API**
del proveedor DNS. Hay dos caminos y los dos están listos en el repo
(`PORTALS_TLS=cloudflare` o `PORTALS_TLS=namecheap`, cada uno con su módulo de
`github.com/caddy-dns`, fijados en `deploy/docker/web.Dockerfile` y validados en CI).
En ambos el dominio sigue registrado y renovándose en Namecheap.

|                      | A. Cloudflare (recomendada)                 | B. API DNS de Namecheap                                                                                                                                  |
| -------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Costo                | gratis (plan Free)                          | API sin costo, pero Namecheap solo la habilita si la cuenta tiene **≥ 50 USD de saldo**, **≥ 50 USD gastados en los últimos 2 años** o **≥ 20 dominios** |
| Requisitos           | cambiar los nameservers en Namecheap        | la IPv4 del VPS en la lista blanca de la API (solo IPv4)                                                                                                 |
| Credencial en el VPS | token limitado a editar el DNS de esta zona | clave de la API, que da acceso a **toda** la cuenta de Namecheap                                                                                         |
| Riesgo               | ninguno conocido                            | la API de Namecheap reescribe la lista completa de registros en cada cambio: no editar el DNS a mano mientras Caddy renueva                              |

Sin ninguna de las dos, el resto funciona igual con `PORTALS_TLS=off`: los
portales se ven en `https://adoptafacil.org/o/<slug>` y Caddy emite el
certificado del dominio principal y de `www` por HTTP-01.

**Registros (en cualquiera de las dos):**

| Tipo | Nombre          | Valor                                          |
| ---- | --------------- | ---------------------------------------------- |
| A    | `@`             | IPv4 del VPS                                   |
| A    | `www`           | IPv4 del VPS                                   |
| A    | `*`             | IPv4 del VPS                                   |
| AAAA | `@`, `www`, `*` | IPv6 del VPS (solo si Hostinger te asignó una) |

Si hoy usas correo con el dominio, conserva sus registros `MX` y `TXT` (SPF/DKIM).

### Opción A: Cloudflare (elegida por el dueño)

Los dos nameservers los asigna Cloudflare a cada cuenta al agregar la zona; no
se conocen antes. Se copian una sola vez en Namecheap (paso 2).

1. En Cloudflare: **Add a site** → `adoptafacil.org` → plan Free. Copia los
   registros existentes y crea los de la tabla, todos en **DNS only** (nube
   gris): Caddy termina el TLS; con el proxy naranja Cloudflare pondría su
   propio certificado delante.
2. En Namecheap: Domain List → `adoptafacil.org` → Manage → Nameservers →
   **Custom DNS** → los dos nameservers que muestra Cloudflare. Propaga en
   minutos u horas; Cloudflare avisa por correo cuando la zona queda activa.
3. Token para Caddy: Cloudflare → My Profile → API Tokens → Create Token →
   plantilla **Edit zone DNS** → Zone Resources: _Include · Specific zone ·
   adoptafacil.org_. Va directo a `CLOUDFLARE_API_TOKEN` en `deploy/.env` del VPS.
4. En `deploy/.env`: `PORTALS_TLS=cloudflare`.

### Opción B: API DNS de Namecheap (alternativa, no elegida)

1. Cumplir uno de los requisitos de la tabla (lo usual: cargar 50 USD de saldo,
   que quedan disponibles para renovaciones).
2. Namecheap → Profile → Tools → Business & Dev Tools → **Namecheap API
   Access** → ON. Anota el usuario de la API y la clave.
3. En la misma pantalla, **Whitelisted IPs** → la IPv4 pública del VPS.
4. Domain List → `adoptafacil.org` → Manage → Nameservers: **Namecheap
   BasicDNS**; en Advanced DNS crea los registros de la tabla.
5. En `deploy/.env`: `PORTALS_TLS=namecheap`, `NAMECHEAP_API_USER`,
   `NAMECHEAP_API_KEY` y `NAMECHEAP_CLIENT_IP` (la misma IPv4 de la lista blanca).

## Renovación del dominio

`adoptafacil.org` se compró por un año en Namecheap. Si vence, se caen la web,
los portales, los correos con enlaces y la renovación de certificados.

- En Namecheap: Domain List → `adoptafacil.org` → **Auto-Renew ON**, con un
  medio de pago vigente o saldo suficiente en la cuenta.
- `deploy/scripts/monitor.sh` consulta una vez al día la fecha de vencimiento
  pública (RDAP) y alerta por ntfy cuando faltan menos de 30 días
  (`MONITOR_DOMAIN_MIN_DAYS`).
- Recordatorio manual: anota en el calendario del dueño la fecha que muestra
  Namecheap (Domain List → Expiration) y otro aviso 30 días antes.

## Primer despliegue [VPS]

```bash
# 1. Crear el VPS en hPanel: KVM 2, Ubuntu 24.04 LTS, tu clave SSH.
#    hPanel → VPS → Firewall: permitir solo 22/tcp, 80/tcp, 443/tcp y 443/udp.
#    (El firewall de Hostinger filtra antes de llegar al VPS, así que también
#    cubre lo que Docker publique saltándose ufw.)

# 2. Entrar y preparar el sistema
ssh root@IP_DEL_VPS
adduser deploy && usermod -aG sudo deploy && rsync -a ~/.ssh /home/deploy/ && chown -R deploy: /home/deploy/.ssh
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config && systemctl restart ssh
apt update && apt -y upgrade && apt install -y ca-certificates curl git age rclone ufw unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades          # parches de seguridad automáticos
timedatectl set-timezone UTC                          # UTC en el servidor; la UI muestra hora Colombia
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile \
  && echo '/swapfile none swap sw 0 0' >> /etc/fstab   # margen para construir imágenes
curl -fsSL https://get.docker.com | sh                # Docker Engine + plugin compose
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443 && ufw --force enable
exit                                                  # en adelante, como deploy
ssh deploy@IP_DEL_VPS

# 3. DNS listo (sección DNS, opción A): `dig +short adoptafacil.org` y
#    `dig +short prueba.adoptafacil.org` deben devolver la IP del VPS.

# 4. Código (la rama o tag que se aprobó para producción)
sudo git clone https://github.com/AGamez10/AdoptaFacil /opt/adoptafacil
cd /opt/adoptafacil && sudo git checkout <rama o tag a desplegar>

# 5. Configuración: secretos escritos aquí, en el servidor, y en ningún otro lado
sudo cp deploy/.env.example deploy/.env && sudo chmod 600 deploy/.env
sudo nano deploy/.env
#   APP_DOMAIN=adoptafacil.org              ACME_EMAIL=<correo para avisos de Let's Encrypt>
#   POSTGRES_PASSWORD, APP_DB_PASSWORD, JWT_SECRET  ->  openssl rand -hex 24
#   SIGNATURE_ENCRYPTION_KEY                        ->  openssl rand -hex 32
#   PORTALS_TLS=cloudflare   CLOUDFLARE_API_TOKEN=<token del paso 3 de la opción A>
#   VITE_PORTAL_BASE_DOMAIN=adoptafacil.org
#   BACKUP_AGE_RECIPIENT=<age1… clave PÚBLICA>  BACKUP_RCLONE_REMOTE=b2:adoptafacil-backups
#   ALERT_WEBHOOK_URL=https://ntfy.sh/<tema>    BACKUP_HEALTHCHECK_URL=<URL de healthchecks.io>
sudo cp deploy/api.env.example deploy/api.env && sudo chmod 600 deploy/api.env
sudo nano deploy/api.env                    # solo lo que se use (SMTP…); nada de pagos todavía

# 6. Arranque: construye, migra, verifica RLS, levanta API y Caddy
export RELEASE=$(git rev-parse --short HEAD)
sudo -E docker compose -f deploy/compose.yaml --env-file deploy/.env up -d --build --wait
#    El primer certificado comodín tarda 1–2 min (propagación del TXT):
sudo docker compose -f deploy/compose.yaml --env-file deploy/.env logs -f caddy | grep -i 'certificate obtained'

# 7. Off-site y respaldos (detalle en docs/operacion/BACKUPS.md)
sudo rclone config                          # remoto "b2" con la keyID/applicationKey limitada al bucket
sudo deploy/scripts/backup.sh && sudo deploy/scripts/restore-test.sh

# 8. Tareas programadas (sección siguiente) y monitor externo en UptimeRobot.

# 9. PlatformAdmin inicial: contraseña fuerte, nunca la de por defecto (AF-037)
#    (procedimiento del hilo "RBAC y organizaciones", R1-5).
```

### Verificación posterior [VPS]

| Comprobación                    | Comando                                                                                                                                                   | Esperado                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| API sana tras HTTPS             | `curl -fsS https://adoptafacil.org/api/health`                                                                                                            | `{"status":"ok","db":"up","redis":"up"}`      |
| Portal por subdominio           | `curl -fsS https://prueba.adoptafacil.org/api/health`                                                                                                     | el mismo `ok`                                 |
| `www` redirige                  | `curl -sI https://www.adoptafacil.org/ \| head -1`                                                                                                        | `301`, `location: https://adoptafacil.org/`   |
| Certificados reales             | `echo \| openssl s_client -connect adoptafacil.org:443 -servername prueba.adoptafacil.org 2>/dev/null \| openssl x509 -noout -issuer -ext subjectAltName` | emisor Let's Encrypt, `DNS:*.adoptafacil.org` |
| Postura RLS                     | `docker compose ... logs migrate \| tail -3`                                                                                                              | `postura RLS verificada`                      |
| Solo Caddy publica puertos      | `docker compose ... ps --format '{{.Service}} {{.Publishers}}'`                                                                                           | solo `caddy` con `0.0.0.0`                    |
| Postgres no alcanzable de fuera | `nc -zv IP_DEL_VPS 5432` desde otra máquina                                                                                                               | rechazado                                     |
| Cabeceras                       | `curl -sI https://adoptafacil.org/ \| grep -iE 'strict-transport\|nosniff\|frame'`                                                                        | las tres presentes                            |
| Respaldo + restauración         | `deploy/scripts/backup.sh && deploy/scripts/restore-test.sh`                                                                                              | `Restauración OK … N tablas, N migraciones`   |
| Copia off-site                  | `rclone ls b2:adoptafacil-backups \| tail -3`                                                                                                             | los `.age` del día                            |
| Vencimiento del dominio         | `cat /var/tmp/adoptafacil-monitor.state.domain-expiry` tras el primer `monitor.sh`                                                                        | la fecha de Namecheap                         |
| Alerta de prueba                | `docker compose ... stop redis; deploy/scripts/monitor.sh; docker compose ... start redis; deploy/scripts/monitor.sh`                                     | llega 1 alerta a ntfy y luego "Recuperado"    |

## Tareas programadas [VPS]

`sudo crontab -e` (horas en UTC; Colombia = UTC−5):

```cron
# Respaldo diario 03:00 COT
0 8 * * *  /opt/adoptafacil/deploy/scripts/backup.sh        >> /var/log/adoptafacil-backup.log 2>&1
# Prueba de restauración semanal, domingo 04:00 COT
0 9 * * 0  /opt/adoptafacil/deploy/scripts/restore-test.sh  >> /var/log/adoptafacil-restore.log 2>&1
# Vigilancia cada 5 minutos
*/5 * * * * /opt/adoptafacil/deploy/scripts/monitor.sh      >> /var/log/adoptafacil-monitor.log 2>&1
```

Más `logrotate` para esos tres archivos (`/etc/logrotate.d/adoptafacil`,
`weekly`, `rotate 8`, `compress`). Los logs de contenedores ya rotan (10 MB × 5
por servicio, `x-logging` en el compose). Los respaldos semanales de Hostinger
(incluidos en el plan) son una red adicional de la máquina entera, no
reemplazan los diarios cifrados.

## Actualizar

```bash
cd /opt/adoptafacil
sudo deploy/scripts/backup.sh                  # siempre antes de migrar
sudo git fetch && sudo git checkout <nuevo tag o commit>
export RELEASE=$(git rev-parse --short HEAD)
sudo -E docker compose -f deploy/compose.yaml --env-file deploy/.env up -d --build --wait
```

Las imágenes quedan etiquetadas con `RELEASE`; la anterior sigue en el disco.
Cambiar una `VITE_*` o `PORTALS_TLS` exige ese mismo `--build` (se hornean en la
imagen de Caddy).

## Volver atrás (rollback)

- **Sin migración nueva de por medio:** `export RELEASE=<sha anterior>` y
  `docker compose ... up -d --no-build --wait` (usa las imágenes ya construidas).
- **Con migración nueva:** las migraciones de Prisma solo avanzan. Volver la
  imagen sin volver la base puede romper. Procedimiento: detener `api` y
  `caddy`, restaurar el respaldo tomado justo antes de actualizar
  (`docs/operacion/BACKUPS.md` §Restaurar en producción) y levantar el
  `RELEASE` anterior. Toda migración de seguridad trae su rollback SQL escrito
  (regla §7.7).

## Apuntamiento de URL (lista de verificación)

Todo lo que cambia cuando AdoptaFácil apunta a un dominio. Caddy quita el
prefijo `/api` antes de pasar la petición a la API, por eso **toda URL externa
hacia la API lleva `/api`**. Ninguna línea de esta lista es un secreto.

Leyenda: ✅ lo resuelve `deploy/` a partir de `APP_DOMAIN`; ⚠️ queda en
`deploy/.env` o `deploy/api.env` del VPS y hay que llenarlo; ❌ se hace fuera del
repo (paneles de terceros).

### Frontend (se hornean en el build: cambiar una exige `up -d --build`)

| Variable                      | Estado | Valor en este despliegue                                                                                     | Si falta                                                                                                        |
| ----------------------------- | ------ | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `VITE_API_URL`                | ✅     | `/api`, relativa (`deploy/compose.yaml:127`); el build falla si llega vacía (`deploy/docker/web.Dockerfile`) | el front llama a `http://localhost:3000` (p. ej. `apps/web/src/features/donations/api/donations-api.ts:12`)     |
| `VITE_PORTAL_BASE_DOMAIN`     | ⚠️     | `adoptafacil.org`                                                                                            | sin subdominios; los portales funcionan por `/o/:slug` (`apps/web/src/features/portals/model/subdomain.ts:22`)  |
| `VITE_GOOGLE_CLIENT_ID`       | ⚠️     | ID del cliente OAuth web de Google                                                                           | el botón muestra el modo de prueba (`apps/web/src/features/auth/components/google-sign-in-button.tsx:70`)       |
| `VITE_MERCADOPAGO_PUBLIC_KEY` | ⚠️     | llave pública de producción, solo al encender pagos                                                          | el Brick no se monta y muestra un aviso (`apps/web/src/features/payments/components/card-payment-brick.tsx:69`) |

### Backend

| Variable                         | Estado           | Valor en este despliegue                                                                                                           | Para qué                                                                                                                 |
| -------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `API_CORS_ORIGIN`                | ✅               | `https://adoptafacil.org` (`deploy/compose.yaml:94`)                                                                               | con `/api` relativa cada host llama a su propio origen, así que los portales no necesitan entrar en esta lista           |
| `WEB_BASE_URL`                   | ✅               | `https://adoptafacil.org` (`deploy/compose.yaml:95`)                                                                               | enlaces de los correos (restablecer contraseña, adopciones, donaciones) y retorno al front tras el OAuth de Mercado Pago |
| `STORAGE_PUBLIC_BASE_URL`        | ✅               | `https://adoptafacil.org/api` (`deploy/compose.yaml:99`)                                                                           | URL pública de archivos y base por defecto del retorno OAuth de Mercado Pago                                             |
| `MERCADOPAGO_OAUTH_REDIRECT_URI` | ✅ (por defecto) | sin definir → `https://adoptafacil.org/api/org/mercadopago/callback` (`apps/api/src/core/payments/mercadopago-oauth.client.ts:58`) | solo se fija en `deploy/api.env` si se quiere otra                                                                       |
| `MERCADOPAGO_BASE_URL`           | ✅ (por defecto) | `https://api.mercadopago.com` (`apps/api/src/config/env.validation.ts:70`)                                                         | no se toca salvo un sandbox                                                                                              |

### Externo (paneles de terceros y DNS)

| Dónde                                | Estado | Qué registrar                                                                                                                                                                                   |
| ------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DNS                                  | ❌     | `A @`, `A www`, `A *` → IP del VPS (§DNS)                                                                                                                                                       |
| TLS                                  | ✅     | Caddy emite `adoptafacil.org` y `www` por HTTP-01 y `*.adoptafacil.org` por DNS-01 con `PORTALS_TLS=cloudflare` o `namecheap`; renueva solo                                                     |
| Google Cloud, cliente OAuth web      | ❌     | orígenes JavaScript autorizados: `https://adoptafacil.org`. Google no acepta comodines: el inicio de sesión con Google se hace en el dominio principal                                          |
| Mercado Pago, webhook (evento Order) | ❌     | `https://adoptafacil.org/api/donations/webhook` (`apps/api/src/modules/donations/donations.controller.ts:136`). Pagos apagados: solo documentado                                                |
| Mercado Pago, redirect OAuth         | ❌     | `https://adoptafacil.org/api/org/mercadopago/callback`, idéntica a la que envía la API (`apps/api/src/modules/payments/mercadopago-connect.controller.ts:65`). Pagos apagados: solo documentado |
| Mercado Pago, webhook de payouts     | ❌     | `https://adoptafacil.org/api/payments/payouts/webhook` (`apps/api/src/modules/payments/payouts.controller.ts:58`), cuando se apruebe Disbursements                                              |

### Código revisado

- **Cookie de sesión** (`apps/api/src/core/auth/refresh-cookie.util.ts:18`): en
  producción es `Secure` + `SameSite=None` con `path: '/'`, así que exige HTTPS
  (Caddy lo garantiza) y funciona detrás del prefijo `/api`. El CORS ya va con
  `credentials: true` (`apps/api/src/main.ts:17`), aunque con este despliegue
  el front y la API comparten origen y no hace falta. La cookie queda por host:
  una sesión abierta en `adoptafacil.org` no viaja a `<org>.adoptafacil.org`, lo
  cual basta porque los portales son públicos.
- **`apps/web/vite.config.ts`**: el proxy `/api` → `localhost:3000` y
  `allowedHosts: true` son de la demo con ngrok y su comentario pide revertirlos.
  Solo afectan a `vite dev`; el build de producción no los usa. Revertirlos le
  toca al dueño del front.
- **"adoptafacil.org/"** en `apps/web/src/features/org/pages/platform-banner-page.tsx:221`
  es texto de ayuda, no un enlace: no cambia con el dominio.

## Portales por subdominio (F7)

`PORTALS_TLS` en `deploy/.env` elige el comportamiento, en el build de Caddy y
en su configuración a la vez:

| Valor        | Caddy                                                    | Uso                                    |
| ------------ | -------------------------------------------------------- | -------------------------------------- |
| `off`        | imagen oficial, sin bloque comodín                       | por defecto; portales en `/o/<slug>`   |
| `cloudflare` | compilado con `caddy-dns/cloudflare`, comodín por DNS-01 | **producción**, opción A de §DNS       |
| `namecheap`  | compilado con `caddy-dns/namecheap`, comodín por DNS-01  | **producción**, opción B de §DNS       |
| `internal`   | imagen oficial, comodín con la CA interna                | CI y pruebas locales, nunca producción |

El bloque comodín (`deploy/portals-cloudflare.caddy` o `portals-namecheap.caddy`) sirve exactamente lo
mismo que el dominio principal: SPA y `/api`. El SPA detecta el subdominio con
`VITE_PORTAL_BASE_DOMAIN` (`apps/web/src/features/portals/model/subdomain.ts`)
y pregunta a `/api/public/organizations/by-subdomain/<sub>` qué organización
mostrar. Las etiquetas `www`, `app`, `api`, `admin` y `staging` están reservadas.
No se habilita on-demand TLS sin un endpoint `ask` que solo autorice dominios
verificados: con el certificado comodín no hace falta.

## Staging

Mismo compose con otro nombre de proyecto y dominio, idealmente en otro VPS
pequeño (dos Caddy no pueden compartir 80/443 en una máquina):
`docker compose -p adoptafacil-staging -f deploy/compose.yaml --env-file deploy/staging.env up -d --build`.
Un subdominio como `staging.adoptafacil.org` sirve si ese VPS tiene su propio
registro `A staging`. Nunca con datos reales copiados de producción sin
anonimizar (Ley 1581).

## Evidencia de este PR (entorno cloud, no el VPS)

- `docker compose up --wait` de las cinco piezas en un Linux con Docker 29:
  migraciones (62), rotación del rol y postura RLS OK; `GET https://localhost/api/health`
  → `{"status":"ok","db":"up","redis":"up"}` a través de Caddy; SPA con
  fallback a `index.html`; HTTP → HTTPS (308); HSTS, `nosniff`, `X-Frame-Options`.
- Portales con `PORTALS_TLS=internal`: certificado `DNS:*.localhost`;
  `https://demo.localhost/api/health` ok; `www.localhost` → 301 al dominio
  principal. En Chromium, `https://patitas.localhost/` mostró el portal de la
  organización con todas sus llamadas a `patitas.localhost/api/...` (by-subdomain,
  perfil, tema, silent refresh) y `https://localhost/o/patitas` el mismo portal,
  sin errores de consola.
- Solo Caddy publica puertos; `data` es interna; la API corre como `node`.
- Memoria en reposo: API ~111 MB, Postgres ~25 MB, Caddy ~13 MB, Redis ~5 MB.
- Datos persistentes tras `down` / `up`.
- El mismo arranque corre en CI (job `docker` de `ci.yml`) con las imágenes
  reales (`node:20-bookworm-slim` + openssl), con portales en modo `internal`, y
  además compila Caddy con `caddy-dns/cloudflare` y con `caddy-dns/namecheap`
  y valida el Caddyfile de producción de cada uno. En el entorno cloud los repositorios de Debian están bloqueados,
  así que la verificación local usó `node:20-bookworm` con `--build-arg APT_PACKAGES=`.
- No verificable aquí: la emisión real del comodín (Cloudflare o Namecheap), el firewall
  de Hostinger y los paneles externos. Quedan en §Verificación posterior.
