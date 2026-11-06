#!/usr/bin/env bash
# Despliegue de una versión fija: checkout -> preflight -> respaldo -> build +
# migraciones -> humo. Si el humo falla, imprime cómo volver a la anterior.
#   sudo -E deploy/scripts/deploy.sh <tag-o-commit>
. "$(dirname "$0")/lib.sh"

REF="${1:?uso: deploy.sh <tag-o-commit>}"
REPO_DIR="$(cd "$DEPLOY_DIR/.." && pwd)"
cd "$REPO_DIR"

previous="$(git rev-parse --short HEAD)"
git fetch --tags origin
git checkout --detach "$REF"
export RELEASE="$(git rev-parse --short HEAD)"
echo "Desplegando $RELEASE (antes: $previous)"

"$DEPLOY_DIR/scripts/preflight.sh"

# Respaldo previo si ya hay una base corriendo (primer despliegue: no hay).
if compose ps --status running postgres 2>/dev/null | grep -q postgres; then
  "$DEPLOY_DIR/scripts/backup.sh"
fi

compose up -d --build --wait

if ! "$DEPLOY_DIR/scripts/smoke.sh"; then
  alert "Despliegue $RELEASE: el humo falló"
  cat >&2 <<MSG
El humo falló. Volver atrás:
  - Sin migración nueva:  export RELEASE=$previous && git checkout --detach $previous && docker compose -f deploy/compose.yaml --env-file deploy/.env up -d --no-build --wait
  - Con migración nueva:  docs/operacion/DESPLIEGUE_VPS.md §Volver atrás (restaurar el respaldo recién tomado)
MSG
  exit 1
fi
echo "$RELEASE" >"$DEPLOY_DIR/.last-release"
echo "Desplegado $RELEASE"
