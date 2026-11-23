# Respaldos y restauración

> R3-2 · OPS-001 / AF-020. Pregunta rectora: si el VPS desaparece hoy, ¿qué se
> pierde y cuánto se tarda en volver? Objetivo del piloto: **RPO ≤ 24 h**
> (respaldo diario) y **RTO ≤ 2 h** (VPS nuevo + restauración), a confirmar con
> el primer simulacro en el VPS.

## Qué se respalda

| Qué                    | Cómo                                               | Archivo                    |
| ---------------------- | -------------------------------------------------- | -------------------------- |
| Base de datos completa | `pg_dump -Fc --no-owner` desde el contenedor       | `db-<UTC>.dump.age`        |
| Archivos subidos       | `tar czf` del volumen `api_storage` (solo lectura) | `storage-<UTC>.tar.gz.age` |
| Integridad             | SHA-256 de ambos                                   | `SHA256SUMS-<UTC>`         |

No se respaldan: Redis (colas reconstruibles; los jobs repetibles se recrean al
arrancar), certificados de Caddy (se reemiten), imágenes (se reconstruyen del
repo). `deploy/.env` y `deploy/api.env` **no** se respaldan con lo demás: se
guardan aparte en el gestor de contraseñas del dueño.

## Cifrado

Con [age](https://age-encryption.org): los respaldos se cifran para una clave
pública (`BACKUP_AGE_RECIPIENT`). La copia off-site es inútil para quien la robe
sin la clave privada.

```bash
age-keygen -o adoptafacil-backup.key      # en la máquina del dueño, NO en el VPS
# La línea "public key: age1…" va a BACKUP_AGE_RECIPIENT en deploy/.env
```

- **La clave privada se guarda fuera del VPS** (gestor de contraseñas + copia
  impresa o USB). Si se pierde, los respaldos no se pueden abrir.
- La prueba de restauración automática necesita la clave en el VPS
  (`BACKUP_AGE_IDENTITY_FILE`, `chmod 400`, dueño root). Es aceptable: quien
  controla el VPS ya ve la base en claro; el cifrado protege las copias fuera
  de él. Si se prefiere no tenerla allí, la prueba semanal se corre en la
  máquina del dueño con el mismo script.

## Off-site

`BACKUP_RCLONE_REMOTE` (cualquier destino de rclone: Backblaze B2, S3,
Cloudflare R2, Google Drive…). Recomendado para Hostinger: **Backblaze B2**
(`BACKUP_RCLONE_REMOTE=b2:adoptafacil-backups`, `rclone config` con una clave
de aplicación limitada a ese bucket; los primeros 10 GB son gratis). Además:
bucket con **bloqueo de objetos / versionado** para que un atacante en el VPS no
pueda borrar los respaldos remotos, y credencial de rclone que solo pueda
escribir. Mientras no exista, el respaldo vive en el mismo disco que la base:
protege de errores humanos, no de perder el VPS.

## Automatización

`deploy/scripts/backup.sh` (diario) y `deploy/scripts/restore-test.sh`
(semanal); entradas de cron en `DESPLIEGUE_VPS.md`. El respaldo hace ping a
`BACKUP_HEALTHCHECK_URL` al terminar bien (dead man's switch: si un día no
llega el ping, el servicio externo avisa) y manda una alerta al webhook si
falla. `monitor.sh` además alerta si el último respaldo tiene más de 26 h.

## La prueba de restauración

`restore-test.sh` toma el último respaldo, verifica SHA-256, lo restaura en un
PostgreSQL 16 efímero **sin red**, compara número de tablas y migraciones con
producción, corre el chequeo de postura RLS sobre lo restaurado (FORCE y
políticas sobreviven al respaldo), comprueba que el tar de archivos se puede
leer y destruye el contenedor. Deja una línea en `backups/restore-tests.log`.

Evidencia en el entorno cloud (stack de producción local, 2 organizaciones
semilla):

```text
==> respaldo OK en 1s: 432K BD, 4.0K archivos
==> Restauración OK de 20261007T234352Z en 3s: 61 tablas, 62 migraciones,
    2 organizaciones, 0 eventos de auditoría, archivos: 1
```

y ante un destinatario age inválido: alerta "Respaldo FALLÓ en la línea 29" en
el webhook y sin archivos `.partial` residuales.

## Restaurar en producción (desastre o rollback con migración)

Un solo comando, probado en cada cambio por la CI (job Docker, "Backup + restore
drill": respaldo -> prueba aislada -> restauración real -> el sitio responde y lo
escrito después del respaldo ya no está):

```bash
cd /opt/adoptafacil
AGE_IDENTITY=/ruta/adoptafacil-backup.key \
  deploy/scripts/restore.sh backups/db-<UTC>.dump.age --files   # sin --files: solo la base
# Pide escribir RESTAURAR. Luego:
deploy/scripts/smoke.sh
```

Qué hace: verifica SHA-256 y que la clave abra el respaldo; detiene Caddy, API,
worker y PgBouncer; **renombra** la base actual a `<base>_prev_<UTC>` (nunca la
borra); restaura; con `--files` restaura los archivos subidos; arranca todo
(migrate vuelve a verificar la postura RLS); deja una línea en
`backups/restores.log` y manda una alerta con el resultado. Si algo falla, la
alerta dice dónde quedó la base anterior.

Volver atrás si la restauración no sirvió: detener `caddy api worker pgbouncer`,
`ALTER DATABASE adoptafacil RENAME TO adoptafacil_malo`,
`ALTER DATABASE adoptafacil_prev_<UTC> RENAME TO adoptafacil`, `up -d --wait`.

Anotar fecha, respaldo usado, duración y resultado en el registro de
incidentes. Borrar `adoptafacil_prev_<UTC>` solo cuando todo esté verificado.

### Simulacro en el VPS real (una vez antes de cobrar, luego cada trimestre)

1. `deploy/scripts/backup.sh` y `deploy/scripts/restore-test.sh` (no tocan producción).
2. Anunciar 15 minutos de mantenimiento y correr `restore.sh` con el respaldo
   recién hecho (se pierde a lo sumo lo de esos minutos).
3. `deploy/scripts/smoke.sh`, entrar a la web, revisar una organización.
4. Anotar la duración: ese es el RTO real.

## Ley 1581 y supresión

Un dato suprimido sigue existiendo en los respaldos hasta que expiran
(retención local `BACKUP_RETENTION_DAYS`, 14 días por defecto, más la del
destino off-site). La política de tratamiento debe declarar ese plazo; el texto
lo valida el abogado (hilo Ley 1581).
