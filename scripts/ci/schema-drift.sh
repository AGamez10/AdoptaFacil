#!/usr/bin/env bash
# Gate de deriva de esquema (R1-10, AF-018).
#
# Compara el SQL que generan las migraciones (prisma/migrations) con el esquema
# declarado en prisma/schema. Si difieren, el próximo `prisma migrate dev`
# generaría una migración que "corrige" la diferencia (por ejemplo, borrando
# llaves foráneas que solo existen en las migraciones).
#
# Modo trinquete: la deriva que ya existía en la entrega (AF-018) está
# congelada en scripts/ci/schema-drift.baseline.sql. El gate falla si aparece
# deriva NUEVA; si alguien corrige parte de la existente, avisa para encoger la
# línea base con:  scripts/ci/schema-drift.sh --update-baseline
#
# Requiere SHADOW_DATABASE_URL: una base vacía y desechable (Prisma aplica ahí
# las migraciones para calcular el diff). Nunca una base con datos.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BASELINE="$ROOT/scripts/ci/schema-drift.baseline.sql"
: "${SHADOW_DATABASE_URL:?SHADOW_DATABASE_URL es obligatoria (base vacía y desechable)}"

current="$(mktemp)"
trap 'rm -f "$current"' EXIT

cd "$ROOT"
pnpm exec prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema \
  --shadow-database-url "$SHADOW_DATABASE_URL" \
  --script |
  grep -v -e '^--' -e '^[[:space:]]*$' | LC_ALL=C sort >"$current"

if [[ "${1:-}" == "--update-baseline" ]]; then
  cp "$current" "$BASELINE"
  echo "Línea base actualizada: $(wc -l <"$BASELINE") sentencias de deriva conocida."
  exit 0
fi

new="$(LC_ALL=C comm -13 "$BASELINE" "$current")"
fixed="$(LC_ALL=C comm -23 "$BASELINE" "$current")"

if [[ -n "$fixed" ]]; then
  echo "::notice::Deriva corregida respecto a la línea base ($(wc -l <<<"$fixed") sentencias). Encoge la línea base con: scripts/ci/schema-drift.sh --update-baseline"
fi

if [[ -n "$new" ]]; then
  echo "::error::Deriva de esquema NUEVA entre prisma/migrations y prisma/schema:"
  echo "$new"
  echo
  echo "Declara en prisma/schema lo que la migración crea (o crea la migración que falta)."
  exit 1
fi

echo "Sin deriva nueva. Deriva conocida congelada (AF-018): $(wc -l <"$current") sentencias."
