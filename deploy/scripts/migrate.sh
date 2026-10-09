#!/usr/bin/env bash
# Paso de migraciones del despliegue (servicio `migrate` de deploy/compose.yaml).
#   1. prisma migrate deploy  (nunca `migrate dev` contra una base con datos)
#   2. rota la contraseña del rol de runtime adoptafacil_app (la migración
#      inicial la deja fija en 'adoptafacil_app'; AF-016)
#   3. verifica la postura RLS (scripts/ci/rls-posture.sql): si falla, el
#      despliegue se detiene y la API no arranca (depends_on en compose).
# Variables: DATABASE_URL (owner), APP_DB_PASSWORD (>= 24 caracteres alfanuméricos).
set -euo pipefail
cd /repo
# CLI de Prisma directo: la red `data` no tiene salida a internet, así que no se
# puede depender de que corepack descargue pnpm en tiempo de ejecución.
PRISMA=/repo/node_modules/.bin/prisma

: "${DATABASE_URL:?DATABASE_URL (rol owner) es obligatoria}"
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD es obligatoria}"
# Solo alfanumérica: se escribe como literal SQL y así no hay nada que escapar.
if ! [[ "$APP_DB_PASSWORD" =~ ^[A-Za-z0-9]{24,}$ ]]; then
  echo "APP_DB_PASSWORD debe tener al menos 24 caracteres alfanuméricos (openssl rand -hex 24)" >&2
  exit 1
fi

echo "==> prisma migrate deploy"
"$PRISMA" migrate deploy

echo "==> rotación de la contraseña de adoptafacil_app"
# Por stdin: la contraseña no aparece en argv ni en los logs.
printf "ALTER ROLE adoptafacil_app WITH LOGIN PASSWORD '%s';\n" "$APP_DB_PASSWORD" |
  "$PRISMA" db execute --stdin --url "$DATABASE_URL" >/dev/null

echo "==> postura RLS"
"$PRISMA" db execute --file scripts/ci/rls-posture.sql --url "$DATABASE_URL"

echo "==> migraciones aplicadas, rol rotado y postura RLS verificada"
