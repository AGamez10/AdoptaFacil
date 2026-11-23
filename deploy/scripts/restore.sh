#!/usr/bin/env bash
# Restauración REAL de producción desde un respaldo (desastre o rollback con
# migración). Ver docs/operacion/BACKUPS.md, "Restaurar en producción".
#
#   deploy/scripts/restore.sh backups/db-<UTC>.dump.age            # solo base
#   deploy/scripts/restore.sh backups/db-<UTC>.dump.age --files    # base + archivos
#
# Pide escribir RESTAURAR antes de tocar nada (CONFIRM=RESTAURAR lo salta, para
# simulacros automatizados). Nunca borra la base actual: la renombra a
# <base>_prev_<UTC> para poder volver atrás. Requiere BACKUP_AGE_IDENTITY_FILE
# (clave privada age) o AGE_IDENTITY=/ruta/a/la/clave.
. "$(dirname "$0")/lib.sh"

db_file="${1:-}"
with_files=false
[ "${2:-}" = "--files" ] && with_files=true
identity="${AGE_IDENTITY:-${BACKUP_AGE_IDENTITY_FILE:-}}"

[ -n "$db_file" ] && [ -f "$db_file" ] || { echo "Uso: $0 backups/db-<UTC>.dump.age [--files]" >&2; exit 2; }
[ -n "$identity" ] && [ -f "$identity" ] || { echo "Falta la clave privada age (AGE_IDENTITY o BACKUP_AGE_IDENTITY_FILE)" >&2; exit 2; }
command -v age >/dev/null || { echo "Falta 'age' (apt install age)" >&2; exit 1; }

dir="$(cd "$(dirname "$db_file")" && pwd)"
ts="${db_file##*/db-}"; ts="${ts%.dump.age}"
storage_file="$dir/storage-$ts.tar.gz.age"
prev="${POSTGRES_DB}_prev_$(utc_now | tr 'TZ' 'tz')"
started=$(date +%s)

echo "==> integridad SHA-256 ($ts)"
if [ -f "$dir/SHA256SUMS-$ts" ]; then
  if $with_files; then
    (cd "$dir" && sha256sum -c "SHA256SUMS-$ts")
  else
    (cd "$dir" && grep " db-$ts.dump.age\$" "SHA256SUMS-$ts" | sha256sum -c -)
  fi
else
  echo "AVISO: no hay SHA256SUMS-$ts; se sigue sin verificar integridad" >&2
fi
if $with_files && [ ! -f "$storage_file" ]; then
  echo "No existe $storage_file" >&2
  exit 1
fi

echo "==> la clave abre el respaldo"
magic="$(age -d -i "$identity" "$db_file" 2>/dev/null | head -c 5 || true)"
[ "$magic" = "PGDMP" ] || { echo "El archivo no es un pg_dump válido o la clave no es la correcta" >&2; exit 1; }

cat <<EOF

  Vas a RESTAURAR producción ($APP_DOMAIN) al respaldo $ts.
  - El sitio queda fuera de servicio durante la restauración.
  - Todo lo que pasó DESPUÉS de $ts se pierde de la base activa
    (queda guardado en la base $prev).
  - Archivos subidos: $($with_files && echo "también se restauran" || echo "no se tocan")

EOF
if [ "${CONFIRM:-}" != "RESTAURAR" ]; then
  read -r -p "Escribe RESTAURAR para continuar: " answer
  [ "$answer" = "RESTAURAR" ] || { echo "Cancelado. No se tocó nada."; exit 1; }
fi

trap 'alert "Restauración de producción FALLÓ en la línea $LINENO. La base anterior está en $prev"' ERR

psql_admin() { compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres "$@"; }

echo "==> deteniendo lo que escribe en la base"
compose stop caddy api worker pgbouncer
psql_admin -qc "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$POSTGRES_DB' AND pid <> pg_backend_pid()" >/dev/null

echo "==> base actual -> $prev (se conserva)"
psql_admin -qc "ALTER DATABASE \"$POSTGRES_DB\" RENAME TO \"$prev\""
psql_admin -qc "CREATE DATABASE \"$POSTGRES_DB\""

echo "==> pg_restore"
age -d -i "$identity" "$db_file" |
  compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --exit-on-error

if $with_files; then
  echo "==> archivos subidos"
  age -d -i "$identity" "$storage_file" |
    compose run --rm --no-deps -T --entrypoint tar -v api_storage:/restore api xzf - -C /restore
fi

echo "==> arranque (migrate re-verifica la postura RLS y rota la clave del rol de la app)"
compose up -d --wait --wait-timeout 300

orgs=$(compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT count(*) FROM organizations")
elapsed=$(($(date +%s) - started))
summary="Restauración de PRODUCCIÓN al respaldo $ts en ${elapsed}s: $orgs organizaciones. Base anterior en $prev."
echo "==> $summary"
mkdir -p "$BACKUP_DIR"
echo "$(date -u +%FT%TZ) $summary" >>"$BACKUP_DIR/restores.log"
alert "$summary"
cat <<EOF

Siguiente:
  1. deploy/scripts/smoke.sh
  2. Revisa la web y un par de organizaciones.
  3. Cuando todo esté bien (días después), borra la base anterior:
     docker compose -f deploy/compose.yaml --env-file deploy/.env exec -T postgres dropdb -U \$POSTGRES_USER $prev
EOF
