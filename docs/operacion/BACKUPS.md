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
Cloudflare R2, Google Drive…). Proveedor ⟦POR DEFINIR por el dueño⟧. Recomendado:
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

```bash
cd /opt/adoptafacil
C="docker compose -f deploy/compose.yaml --env-file deploy/.env"
$C stop caddy api                                   # nadie escribe mientras tanto
$C exec -T postgres dropdb -U "$POSTGRES_USER" --if-exists adoptafacil_prev
$C exec -T postgres psql -U "$POSTGRES_USER" -d postgres \
  -c "ALTER DATABASE $POSTGRES_DB RENAME TO adoptafacil_prev"   # se conserva por si acaso
$C exec -T postgres createdb -U "$POSTGRES_USER" "$POSTGRES_DB"
age -d -i /ruta/adoptafacil-backup.key backups/db-<UTC>.dump.age |
  $C exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --exit-on-error
# Archivos (si hace falta):
age -d -i /ruta/adoptafacil-backup.key backups/storage-<UTC>.tar.gz.age |
  $C run --rm --no-deps -T --entrypoint tar -v api_storage:/restore api xzf - -C /restore
$C up -d --wait                                      # migrate re-verifica la postura RLS
```

Anotar fecha, respaldo usado, duración y resultado en el registro de
incidentes. Borrar `adoptafacil_prev` solo cuando todo esté verificado.

## Ley 1581 y supresión

Un dato suprimido sigue existiendo en los respaldos hasta que expiran
(retención local `BACKUP_RETENTION_DAYS`, 14 días por defecto, más la del
destino off-site). La política de tratamiento debe declarar ese plazo; el texto
lo valida el abogado (hilo Ley 1581).
