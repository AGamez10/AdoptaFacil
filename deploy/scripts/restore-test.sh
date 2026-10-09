#!/usr/bin/env bash
# Prueba de restauración (R3-2, OPS-001): un respaldo que nunca se restauró no
# cuenta como respaldo. Restaura el último dump en un PostgreSQL efímero SIN
# red, comprueba que está completo y lo destruye. No toca la base de producción.
#   deploy/scripts/restore-test.sh [ruta/al/db-*.dump.age]
# Requiere BACKUP_AGE_IDENTITY_FILE: la clave privada age (ver BACKUPS.md).
# Cron sugerido (domingos 04:00 hora Colombia = 09:00 UTC):
#   0 9 * * 0 /opt/adoptafacil/deploy/scripts/restore-test.sh >> /var/log/adoptafacil-restore.log 2>&1
. "$(dirname "$0")/lib.sh"

trap 'alert "Prueba de restauración FALLÓ en la línea $LINENO"; cleanup' ERR
: "${BACKUP_AGE_IDENTITY_FILE:?BACKUP_AGE_IDENTITY_FILE (clave privada age) es obligatoria}"

db_file="${1:-$(ls -1t "$BACKUP_DIR"/db-*.dump.age 2>/dev/null | head -n1)}"
[ -n "$db_file" ] && [ -f "$db_file" ] || { echo "No hay respaldos en $BACKUP_DIR" >&2; false; }
ts="${db_file##*/db-}"; ts="${ts%.dump.age}"
storage_file="$BACKUP_DIR/storage-$ts.tar.gz.age"
started=$(date +%s)

echo "==> integridad SHA-256 ($ts)"
(cd "$BACKUP_DIR" && sha256sum -c "SHA256SUMS-$ts")

name="adoptafacil-restore-test-$$"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "==> PostgreSQL efímero sin red"
docker run -d --name "$name" --network none \
  -e POSTGRES_PASSWORD="$(head -c 18 /dev/urandom | od -An -tx1 | tr -d ' \n')" \
  -e POSTGRES_USER=restore -e POSTGRES_DB=restore postgres:16 >/dev/null
for _ in $(seq 1 60); do
  docker exec "$name" pg_isready -U restore -d restore >/dev/null 2>&1 && break
  sleep 1
done
# Rol que referencian GRANTs y policies del dump.
docker exec "$name" psql -U restore -d restore -qc \
  "CREATE ROLE adoptafacil_app NOLOGIN NOSUPERUSER NOBYPASSRLS"

echo "==> pg_restore"
age -d -i "$BACKUP_AGE_IDENTITY_FILE" "$db_file" |
  docker exec -i "$name" pg_restore -U restore -d restore --no-owner --exit-on-error

q() { docker exec "$name" psql -U restore -d restore -Atc "$1"; }
tables=$(q "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")
migrations=$(q "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL")
orgs=$(q "SELECT count(*) FROM organizations")
audit=$(q "SELECT count(*) FROM audit_logs")

# Contra producción: mismas tablas y mismas migraciones aplicadas.
live_tables=$(compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc \
  "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")
live_migrations=$(compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc \
  "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL")
[ "$tables" = "$live_tables" ] || { echo "tablas: respaldo $tables vs producción $live_tables" >&2; false; }
# Una migración aplicada después del respaldo es normal; menos de las que había no.
[ "$migrations" -gt 0 ] && [ "$migrations" -le "$live_migrations" ] ||
  { echo "migraciones: respaldo $migrations vs producción $live_migrations" >&2; false; }

echo "==> postura RLS del respaldo restaurado"
if ! posture=$(docker exec -i "$name" psql -U restore -d restore -v ON_ERROR_STOP=1 -q \
  <"$DEPLOY_DIR/../scripts/ci/rls-posture.sql" 2>&1); then
  echo "$posture" >&2
  false
fi

if [ -f "$storage_file" ]; then
  echo "==> archivo de archivos subidos legible"
  files=$(age -d -i "$BACKUP_AGE_IDENTITY_FILE" "$storage_file" | tar tzf - | grep -vc '/$' || true)
else
  files="sin respaldo de archivos"
fi

elapsed=$(($(date +%s) - started))
summary="Restauración OK de $ts en ${elapsed}s: $tables tablas, $migrations migraciones, $orgs organizaciones, $audit eventos de auditoría, archivos: $files"
echo "==> $summary"
echo "$(date -u +%FT%TZ) $summary" >>"$BACKUP_DIR/restore-tests.log"
