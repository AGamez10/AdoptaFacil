#!/usr/bin/env bash
# Utilidades compartidas por backup.sh, restore-test.sh y monitor.sh.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$DEPLOY_DIR/.env}"
BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_DIR/backups}"

if [ ! -f "$ENV_FILE" ]; then
  echo "No existe $ENV_FILE (copia deploy/.env.example)" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

compose() {
  docker compose -f "$DEPLOY_DIR/compose.yaml" --env-file "$ENV_FILE" "$@"
}

# Alerta por webhook: POST de texto plano (compatible con ntfy; ver MONITOREO.md).
# Sin ALERT_WEBHOOK_URL solo escribe en stderr. Nunca incluye datos personales.
alert() {
  local msg="[AdoptaFácil ${APP_DOMAIN:-?}] $*"
  echo "ALERTA: $msg" >&2
  if [ -n "${ALERT_WEBHOOK_URL:-}" ]; then
    curl -fsS -m 10 -H 'Content-Type: text/plain; charset=utf-8' \
      -H 'Title: AdoptaFacil' -H 'Priority: high' \
      --data-binary "$msg" "$ALERT_WEBHOOK_URL" >/dev/null || echo "no se pudo enviar la alerta" >&2
  fi
}

utc_now() { date -u +%Y%m%dT%H%M%SZ; }
