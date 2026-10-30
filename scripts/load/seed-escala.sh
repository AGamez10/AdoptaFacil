#!/usr/bin/env bash
# Carga los datos sintéticos de escala (seed-escala.sql) para las pruebas k6.
#
#   scripts/load/seed-escala.sh                # 1.000 refugios, 200.000 animales
#   ORGS=50 ANIMALS_PER_ORG=40 scripts/load/seed-escala.sh   # corrida corta
#
# Salvaguardas: se niega con NODE_ENV=production y si DATABASE_URL no apunta a
# localhost, salvo LOAD_SEED_TARGET=staging explícito (un staging desechable).
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL (owner de la base) es obligatoria}"
if [[ "${NODE_ENV:-}" == "production" ]]; then
  echo "Me niego: NODE_ENV=production." >&2
  exit 1
fi
host="$(sed -E 's#^[a-z]+://([^@]*@)?([^:/?]+).*#\2#' <<<"$DATABASE_URL")"
if [[ "$host" != "localhost" && "$host" != "127.0.0.1" && "${LOAD_SEED_TARGET:-}" != "staging" ]]; then
  echo "Me niego: $host no es local. Para un staging desechable usa LOAD_SEED_TARGET=staging." >&2
  exit 1
fi

psql "${DATABASE_URL%%\?*}" \
  -v orgs="${ORGS:-1000}" \
  -v animals_per_org="${ANIMALS_PER_ORG:-200}" \
  -v campaigns_per_org="${CAMPAIGNS_PER_ORG:-5}" \
  -f "$(dirname "$0")/seed-escala.sql"
