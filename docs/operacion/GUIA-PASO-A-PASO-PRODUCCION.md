# Guía paso a paso: dejar producción lista para el tráfico

> Versión 2026-11-15. Para el dueño, sin conocimientos de servidores. Cada punto
> empieza con **"¿Ya lo tengo?"**: si la comprobación sale bien, salta al
> siguiente y no rehagas nada. Detalle técnico en
> [SALIDA-A-PRODUCCION.md](./SALIDA-A-PRODUCCION.md), [CORREO.md](./CORREO.md),
> [BACKUPS.md](./BACKUPS.md) y [MONITOREO.md](./MONITOREO.md).
>
> Dominio usado en los ejemplos: `adoptafacil.org`. Si el tuyo es otro, cámbialo
> en cada comando. Ninguna clave se pega en el chat, en capturas ni en el repo:
> solo en tu gestor de contraseñas y en `deploy/.env` o `deploy/api.env` del servidor.

## Orden recomendado para hoy

1. **Empieza por Amazon SES (punto 2, pasos A a I).** La aprobación de AWS tarda
   alrededor de un día; mientras esperas, haz lo demás.
2. Dominio y Cloudflare (punto 1).
3. Servidor (punto 3).
4. Respaldos (punto 4).
5. Fotos en R2 (punto 5).
6. Alertas (punto 6).
7. Prueba de carga (punto 7), al final y en una hora tranquila.
8. Cuando AWS apruebe: pasos J a L del punto 2.

---

## 0. Lo básico: entrar al servidor y editar la configuración

Lo necesitarás en casi todos los puntos.

```bash
# Desde tu computador (PowerShell en Windows, Terminal en Mac)
ssh deploy@IP_DEL_VPS
cd /opt/adoptafacil        # si instalaste en otra carpeta, usa esa

# Atajo para no escribir el comando largo de Docker cada vez (vale hasta que cierres la sesión)
alias dc='sudo docker compose -f /opt/adoptafacil/deploy/compose.yaml --env-file /opt/adoptafacil/deploy/.env'
```

- **Editar un archivo:** `sudo nano deploy/api.env`. Muévete con las flechas,
  escribe o pega (clic derecho), guarda con `Ctrl+O` y luego `Enter`, y sal con `Ctrl+X`.
- **Aplicar cambios de `deploy/api.env`:** `dc up -d --wait api worker`
- **Ver que todo está bien:** `curl -fsS https://adoptafacil.org/api/health` debe
  responder `{"status":"ok","db":"up","redis":"up"}`.
- Una línea `CLAVE=` vacía impide que la API arranque. Si no usas una variable,
  borra la línea completa.

---

## 1. Dominio, DNS y certificados (Cloudflare)

**Costo:** Cloudflare Free, US$0. El dominio sigue renovándose en Namecheap.

### ¿Ya lo tengo?

En tu computador:

```bash
nslookup adoptafacil.org                       # debe salir la IP del VPS
curl -fsS https://adoptafacil.org/api/health   # debe decir "status":"ok"
```

Y en [dash.cloudflare.com](https://dash.cloudflare.com), la zona `adoptafacil.org`
debe decir **Active**. Si las tres cosas se cumplen y en el servidor
`sudo grep -E '^(APP_DOMAIN|PORTALS_TLS|CLOUDFLARE_API_TOKEN)=' deploy/.env`
muestra las tres con valor, **este punto está hecho**.

### Si falta algo

1. **Agregar el dominio a Cloudflare:** Cloudflare → **Add a domain** →
   `adoptafacil.org` → plan **Free** → Continue. Cloudflare copia los registros
   que ya existen; revisa que estén todos (sobre todo los de correo: MX y TXT).
2. **Registros del servidor**, en DNS → Records → **Add record**, con
   **Proxy status en gris ("DNS only")**:

   | Tipo | Nombre | Valor      |
   | ---- | ------ | ---------- |
   | A    | `@`    | IP del VPS |
   | A    | `www`  | IP del VPS |
   | A    | `*`    | IP del VPS |

   La nube debe quedar **gris**. Si queda naranja, Cloudflare pone su propio
   certificado delante y Caddy no puede emitir el suyo.

3. **Cambiar los nameservers en Namecheap:** Domain List → `adoptafacil.org` →
   **Manage** → Nameservers → **Custom DNS** → pega los dos que te muestra
   Cloudflare → ✓. Tarda de minutos a unas horas; Cloudflare te avisa por correo.
4. **Token para los certificados:** Cloudflare → arriba a la derecha tu perfil →
   **My Profile** → **API Tokens** → **Create Token** → plantilla **Edit zone DNS**
   → Use template → en _Zone Resources_ elige _Include · Specific zone ·
   adoptafacil.org_ → Continue to summary → Create Token. Cópialo **una sola vez**
   a tu gestor de contraseñas.
5. **En el servidor:** `sudo nano deploy/.env` y deja:

   ```dotenv
   APP_DOMAIN=adoptafacil.org
   ACME_EMAIL=tu-correo@ejemplo.com
   PORTALS_TLS=cloudflare
   CLOUDFLARE_API_TOKEN=<el token del paso 4>
   VITE_PORTAL_BASE_DOMAIN=adoptafacil.org
   ```

   Aplica con `dc up -d --wait caddy`. El primer certificado tarda 1 a 2 minutos.

### Verificar

```bash
curl -fsS https://adoptafacil.org/api/health          # "status":"ok"
curl -sI https://www.adoptafacil.org/ | head -3        # 301 hacia https://adoptafacil.org/
curl -fsS https://prueba.adoptafacil.org/api/health    # también "ok" (portales por subdominio)
```

---

## 2. Correo con Amazon SES

**Costo:** unos US$0,10 por cada 1.000 correos (confírmalo en la
[página de precios de SES](https://aws.amazon.com/ses/pricing/)).
**Variables:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`,
`EMAIL_QUEUE_RATE_MAX` y `EMAIL_QUEUE_RATE_DURATION_MS`, todas en `deploy/api.env`.

> **No cambies el correo del servidor hasta que AWS apruebe la salida del
> sandbox (paso I).** En sandbox, SES solo entrega a direcciones verificadas
> una por una, así que los usuarios reales no recibirían nada.

### ¿Ya lo tengo?

En la consola de SES, en la región **US East (Ohio)**: _Identities_ muestra
`adoptafacil.org` como **Verified**, y _Account dashboard_ **no** dice "Your
account is in the sandbox". Si además `sudo grep SMTP_HOST deploy/api.env`
muestra `email-smtp.us-east-2.amazonaws.com`, este punto está hecho.

### A. Cuenta de AWS

1. Crea la cuenta en [aws.amazon.com](https://aws.amazon.com) (pide tarjeta).
2. Activa la verificación en dos pasos del usuario raíz: arriba a la derecha tu
   nombre → **Security credentials** → **Assign MFA device**.
3. Arriba a la derecha elige la región **US East (Ohio) us-east-2** y
   déjala fija para todo este punto. Busca "SES" en la barra de arriba y entra
   a **Amazon Simple Email Service**.

### B. Verificar el dominio

1. SES → **Configuration → Identities → Create identity**.
2. Identity type: **Domain**. Domain: `adoptafacil.org`.
3. Marca **Use a custom MAIL FROM domain**. MAIL FROM domain: `bounce`
   (queda `bounce.adoptafacil.org`). Behavior on MX failure: **Use default MAIL FROM domain**.
4. En **Advanced DKIM settings**: Easy DKIM, **RSA_2048_BIT**, DKIM signatures
   **Enabled**.
5. **Create identity.**

### C. Copiar los registros a Cloudflare

SES te muestra una tabla _Publish DNS records_ con:

- 3 registros **CNAME** de DKIM (nombre `xxxx._domainkey.adoptafacil.org`,
  valor `xxxx.dkim.amazonses.com`).
- 1 registro **MX** y 1 **TXT** para `bounce.adoptafacil.org`.

En Cloudflare → DNS → Records → **Add record**, crea cada uno **tal cual**:

- Pega el nombre completo; Cloudflare quita solo el `.adoptafacil.org` del final.
- En los CNAME, pon **Proxy status en gris (DNS only)**. Si quedan naranjas, la verificación falla.
- El MX lleva prioridad **10** y el valor `feedback-smtp.us-east-2.amazonses.com`.
- El TXT de `bounce` es `v=spf1 include:amazonses.com ~all`.

**No toques el SPF del dominio raíz (`@`)**: con el MAIL FROM `bounce` no hace falta.

### D. DMARC

Busca en Cloudflare si ya existe un TXT con nombre `_dmarc`. Debe haber **uno solo**.

- Si no existe, crea: Tipo **TXT**, Nombre `_dmarc`, Contenido
  `v=DMARC1; p=none; adkim=r; aspf=r`.
- Si quieres recibir los reportes, agrega `rua=mailto:dmarc@adoptafacil.org;`
  solo si ese buzón existe (por ejemplo, con Cloudflare → Email → Email Routing,
  que reenvía a tu Gmail gratis).
- En 2 a 4 semanas, si todo pasa, cámbialo a `p=quarantine`.

### E. Esperar la verificación

En SES → Identities → `adoptafacil.org` deben quedar en verde:
**Identity status: Verified**, **DKIM: Successful** y **Custom MAIL FROM:
Successful**. Suele tardar minutos; AWS da hasta 72 horas.

### F. Primera prueba (todavía en sandbox)

1. Identities → **Create identity** → **Email address** → tu Gmail → Create.
   Abre el correo de AWS y haz clic en el enlace.
2. Vuelve a la identidad `adoptafacil.org` → botón **Send test email** →
   From: `no-reply` · Scenario: **Custom** → To: tu Gmail → Send.
3. En Gmail abre el correo → los tres puntos → **Mostrar original**. Debe decir
   **SPF: PASS**, **DKIM: PASS** y **DMARC: PASS**.

### G. Lista de supresión (rebotes y quejas)

La plataforma todavía no procesa rebotes por su cuenta, así que esto es
obligatorio: hace que SES deje de enviar solo a direcciones que rebotan o que
marcaron spam.

SES → **Configuration → Suppression list** → _Account-level suppression
settings_ → **Edit** → **Enabled**, marca **Bounce** y **Complaint** → Save.
Verifica que la pantalla diga "Suppression reasons: Bounce, Complaint".

### H. Credenciales SMTP

1. SES → **SMTP settings**. Anota el _SMTP endpoint_: `email-smtp.us-east-2.amazonaws.com`.
2. **Create SMTP credentials** → deja el nombre que propone → **Create user**.
3. Te muestra **SMTP user name** y **SMTP password** **una sola vez**: descarga
   el .csv o cópialos a tu gestor de contraseñas. No son la clave de tu cuenta
   de AWS, y no se pueden volver a ver.

### I. Pedir la salida del sandbox

SES → **Account dashboard** → **Request production access** (puede aparecer
como _View Get set up page_ → _Request production access_). Llena:

- **Mail type:** Transactional.
- **Website URL:** `https://adoptafacil.org`
- **Use case description:** pega este texto (en inglés, porque lo revisa el
  equipo de AWS). Ajusta el volumen si esperas otro:

  ```text
  AdoptaFácil (https://adoptafacil.org) is a platform for animal shelters in
  Colombia. We send only transactional email triggered by a user's own action
  or account: email verification, password resets, adoption request updates,
  donation receipts and monthly sponsorship reminders. Recipients are people
  who registered on the platform themselves; we never buy, rent or import
  mailing lists and we send no marketing campaigns.
  Expected volume at launch: up to 1,000 emails per day.
  Bounces and complaints: the SES account-level suppression list is enabled
  for both bounces and complaints, so we never retry a suppressed address.
  Our sending domain is verified with DKIM, a custom MAIL FROM domain (SPF)
  and DMARC. We review the SES reputation dashboard and will keep bounce and
  complaint rates well below AWS thresholds.
  ```

- Marca la casilla de aceptación → **Submit request**.

La respuesta llega por correo, normalmente en unas 24 horas. Si AWS pide más
detalles, contesta en el mismo caso de soporte (_Support → Your support cases_).

### J. Cuando AWS apruebe: configurar el servidor

1. En SES → Account dashboard anota **Maximum send rate** (correos por segundo).
2. En el servidor, `sudo nano deploy/api.env`. Reemplaza las líneas de `SMTP_*`
   que tengas (por ejemplo, las de Brevo) por estas:

   ```dotenv
   NOTIFICATION_DRIVER=smtp
   SMTP_HOST=email-smtp.us-east-2.amazonaws.com
   SMTP_PORT=587
   SMTP_USER=<SMTP user name del paso H>
   SMTP_PASS=<SMTP password del paso H>
   SMTP_FROM="AdoptaFácil" <no-reply@adoptafacil.org>
   EMAIL_QUEUE_RATE_MAX=<Maximum send rate menos 1, por ejemplo 13 si dice 14>
   EMAIL_QUEUE_RATE_DURATION_MS=1000
   ```

3. Aplica: `dc up -d --wait api worker`.

### K. Verificar

1. En la web, **Olvidé mi contraseña** con tu correo.
2. En el servidor:
   `dc logs worker --since 10m | grep NotificationPort` debe mostrar `result=ok`.
3. En Gmail, "Mostrar original": SPF, DKIM y DMARC en **PASS**.
4. En SES → Account dashboard, el envío aparece en _Sending statistics_.

### L. Vigilar la primera semana

SES → Account dashboard → **Reputation metrics**. Mantén la tasa de rebotes por
debajo de 2 % y la de quejas por debajo de 0,1 %. Si alguna sube, avísame antes
de que AWS pause la cuenta.

---

## 3. Servidor (Hostinger KVM 4)

**Costo:** unos US$12,99 al mes con contrato de 24 meses, renueva a US$28,99
(confírmalo al pagar). **Variables:** ninguna.

### ¿Ya lo tengo?

En el servidor:

```bash
nproc          # 4 o más
free -h        # "Mem: total" de unos 15 GB o más
df -h /        # "Use%" por debajo de 70 %
```

Si da eso, **ya tienes un KVM 4 o superior**: salta al punto 4.

### Si tienes un plan menor (KVM 1 o KVM 2)

1. **Haz un respaldo antes** (punto 4, "Verificar"), o como mínimo la instantánea
   de Hostinger: hPanel → VPS → tu servidor → **Snapshots & Backups** → Create snapshot.
2. hPanel → **VPS** → tu servidor → **Upgrade** (o _Plan details → Upgrade_) →
   elige **KVM 4** → paga. Hostinger cambia el plan sin reinstalar; el servidor
   se reinicia y queda unos minutos sin servicio. Hazlo en una hora tranquila.
3. Cuando vuelva, entra por `ssh` y revisa:

   ```bash
   nproc && free -h
   dc ps                                        # todos "running" o "healthy"
   curl -fsS https://adoptafacil.org/api/health
   ```

4. Si algún servicio no volvió solo:

   ```bash
   export RELEASE=$(git -C /opt/adoptafacil rev-parse --short HEAD)
   sudo -E docker compose -f deploy/compose.yaml --env-file deploy/.env up -d --no-build --wait
   ```

### Firewall (una sola vez)

hPanel → VPS → tu servidor → **Security → Firewall**: deja abiertos solo
**22/tcp, 80/tcp, 443/tcp y 443/udp**. Verifica desde tu computador que la base
no se ve desde fuera: `nc -zv IP_DEL_VPS 5432` debe decir _refused_ o _timed out_.

---

## 4. Base de datos con respaldos y prueba de restauración

La base corre en el mismo servidor. Cada día se hace una copia cifrada que se
guarda fuera, en Backblaze B2. **Costo:** B2 regala los primeros 10 GB; después,
unos US$6,95 por TB al mes. **Variables:** `BACKUP_AGE_RECIPIENT`,
`BACKUP_RCLONE_REMOTE`, `BACKUP_HEALTHCHECK_URL` y `BACKUP_AGE_IDENTITY_FILE`,
todas en `deploy/.env`.

### ¿Ya lo tengo?

```bash
sudo grep -E '^(BACKUP_AGE_RECIPIENT|BACKUP_RCLONE_REMOTE)=' deploy/.env   # las dos con valor
sudo rclone ls b2:adoptafacil-backups | tail -3                           # archivos .age recientes
sudo crontab -l | grep -E 'backup|restore'                                # dos líneas
```

Si las tres salen bien, salta a "Verificar" para hacer la prueba de restauración.

### A. La llave de los respaldos (en tu computador, no en el servidor)

1. Instala `age`. En Windows: `winget install FiloSottile.age`. En Mac: `brew install age`.
2. `age-keygen -o adoptafacil-backup.key`
3. Copia la línea que dice `public key: age1...`: es la **clave pública**.
4. Guarda el archivo `adoptafacil-backup.key` en tu gestor de contraseñas y en
   una USB. **Si lo pierdes, ningún respaldo se puede abrir.**

### B. Bucket en Backblaze B2

1. Crea la cuenta en [backblaze.com](https://www.backblaze.com/sign-up/cloud-storage).
2. **B2 Cloud Storage → Buckets → Create a Bucket**. Nombre `adoptafacil-backups`
   (si está ocupado, agrégale algo al final y usa ese nombre en adelante).
   Files: **Private**. Default Encryption: **Enable**. Create.
3. **Application Keys → Add a New Application Key**. Nombre `vps-respaldos`,
   _Allow access to Bucket(s)_: solo `adoptafacil-backups`, _Type of Access_:
   **Read and Write** → Create. Copia **keyID** y **applicationKey** (la segunda
   se muestra una sola vez).

### C. Conectar el servidor con B2

```bash
sudo rclone config
```

Responde así: `n` (nuevo) → nombre `b2` → en _Storage_ escribe `b2` → _account_:
el **keyID** → _key_: la **applicationKey** → _hard_delete_: Enter (no) →
_Edit advanced config_: `n` → `y` para confirmar → `q` para salir.

Comprueba: `sudo rclone lsd b2:` debe mostrar `adoptafacil-backups`.

### D. Variables y llave privada en el servidor

1. Copia la llave privada al servidor (desde tu computador):
   `scp adoptafacil-backup.key deploy@IP_DEL_VPS:/tmp/`
2. En el servidor:

   ```bash
   sudo mv /tmp/adoptafacil-backup.key /root/adoptafacil-backup.key
   sudo chown root:root /root/adoptafacil-backup.key && sudo chmod 400 /root/adoptafacil-backup.key
   ```

   Sirve para la prueba de restauración semanal. Quien controla el servidor ya ve
   la base; el cifrado protege las copias que salen de él.

3. `sudo nano deploy/.env` y deja:

   ```dotenv
   BACKUP_AGE_RECIPIENT=age1...                  # la clave PÚBLICA del paso A
   BACKUP_RCLONE_REMOTE=b2:adoptafacil-backups
   BACKUP_AGE_IDENTITY_FILE=/root/adoptafacil-backup.key
   BACKUP_HEALTHCHECK_URL=<URL de healthchecks.io, punto 6>
   ```

   Si todavía no tienes la URL de healthchecks, borra esa línea y agrégala en el punto 6.

### E. Programar respaldo diario y prueba semanal

`sudo crontab -e` (si pregunta el editor, elige `1`, nano) y pega al final:

```cron
# Respaldo diario 03:00 hora Colombia
0 8 * * *  /opt/adoptafacil/deploy/scripts/backup.sh        >> /var/log/adoptafacil-backup.log 2>&1
# Prueba de restauración, domingos 04:00 hora Colombia
0 9 * * 0  /opt/adoptafacil/deploy/scripts/restore-test.sh  >> /var/log/adoptafacil-restore.log 2>&1
# Vigilancia cada 5 minutos (punto 6)
*/5 * * * * /opt/adoptafacil/deploy/scripts/monitor.sh      >> /var/log/adoptafacil-monitor.log 2>&1
```

Guarda con `Ctrl+O`, `Enter`, `Ctrl+X`.

### Verificar (obligatorio antes de abrir)

```bash
sudo deploy/scripts/backup.sh         # termina con "==> respaldo OK en ...s"
sudo rclone ls b2:adoptafacil-backups | tail -3     # los 3 archivos de hoy
sudo deploy/scripts/restore-test.sh   # termina con "Restauración OK ... N tablas, N migraciones"
```

Un respaldo que nunca se restauró no cuenta como respaldo: si
`restore-test.sh` falla, avísame antes de abrir.

---

## 5. Fotos y archivos en Cloudflare R2

**Costo:** gratis hasta 10 GB; después US$0,015 por GB al mes, sin cobro por
descargas. **Variables:** `STORAGE_DRIVER`, `S3_ENDPOINT`, `S3_REGION`,
`S3_BUCKET`, `S3_ACCESS_KEY_ID` y `S3_SECRET_ACCESS_KEY`, en `deploy/api.env`.

### ¿Ya lo tengo?

`sudo grep STORAGE_DRIVER deploy/api.env`

- Dice `STORAGE_DRIVER=s3`: **hecho**. Verifica subiendo una foto (abajo).
- Dice `disk` o no aparece, y **ya hay fotos reales subidas**: **no cambies
  nada todavía.** Las fotos actuales están en el disco del servidor y dejarían
  de verse. Sigue los pasos A y B, y luego el paso C para copiarlas antes del cambio.
- Dice `disk` o no aparece, y no hay fotos reales: pasos A, B y D.

### A. Bucket

Cloudflare → **R2 Object Storage** (la primera vez pide activar R2 con tarjeta;
el plan gratis no cobra) → **Create bucket** → nombre `adoptafacil-media` →
Location: Automatic → Create. **No** actives el acceso público: la API sirve
las fotos por sus propias rutas.

### B. Llave de acceso

R2 → **Manage API tokens** (o _API → Manage API tokens_) → **Create API token**
→ Permissions: **Object Read & Write** → _Specify bucket(s)_: solo
`adoptafacil-media` → Create. Copia **Access Key ID**, **Secret Access Key** y
el endpoint `https://<account-id>.r2.cloudflarestorage.com` (la secreta se
muestra una sola vez).

### C. Solo si ya hay fotos en el disco: copiarlas al bucket

```bash
sudo rclone config
# n → nombre r2 → Storage: s3 → provider: Cloudflare → env_auth: false
# → access_key_id y secret_access_key del paso B → region: auto
# → endpoint: https://<account-id>.r2.cloudflarestorage.com → Enter en lo demás → y → q

sudo rclone copy /var/lib/docker/volumes/adoptafacil_api_storage/_data r2:adoptafacil-media --progress
sudo rclone size /var/lib/docker/volumes/adoptafacil_api_storage/_data
sudo rclone size r2:adoptafacil-media         # mismo número de objetos que la línea anterior
```

Las rutas de los archivos son iguales en disco y en R2, por eso basta copiar.
Las fotos que se suban entre la copia y el cambio del paso D no quedarían en
R2: haz C y D seguidos, en una hora tranquila.

### D. Activar R2

`sudo nano deploy/api.env`:

```dotenv
STORAGE_DRIVER=s3
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=adoptafacil-media
S3_ACCESS_KEY_ID=<Access Key ID>
S3_SECRET_ACCESS_KEY=<Secret Access Key>
```

Aplica: `dc up -d --wait api worker`. Si falta una variable `S3_*`, la API no arranca y `dc ps` lo muestra.

### Verificar

1. Sube una foto de prueba en un animal desde el panel y comprueba que se ve.
2. En Cloudflare → R2 → `adoptafacil-media`, aparece un objeto nuevo.
3. Las fotos que ya existían se siguen viendo.
4. `curl -fsS https://adoptafacil.org/api/health` sigue en `ok`.

---

## 6. Alertas al teléfono

Las tres herramientas son gratis. **Variables:** `ALERT_WEBHOOK_URL` y
`BACKUP_HEALTHCHECK_URL`, en `deploy/.env`.

### ¿Ya lo tengo?

`sudo grep -E '^(ALERT_WEBHOOK_URL|BACKUP_HEALTHCHECK_URL)=' deploy/.env` muestra
las dos con valor, `sudo crontab -l | grep monitor` muestra una línea, y en
UptimeRobot tienes un monitor en verde. Si es así, haz solo "Verificar".

### A. ntfy (avisos del servidor al teléfono)

1. Instala la app **ntfy** (Android o iPhone).
2. Inventa un tema difícil de adivinar. En el servidor: `echo adoptafacil-$(openssl rand -hex 6)`.
3. En la app: **+** → Subscribe to topic → pega ese nombre → Subscribe.
4. `sudo nano deploy/.env` → `ALERT_WEBHOOK_URL=https://ntfy.sh/<tu-tema>`
5. Prueba: `curl -d "Prueba AdoptaFácil" https://ntfy.sh/<tu-tema>` debe sonar en el teléfono.

### B. healthchecks.io (avisa si el respaldo diario no corrió)

1. Crea la cuenta en [healthchecks.io](https://healthchecks.io).
2. **Add Check** → Name: `Respaldo diario` → Schedule: **Period 1 day**,
   **Grace 2 hours** → Save.
3. Copia la _ping URL_ (`https://hc-ping.com/...`).
4. `sudo nano deploy/.env` → `BACKUP_HEALTHCHECK_URL=<esa URL>`
5. En _Integrations_, agrega tu correo o la app ntfy para recibir el aviso.

### C. UptimeRobot (avisa si el sitio entero se cae)

1. Crea la cuenta en [uptimerobot.com](https://uptimerobot.com).
2. **New monitor** → Type: **Keyword** → URL: `https://adoptafacil.org/api/health`
   → Keyword: `"status":"ok"` → _Alert when_: **keyword does not exist** →
   Interval: **5 minutes** → elige tu correo (e instala la app si quieres push)
   → Create.

### D. Vigilancia interna cada 5 minutos

Es la tercera línea del cron del punto 4, paso E. Si no la pusiste, agrégala ahora.

### Verificar

```bash
dc stop redis && sudo deploy/scripts/monitor.sh   # debe llegar UNA alerta a ntfy
dc start redis && sleep 10 && sudo deploy/scripts/monitor.sh   # debe llegar "Recuperado"
```

El monitor de UptimeRobot debe quedar en verde, y el check de healthchecks
pasa a verde después del primer `backup.sh`.

---

## 7. Prueba de carga con k6 contra el servidor real

Mide cuánto aguanta el servidor de verdad, antes de que lo descubran los usuarios.

**Reglas:**

- Solo **`publico.js`**: hace lecturas públicas y no escribe nada.
- **Nunca** corras `refugio.js`, `perfil-animal.js` ni `seed-escala.sh` contra
  producción, porque crean datos.
- Hazlo en una hora tranquila (de noche).

### A. Instalar k6 en tu computador

- Windows: `winget install k6 --source winget`
- Mac: `brew install k6`
- Comprueba: `k6 version`

### B. Subir el límite por IP mientras dura la prueba

La API frena a quien pide demasiado desde una misma IP, y en la prueba todo
sale desde tu computador. En el servidor, `sudo nano deploy/api.env` y agrega
al final:

```dotenv
# TEMPORAL prueba k6: borrar al terminar
PUBLIC_RATE_LIMIT_PER_MINUTE=10000
PUBLIC_RATE_LIMIT_PER_MIN=20000
```

Aplica con `dc up -d --wait api`. Con ese tope, una sola computadora llega
como máximo a unas 160 peticiones por segundo. Medir más exige varias máquinas;
si lo necesitas, te preparo la forma de hacerlo.

### C. Correr la prueba en escalones

En una segunda ventana del servidor, deja corriendo `sudo docker stats` para ver
CPU y memoria. En tu computador, dentro de la carpeta del repo:

```bash
k6 run -e API_URL=https://adoptafacil.org/api -e SCALE=0.02 -e RAMP=30s -e DURATION=2m scripts/load/k6/publico.js   # 30 por segundo
k6 run -e API_URL=https://adoptafacil.org/api -e SCALE=0.05 -e RAMP=1m  -e DURATION=3m scripts/load/k6/publico.js   # 75 por segundo
k6 run -e API_URL=https://adoptafacil.org/api -e SCALE=0.1  -e RAMP=1m  -e DURATION=5m scripts/load/k6/publico.js   # 150 por segundo
```

Si un escalón falla, no corras el siguiente.

### D. Leer el resultado

Al final de cada corrida, k6 muestra:

- `http_req_duration ... p(95)=`: debe ser **menor de 150 ms**.
- `http_req_failed`: debe ser **menor de 0,10 %**.
- Al lado de cada umbral, una ✓ verde si se cumplió o una ✗ roja si no.

En `docker stats`, los contenedores `api` no deberían pasar de ~70 % de CPU
sostenido. Si pasa el escalón de 150 por segundo, el servidor está listo para
abrir. Si no, mándame la salida de k6 (no tiene datos privados) y la de `docker stats`.

### E. Volver a dejar todo como estaba (obligatorio)

`sudo nano deploy/api.env` → borra las tres líneas de "TEMPORAL prueba k6" →
`dc up -d --wait api` → `curl -fsS https://adoptafacil.org/api/health`.

---

## Resumen: qué variable llena cada punto

| Punto | Archivo          | Variables                                                                                                                                      |
| ----- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `deploy/.env`    | `APP_DOMAIN`, `ACME_EMAIL`, `PORTALS_TLS`, `CLOUDFLARE_API_TOKEN`, `VITE_PORTAL_BASE_DOMAIN`                                                   |
| 2     | `deploy/api.env` | `NOTIFICATION_DRIVER`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `EMAIL_QUEUE_RATE_MAX`, `EMAIL_QUEUE_RATE_DURATION_MS` |
| 3     | ninguno          | ninguna                                                                                                                                        |
| 4     | `deploy/.env`    | `BACKUP_AGE_RECIPIENT`, `BACKUP_RCLONE_REMOTE`, `BACKUP_AGE_IDENTITY_FILE`, `BACKUP_HEALTHCHECK_URL`                                           |
| 5     | `deploy/api.env` | `STORAGE_DRIVER`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`                                          |
| 6     | `deploy/.env`    | `ALERT_WEBHOOK_URL`, `BACKUP_HEALTHCHECK_URL`                                                                                                  |
| 7     | `deploy/api.env` | `PUBLIC_RATE_LIMIT_PER_MINUTE` y `PUBLIC_RATE_LIMIT_PER_MIN`, solo durante la prueba                                                           |

## Lo que puede esperar 1 o 2 semanas

- CDN para imágenes (`img.adoptafacil.org` con `STORAGE_PUBLIC_CDN_BASE_URL`):
  conviene antes de una campaña grande. Ver [ESCALA.md](./ESCALA.md).
- Captura de errores (Sentry o GlitchTip) y métricas con Grafana (`METRICS_TOKEN`).
- DMARC en `p=quarantine`, después de 2 a 4 semanas sin fallos.
- Manejo de rebotes y quejas de SES dentro de la plataforma (hoy lo cubre la
  lista de supresión del punto 2, paso G).
