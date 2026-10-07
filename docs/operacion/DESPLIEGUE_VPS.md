# Despliegue en el VPS (Docker Compose + Caddy)

> Decisión D11: VPS Hostinger (2 vCPU, 8 GB, 100 GB NVMe), Docker Compose, Caddy
> con TLS automático, sin Kubernetes. Este runbook cierra OPS-003/AF-019 en lo
> que el repo puede cerrar; los pasos marcados **[VPS]** solo se pueden ejecutar
> en el servidor del dueño y quedan como verificación pendiente.

## Qué se despliega

| Servicio   | Imagen                                       | Red            | Puertos publicados |
| ---------- | -------------------------------------------- | -------------- | ------------------ |
| `caddy`    | `deploy/docker/web.Dockerfile` (SPA + Caddy) | `edge`         | 80, 443 (TCP/UDP)  |
| `api`      | `deploy/docker/api.Dockerfile` → `runtime`   | `edge`, `data` | ninguno            |
| `migrate`  | `deploy/docker/api.Dockerfile` → `migrate`   | `data`         | ninguno (one-shot) |
| `postgres` | `postgres:16`                                | `data`         | ninguno            |
| `redis`    | `redis:7` (AOF, `noeviction` para BullMQ)    | `data`         | ninguno            |

- Un solo origen: `https://DOMINIO` sirve el SPA y `https://DOMINIO/api/*` la API.
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
  existe aún; MinIO comunitario dejó de publicar imágenes (re-verificar antes de
  elegirlo).

## Antes de poner datos reales (condiciones)

1. **Guarda de drivers en producción (R0-1, hilo "Arranque seguro y flags").**
   Hoy, sin `AUTH_IDENTITY_DRIVER`/`PAYMENT_DRIVER`, la API arranca con los
   adaptadores `fake` (AF-001: suplantación por Google falso). No se despliega
   para usuarios reales hasta que esa guarda esté en la rama desplegada.
2. **Redis con contraseña (BLD-003, R1-7, mismo hilo).** La API descarta las
   credenciales de `REDIS_URL`; mientras tanto Redis va sin contraseña pero
   aislado en la red interna. Cuando R1-7 llegue, añadir `--requirepass` y la
   contraseña en `REDIS_URL`.
3. **Correo real (R3-4)**: sin proveedor SMTP no llegan reset de contraseña ni
   invitaciones.
4. **Respaldo off-site** configurado (proveedor ⟦POR DEFINIR⟧) y primera prueba
   de restauración registrada.

## Primer despliegue [VPS]

```bash
# 1. Sistema (Ubuntu 24.04 LTS)
sudo apt update && sudo apt install -y ca-certificates curl git age rclone ufw
curl -fsSL https://get.docker.com | sudo sh          # Docker Engine + compose plugin
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443 && sudo ufw enable
# Ojo: Docker publica puertos saltándose ufw; por eso solo Caddy publica.

# 2. DNS: registro A (y AAAA si hay IPv6) de DOMINIO -> IP del VPS.

# 3. Código
sudo git clone https://github.com/AGamez10/AdoptaFacil /opt/adoptafacil
cd /opt/adoptafacil && sudo git checkout <rama o tag a desplegar>

# 4. Configuración
sudo cp deploy/.env.example deploy/.env && sudo chmod 600 deploy/.env
sudo nano deploy/.env        # dominio, correo ACME, secretos (openssl rand -hex 24)
sudo cp deploy/api.env.example deploy/api.env && sudo chmod 600 deploy/api.env  # solo lo que se use

# 5. Arranque (construye, migra, verifica RLS, levanta API y Caddy)
export RELEASE=$(git rev-parse --short HEAD)
sudo -E docker compose -f deploy/compose.yaml --env-file deploy/.env up -d --build --wait

# 6. PlatformAdmin inicial: contraseña fuerte, nunca la de por defecto (AF-037)
#    (procedimiento del hilo "RBAC y organizaciones", R1-5).
```

### Verificación posterior [VPS]

| Comprobación                    | Comando                                                                                                                 | Esperado                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| API sana tras HTTPS             | `curl -fsS https://DOMINIO/api/health`                                                                                  | `{"status":"ok","db":"up","redis":"up"}`    |
| Certificado real                | `echo \| openssl s_client -connect DOMINIO:443 -servername DOMINIO 2>/dev/null \| openssl x509 -noout -issuer -enddate` | emisor Let's Encrypt, ~90 días              |
| Postura RLS                     | `docker compose ... logs migrate \| tail -3`                                                                            | `postura RLS verificada`                    |
| Solo Caddy publica puertos      | `docker compose ... ps --format '{{.Service}} {{.Publishers}}'`                                                         | solo `caddy` con `0.0.0.0`                  |
| Postgres no alcanzable de fuera | `nc -zv IP_DEL_VPS 5432` desde otra máquina                                                                             | rechazado                                   |
| Cabeceras                       | `curl -sI https://DOMINIO/ \| grep -iE 'strict-transport\|nosniff\|frame'`                                              | las tres presentes                          |
| Respaldo + restauración         | `deploy/scripts/backup.sh && deploy/scripts/restore-test.sh`                                                            | `Restauración OK … N tablas, N migraciones` |
| Alerta de prueba                | `docker compose ... stop redis; deploy/scripts/monitor.sh; docker compose ... start redis`                              | llega 1 alerta y luego "Recuperado"         |

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
por servicio, `x-logging` en el compose).

## Actualizar

```bash
cd /opt/adoptafacil
deploy/scripts/backup.sh                       # siempre antes de migrar
sudo git fetch && sudo git checkout <nuevo tag o commit>
export RELEASE=$(git rev-parse --short HEAD)
sudo -E docker compose -f deploy/compose.yaml --env-file deploy/.env up -d --build --wait
```

Las imágenes quedan etiquetadas con `RELEASE`; la anterior sigue en el disco.

## Volver atrás (rollback)

- **Sin migración nueva de por medio:** `export RELEASE=<sha anterior>` y
  `docker compose ... up -d --no-build --wait` (usa las imágenes ya construidas).
- **Con migración nueva:** las migraciones de Prisma solo avanzan. Volver la
  imagen sin volver la base puede romper. Procedimiento: detener `api` y
  `caddy`, restaurar el respaldo tomado justo antes de actualizar
  (`docs/operacion/BACKUPS.md` §Restaurar en producción) y levantar el
  `RELEASE` anterior. Toda migración de seguridad trae su rollback SQL escrito
  (regla §7.7).

## Staging

Mismo compose con otro nombre de proyecto y dominio, idealmente en otro VPS
pequeño (dos Caddy no pueden compartir 80/443 en una máquina):
`docker compose -p adoptafacil-staging -f deploy/compose.yaml --env-file deploy/staging.env up -d --build`.
Nunca con datos reales copiados de producción sin anonimizar (Ley 1581).

## Subdominios de portales (F7, pendiente)

`*.DOMINIO` necesita certificado comodín por DNS-01: Caddy compilado con el
módulo del proveedor DNS (`xcaddy build --with github.com/caddy-dns/<proveedor>`)
y un token de API del DNS. El proveedor DNS está ⟦POR DEFINIR⟧ y el hilo del
portal decide la resolución por host. No se habilita on-demand TLS sin un
endpoint `ask` que solo autorice dominios verificados.

## Evidencia de este PR (entorno cloud, no el VPS)

- `docker compose up --wait` de las cinco piezas en un Linux con Docker 29:
  migraciones (62), rotación del rol y postura RLS OK; `GET https://localhost/api/health`
  → `{"status":"ok","db":"up","redis":"up"}` a través de Caddy; SPA con
  fallback a `index.html`; HTTP → HTTPS (308); HSTS, `nosniff`, `X-Frame-Options`.
- Solo Caddy publica puertos; `data` es interna; la API corre como `node`.
- Memoria en reposo: API ~111 MB, Postgres ~25 MB, Caddy ~13 MB, Redis ~5 MB.
- Datos persistentes tras `down` / `up`.
- El mismo arranque corre en CI (job `docker` de `ci.yml`) con las imágenes
  reales (`node:20-bookworm-slim` + openssl). En el entorno cloud los
  repositorios de Debian están bloqueados, así que la verificación local usó
  `node:20-bookworm` (que ya trae libssl) con `--build-arg APT_PACKAGES=`.
