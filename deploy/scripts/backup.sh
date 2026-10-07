#!/usr/bin/env bash
# Respaldo diario cifrado de AdoptaFácil (R3-2, OPS-001). Ver docs/operacion/BACKUPS.md.
#   - Base de datos: pg_dump en formato custom (-Fc) desde el contenedor postgres.
#   - Archivos subidos: volumen api_storage en tar.gz.
#   - Ambos cifrados con age para BACKUP_AGE_RECIPIENT (la clave privada no
#     tiene por qué vivir en el VPS) + sumas SHA-256.
#   - Retención local de BACKUP_RETENTION_DAYS días y copia off-site con rclone
#     si BACKUP_RCLONE_REMOTE está definido.
#   - Ping a BACKUP_HEALTHCHECK_URL al terminar bien (dead man's switch) y
#     alerta por webhook si algo falla.
# Cron sugerido (03:00 hora Colombia = 08:00 UTC):
#   0 8 * * * /opt/adoptafacil/deploy/scripts/backup.sh >> /var/log/adoptafacil-backup.log 2>&1
. "$(dirname "$0")/lib.sh"

trap 'rm -f "$BACKUP_DIR"/*.partial; alert "Respaldo FALLÓ en la línea $LINENO; revisa /var/log/adoptafacil-backup.log"' ERR

: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT es obligatoria (clave pública age)}"
command -v age >/dev/null || { echo "Falta 'age' (apt install age)" >&2; exit 1; }

ts="$(utc_now)"
umask 077
mkdir -p "$BACKUP_DIR"
db_file="$BACKUP_DIR/db-$ts.dump.age"
files_file="$BACKUP_DIR/storage-$ts.tar.gz.age"
started=$(date +%s)

echo "==> $ts pg_dump"
compose exec -T postgres pg_dump -Fc --no-owner -U "$POSTGRES_USER" "$POSTGRES_DB" |
  age -r "$BACKUP_AGE_RECIPIENT" >"$db_file.partial"
mv "$db_file.partial" "$db_file"

echo "==> archivos subidos (volumen api_storage)"
compose run --rm --no-deps -T --entrypoint tar -v api_storage:/backup-src:ro api \
  czf - -C /backup-src . |
  age -r "$BACKUP_AGE_RECIPIENT" >"$files_file.partial"
mv "$files_file.partial" "$files_file"

# Un respaldo vacío o truncado es peor que ninguno: tamaño mínimo razonable.
[ "$(stat -c %s "$db_file")" -gt 1024 ] || { echo "dump sospechosamente pequeño" >&2; false; }

(cd "$BACKUP_DIR" && sha256sum "$(basename "$db_file")" "$(basename "$files_file")" >"SHA256SUMS-$ts")

echo "==> retención local: ${BACKUP_RETENTION_DAYS:-14} días"
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db-*.age' -o -name 'storage-*.age' -o -name 'SHA256SUMS-*' \) \
  -mtime +"${BACKUP_RETENTION_DAYS:-14}" -print -delete

if [ -n "${BACKUP_RCLONE_REMOTE:-}" ]; then
  echo "==> copia off-site a $BACKUP_RCLONE_REMOTE"
  rclone copy "$BACKUP_DIR" "$BACKUP_RCLONE_REMOTE" \
    --include "db-$ts.dump.age" --include "storage-$ts.tar.gz.age" --include "SHA256SUMS-$ts"
else
  echo "AVISO: sin BACKUP_RCLONE_REMOTE los respaldos solo están en este VPS" >&2
fi

elapsed=$(($(date +%s) - started))
echo "==> respaldo OK en ${elapsed}s: $(du -h "$db_file" | cut -f1) BD, $(du -h "$files_file" | cut -f1) archivos"
if [ -n "${BACKUP_HEALTHCHECK_URL:-}" ]; then
  curl -fsS -m 10 --retry 3 "$BACKUP_HEALTHCHECK_URL" >/dev/null || echo "no se pudo hacer ping" >&2
fi
