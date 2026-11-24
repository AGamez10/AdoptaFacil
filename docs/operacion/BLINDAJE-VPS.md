# Blindar el VPS de Hostinger y desplegar AdoptaFácil

> Versión 2026-11-24. Para el dueño, paso a paso, con comandos para copiar.
> Cierra en el repo H-CF-01 (nube naranja) y H-CF-02 (origen abierto) de
> [AUDITORIA-CLOUDFLARE.md](./AUDITORIA-CLOUDFLARE.md). Detalle de variables:
> [ENV-PRODUCCION.md](./ENV-PRODUCCION.md). Respaldos y alertas:
> [GUIA-PASO-A-PASO-PRODUCCION.md](./GUIA-PASO-A-PASO-PRODUCCION.md) puntos 4 y 6.

**Regla de oro de los secretos.** Tu `.env` local se queda en tu computador.
En el servidor los secretos van **solo** en `deploy/.env` y `deploy/api.env`
(`chmod 600`). Nunca en git, en un PR, en el chat ni en capturas.

## Cómo queda protegido

```
Visitante ─► Cloudflare (WAF, límite de peticiones, bots, TLS)
                 │  solo IPs de Cloudflare pasan (DOCKER-USER)
                 ▼
            VPS: Caddy :443 (certificado Let's Encrypt por DNS-01)
                 ├─► API (2 réplicas) ─► PgBouncer ─► Postgres   red interna, sin puertos
                 └─► web estática                    Redis       red interna, sin puertos
SSH :22 ─► solo llave, solo el usuario deploy, fail2ban, ufw con límite
```

| Capa             | Qué la cubre                                                                                     | Dónde                                           |
| ---------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| Firewall externo | 22, 80 y 443 TCP; todo lo demás se descarta antes de llegar al VPS                               | hPanel (paso 3)                                 |
| SSH              | sin root, sin contraseñas, solo `deploy`, 3 intentos, fail2ban con bloqueo creciente             | `endurecer-servidor.sh`                         |
| Firewall del VPS | ufw: solo SSH. Docker se salta ufw, así que 80/443 se cierran a Cloudflare en `DOCKER-USER`      | `endurecer-servidor.sh`, `cloudflare-origen.sh` |
| Sistema          | parches de seguridad diarios con reinicio 04:00 hora Colombia, kernel endurecido, swap           | `endurecer-servidor.sh`                         |
| Docker           | repo oficial, `no-new-privileges`, `live-restore`, logs rotados, `deploy` fuera del grupo docker | `endurecer-servidor.sh`                         |
| Borde            | proxy naranja, Full (strict), TLS ≥ 1.2, WAF gratis, límite en `/api/auth/`, Bot Fight           | Cloudflare (paso 7)                             |
| App              | RLS, RBAC, límites por IP real en Redis, cabeceras, CSP                                          | ya en el repo                                   |

---

## 1. Antes de comprar (en tu computador, 5 min)

Crea tu llave SSH. En **PowerShell** (Windows) o **Terminal** (Mac):

```bash
ssh-keygen -t ed25519 -C "adoptafacil-vps"
```

Enter para la ruta por defecto y **ponle frase de paso** (guárdala en tu gestor
de contraseñas). Muestra la parte pública para pegarla en Hostinger:

```bash
# Windows
type $env:USERPROFILE\.ssh\id_ed25519.pub
# Mac
cat ~/.ssh/id_ed25519.pub
```

Activa la verificación en dos pasos (2FA) en Hostinger, Cloudflare, Namecheap,
AWS, Backblaze y GitHub. Quien entre a uno de esos paneles controla el sitio.

## 2. Comprar el VPS

hPanel → **VPS** → comprar:

- **Plan:** KVM 4 (4 vCPU, 16 GB) para abrir al público. KVM 2 (8 GB) alcanza
  para un piloto cerrado. El build de las imágenes pide 2 a 3 GB de RAM.
- **Ubicación:** **Estados Unidos.** Es la más cercana a Colombia junto con
  Brasil, y deja todo en un solo país (Amazon SES, Cloudflare y Google también
  están allá), lo que simplifica la transferencia internacional (Ley 1581,
  art. 26). Anota el país: falta en `docs/legal/revision-asesor.md`.
- **Sistema operativo:** **Ubuntu 24.04 LTS** sin panel ni Docker preinstalado
  (plantilla "Plain OS"). El script instala Docker desde el repositorio oficial.
- **Clave SSH:** pega la pública del paso 1.
- Contraseña de root: larga y aleatoria, al gestor de contraseñas. Es la de
  emergencia (consola y modo de recuperación de hPanel); por SSH root dejará
  de entrar.

Anota la **IP** del VPS. Desactiva el escáner y el panel que Hostinger ofrezca
instalar: no hacen falta.

## 3. Firewall de Hostinger

hPanel → VPS → tu servidor → **Seguridad → Firewall** → crear configuración
`adoptafacil` → agrega reglas **Aceptar**:

| Protocolo | Puerto | Origen     |
| --------- | ------ | ---------- |
| TCP       | 22     | Cualquiera |
| TCP       | 80     | Cualquiera |
| TCP       | 443    | Cualquiera |

Actívala. Todo lo demás queda descartado. (El cierre de 80/443 a solo
Cloudflare lo hace el servidor en el paso 6, que se actualiza solo cuando
Cloudflare cambia sus rangos.)

## 4. Primer acceso y endurecimiento (10 min)

```bash
ssh root@IP_DEL_VPS
git clone https://github.com/AGamez10/AdoptaFacil /opt/adoptafacil
cd /opt/adoptafacil && git checkout claude/project-thread-svlwgg
bash deploy/host/endurecer-servidor.sh
```

Te pide la **contraseña de sudo** para el usuario `deploy` (otra distinta,
larga, al gestor). Al terminar, **sin cerrar esa ventana**, abre otra terminal:

```bash
ssh deploy@IP_DEL_VPS
sudo whoami        # debe decir: root
```

Si entra, cierra la de root. Si no, no la cierres y pega el error en el chat.
Comprueba que root ya no entra: `ssh root@IP_DEL_VPS` debe decir
`Permission denied`.

## 5. Atajo para el resto de la guía

Ya como `deploy`:

```bash
cd /opt/adoptafacil
echo "alias dc='sudo docker compose -f /opt/adoptafacil/deploy/compose.yaml --env-file /opt/adoptafacil/deploy/.env'" >> ~/.bashrc
source ~/.bashrc
```

## 6. Cloudflare: registros y origen cerrado

**6.1 Registros.** Cloudflare → `adoptafacil.org` → **DNS → Records**. Deben
quedar así, con la **nube naranja (Proxied)**:

| Tipo | Nombre | Valor      |
| ---- | ------ | ---------- |
| A    | `@`    | IP del VPS |
| A    | `www`  | IP del VPS |
| A    | `*`    | IP del VPS |

Borra cualquier `AAAA` de esos tres nombres. **No toques** los de correo de SES
(los 3 CNAME `_domainkey`, el MX y TXT de `bounce` y el `_dmarc`): siguen en
gris.

**6.2 Token para los certificados.** My Profile → **API Tokens** → Create Token
→ plantilla **Edit zone DNS** → Zone Resources: _Include · Specific zone ·
adoptafacil.org_ → en **Client IP Address Filtering** agrega _Is in · IP del
VPS_ (así el token no sirve desde otro lugar aunque se filtre) → Create. Cópialo
una sola vez al gestor de contraseñas.

**6.3 Cerrar el origen a solo Cloudflare** (en el VPS):

```bash
sudo bash deploy/host/cloudflare-origen.sh instalar
```

Desde tu computador, comprueba que la IP directa ya no responde (debe tardar y
fallar):

```bash
curl -m 8 -k https://IP_DEL_VPS     # "timed out": bien
```

Si algún día hace falta abrirlo para un diagnóstico:
`sudo adoptafacil-cloudflare-origen quitar`, y luego `... aplicar`.

> **Dominios propios del plan Pro (`CUSTOM_DOMAINS`).** Entran directo al VPS,
> sin Cloudflare, y con el origen cerrado no cargarían. Déjalo en `off` en el
> lanzamiento. Para encenderlo después, la vía es **Cloudflare for SaaS**
> (gratis hasta 100 dominios), que se prepara aparte.

## 7. Cloudflare: seguridad del borde (plan Free)

**SSL/TLS**

- Overview → modo **Full (strict)**. Nunca _Flexible_.
- Edge Certificates → **Always Use HTTPS**: On · **Minimum TLS Version**: 1.2 ·
  **TLS 1.3**: On · **Automatic HTTPS Rewrites**: On.
  (HSTS ya lo manda el servidor; no lo actives aquí.)

**DNS**

- DNS → Settings → **DNSSEC → Enable**. Copia los datos del registro DS a
  Namecheap: Domain List → Manage → **Advanced DNS → DNSSEC** → Add DS. Tarda
  hasta un día en quedar activo.
- Agrega un registro **CAA**: Nombre `@`, Tag _Only allow specific hostnames_
  (`issue`), CA `letsencrypt.org`. Cloudflare agrega solo los de sus propias CA.

**Security → WAF**

- **Managed rules:** comprueba que _Cloudflare Free Managed Ruleset_ esté
  activo.
- **Custom rules → Create rule** (usa _Edit expression_ y pega):
  1. `Bloquear sondeos` → acción **Block**:
     ```
     (http.request.uri.path contains "/.env") or (http.request.uri.path contains "/.git") or (http.request.uri.path contains "wp-") or ends_with(http.request.uri.path, ".php") or (http.request.uri.path contains "/phpmyadmin")
     ```
  2. `Webhooks de pago` → acción **Skip** (marca todas las opciones salvo
     rate limiting). Ya queda lista para cuando se enciendan los pagos:
     ```
     http.request.method eq "POST" and (starts_with(http.request.uri.path, "/api/donations/webhook") or starts_with(http.request.uri.path, "/api/billing/webhooks/") or starts_with(http.request.uri.path, "/api/coffee/webhooks/"))
     ```
- **Rate limiting rules → Create rule** `Login y registro`: si la petición
  coincide con
  ```
  http.request.method eq "POST" and starts_with(http.request.uri.path, "/api/auth/")
  ```
  y la misma IP hace más de **10 peticiones en 10 segundos** → **Block** por
  10 segundos. (La API además limita por su cuenta.)

**Security → Bots:** **Bot Fight Mode: On.** Cuando se enciendan los pagos,
si Mercado Pago cobra pero no confirma, apágalo: en el plan Free no admite
excepciones.

**Security → Settings:** Security Level **Medium** · Browser Integrity Check
**On**.

**Notifications:** agrega tu correo para _HTTP DDoS attack alert_,
_Universal SSL alert_ y _Passive Origin Monitoring_ (avisa si el origen se cae).

## 8. Secretos en el servidor

```bash
cd /opt/adoptafacil
sudo cp deploy/.env.example deploy/.env
sudo cp deploy/api.env.produccion.example deploy/api.env
sudo chmod 600 deploy/.env deploy/api.env
for v in POSTGRES_PASSWORD APP_DB_PASSWORD JWT_SECRET; do echo "$v=$(openssl rand -hex 24)"; done
echo "SIGNATURE_ENCRYPTION_KEY=$(openssl rand -hex 32)"
```

Guarda esas cuatro líneas en tu gestor de contraseñas **antes** de seguir
(`SIGNATURE_ENCRYPTION_KEY` perdida = firmas ilegibles). Luego:

```bash
sudo nano deploy/.env
```

Pega las cuatro y llena: `APP_DOMAIN=adoptafacil.org`, `ACME_EMAIL`,
`PORTALS_TLS=cloudflare`, `CLOUDFLARE_API_TOKEN` (paso 6.2),
`VITE_PORTAL_BASE_DOMAIN=adoptafacil.org`, `CUSTOM_DOMAINS=off`.
Guarda: `Ctrl+O`, `Enter`, `Ctrl+X`.

```bash
sudo nano deploy/api.env
```

Copia **a mano** desde tu `.env` local los valores de correo (SES Ohio):
`SMTP_HOST=email-smtp.us-east-2.amazonaws.com`, `SMTP_PORT=587`, `SMTP_USER`,
`SMTP_PASS`, `SMTP_FROM`. Lo que no uses va comentado con `#`, nunca vacío.
Mientras SES siga en sandbox, solo llega correo a direcciones verificadas.

## 9. Preflight y despliegue

```bash
sudo deploy/scripts/preflight.sh          # debe terminar en "Preflight OK"
sudo -E deploy/scripts/deploy.sh origin/claude/project-thread-svlwgg
```

`deploy.sh` revisa, construye (10 a 20 minutos la primera vez), migra, verifica
RLS, arranca y corre la prueba de humo. Debe terminar en `Humo OK` y
`Desplegado <versión>`. Sigue los certificados con
`dc logs caddy | grep -i 'certificate obtained'`.

Luego crea el PlatformAdmin con contraseña fuerte:
[DESPLIEGUE_VPS.md §PlatformAdmin inicial](./DESPLIEGUE_VPS.md#platformadmin-inicial-vps).

## 10. Respaldos (B2 + age + healthchecks)

Sigue [GUIA-PASO-A-PASO-PRODUCCION.md](./GUIA-PASO-A-PASO-PRODUCCION.md) punto
4 (A a E) tal cual. Dos ajustes de seguridad:

- En B2, al crear el bucket activa **Object Lock** con retención por defecto
  de **30 días**: aunque alguien entre al VPS y use su clave de B2, no puede
  borrar los respaldos de ese último mes. `backup.sh` solo sube (`rclone
copy`), nunca borra en B2.
- La llave privada `age` va al VPS solo para la prueba semanal de restauración
  (`/root/adoptafacil-backup.key`, `chmod 400`). La copia maestra se queda en tu
  gestor de contraseñas y en una USB.

Prueba obligatoria antes de abrir:

```bash
sudo deploy/scripts/backup.sh && sudo deploy/scripts/restore-test.sh
```

## 11. Alertas (ntfy, healthchecks, UptimeRobot)

Punto 6 de la misma guía (A a D). El tema de ntfy debe ser largo y secreto:
`echo adoptafacil-$(openssl rand -hex 12)`. En UptimeRobot el monitor va a
`https://adoptafacil.org/api/health`: entra por Cloudflare, así que sigue
funcionando con el origen cerrado.

## 12. Verificación final

En el VPS:

```bash
sudo bash deploy/host/verificar-blindaje.sh   # debe terminar en "Blindaje OK"
sudo deploy/scripts/smoke.sh                  # debe terminar en "Humo OK"
```

Desde tu computador:

```bash
curl -sI https://adoptafacil.org | grep -iE 'cf-ray|strict-transport'   # las dos
curl -m 8 -k https://IP_DEL_VPS                                          # timed out
ssh root@IP_DEL_VPS                                                      # Permission denied
```

Y en [ssllabs.com/ssltest](https://www.ssllabs.com/ssltest/) con
`adoptafacil.org`: nota **A** o **A+**.

## Mantenimiento

| Cada                    | Qué                                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Solo                    | parches de seguridad, rangos de Cloudflare (lunes), respaldo diario, prueba de restauración (domingo), vigilancia cada 5 min |
| Mes                     | `sudo apt update && sudo apt full-upgrade` (incluye Docker) y `sudo bash deploy/host/verificar-blindaje.sh`                  |
| Antes de algo riesgoso  | hPanel → Snapshots → Create snapshot                                                                                         |
| Si se filtra un secreto | rotarlo en su panel y en `deploy/.env`/`api.env`, luego `dc up -d --wait`                                                    |

## Si algo sale mal

| Síntoma                                         | Qué hacer                                                                                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No entro por SSH                                | Primero espera 1 hora (fail2ban) o entra desde otra red (datos del celular). Si sigue: hPanel → VPS → **modo de recuperación**, y pega lo que veas en el chat |
| fail2ban me bloqueó                             | Desde otra red: `sudo fail2ban-client unban --all`                                                                                                            |
| Error 526 en el sitio                           | Caddy aún no tiene certificado: `dc logs caddy \| grep -iE 'error\|obtained'`. Revisa `CLOUDFLARE_API_TOKEN` y el filtro de IP del token                      |
| Error 521/522                                   | El origen no responde a Cloudflare: `dc ps`, y `sudo adoptafacil-cloudflare-origen estado`                                                                    |
| Un contenedor no arranca tras el endurecimiento | `dc logs <servicio>`; pega la salida en el chat                                                                                                               |
