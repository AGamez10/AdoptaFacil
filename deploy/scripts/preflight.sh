#!/usr/bin/env bash
# Revisión ANTES de desplegar: falla con un mensaje claro si deploy/.env o
# deploy/api.env tienen un valor obligatorio vacío, un secreto corto o una
# combinación que la API rechazaría al arrancar. No imprime ningún secreto.
#   deploy/scripts/preflight.sh
. "$(dirname "$0")/lib.sh"

API_ENV_FILE="${API_ENV_FILE:-$DEPLOY_DIR/api.env}"
errors=()
warnings=()
err() { errors+=("$*"); }
warn() { warnings+=("$*"); }

# --- deploy/.env -------------------------------------------------------------
for key in APP_DOMAIN ACME_EMAIL POSTGRES_PASSWORD APP_DB_PASSWORD JWT_SECRET SIGNATURE_ENCRYPTION_KEY; do
  [ -n "${!key:-}" ] || err "deploy/.env: falta $key"
done
for key in POSTGRES_PASSWORD APP_DB_PASSWORD JWT_SECRET; do
  v="${!key:-}"
  [ -z "$v" ] || [ "${#v}" -ge 24 ] || err "deploy/.env: $key tiene ${#v} caracteres; usa openssl rand -hex 24"
done
[[ "${APP_DB_PASSWORD:-}" =~ ^[A-Za-z0-9]*$ ]] || err "deploy/.env: APP_DB_PASSWORD solo admite letras y números"
[[ "${SIGNATURE_ENCRYPTION_KEY:-}" =~ ^[0-9a-fA-F]{64}$ ]] || err "deploy/.env: SIGNATURE_ENCRYPTION_KEY debe ser openssl rand -hex 32 (64 hex)"
[[ "${APP_DOMAIN:-}" != http* && "${APP_DOMAIN:-}" != */* ]] || err "deploy/.env: APP_DOMAIN va sin https:// ni barras"
[[ "${APP_DOMAIN:-}" != "localhost" ]] || err "deploy/.env: APP_DOMAIN=localhost no sirve en producción"

case "${PORTALS_TLS:-off}" in
  off) warn "PORTALS_TLS=off: los portales quedan en /o/<slug>, sin subdominio" ;;
  cloudflare) [ -n "${CLOUDFLARE_API_TOKEN:-}" ] || err "deploy/.env: PORTALS_TLS=cloudflare exige CLOUDFLARE_API_TOKEN" ;;
  namecheap) for k in NAMECHEAP_API_USER NAMECHEAP_API_KEY NAMECHEAP_CLIENT_IP; do [ -n "${!k:-}" ] || err "deploy/.env: falta $k"; done ;;
  internal) err "deploy/.env: PORTALS_TLS=internal es solo para pruebas" ;;
  *) err "deploy/.env: PORTALS_TLS=${PORTALS_TLS} no es válido" ;;
esac

[ -n "${BACKUP_AGE_RECIPIENT:-}" ] || err "deploy/.env: falta BACKUP_AGE_RECIPIENT (sin él no hay respaldo cifrado)"
[ -n "${BACKUP_RCLONE_REMOTE:-}" ] || warn "BACKUP_RCLONE_REMOTE vacío: los respaldos se quedan solo en el VPS"
[ -n "${ALERT_WEBHOOK_URL:-}" ] || warn "ALERT_WEBHOOK_URL vacío: las alertas solo quedan en el log"
[ -n "${BACKUP_HEALTHCHECK_URL:-}" ] || warn "BACKUP_HEALTHCHECK_URL vacío: nadie avisa si el respaldo no corre"

# --- deploy/api.env (se lee sin exportarlo a este shell) ---------------------
if [ ! -f "$API_ENV_FILE" ]; then
  err "no existe $API_ENV_FILE (cp deploy/api.env.example deploy/api.env)"
else
  # Una línea KEY= vacía hace que la API no arranque (BLD-001).
  while IFS= read -r line; do err "api.env: '$line' está vacía; bórrala o ponle valor"; done \
    < <(grep -nE '^[A-Z0-9_]+=\s*$' "$API_ENV_FILE" | cut -d= -f1 | sed 's/^\([0-9]*\):/línea \1: /')
  aget() { grep -E "^$1=" "$API_ENV_FILE" | tail -n1 | cut -d= -f2- || true; }
  for k in AUTH_IDENTITY_DRIVER PAYMENT_DRIVER DIAN_DRIVER SIGNATURE_DRIVER NOTIFICATION_DRIVER STORAGE_DRIVER; do
    case "$(aget "$k")" in fake|log|stub) err "api.env: $k=$(aget "$k") es simulado y la API no arranca así en producción" ;; esac
  done
  [ "$(aget NOTIFICATION_DRIVER)" == "smtp" ] || err "api.env: NOTIFICATION_DRIVER debe ser smtp en producción"
  for k in SMTP_HOST SMTP_PORT SMTP_FROM; do [ -n "$(aget "$k")" ] || err "api.env: falta $k (correo)"; done
  if [ "$(aget STORAGE_DRIVER)" == "s3" ]; then
    for k in S3_ENDPOINT S3_BUCKET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY; do [ -n "$(aget "$k")" ] || err "api.env: STORAGE_DRIVER=s3 exige $k"; done
  else
    warn "STORAGE_DRIVER no es s3: los archivos quedan en el disco del VPS (se recomienda R2)"
  fi
  [ "$(aget AUTH_IDENTITY_DRIVER)" != "google" ] || [ -n "$(aget GOOGLE_OAUTH_CLIENT_ID)" ] || err "api.env: AUTH_IDENTITY_DRIVER=google exige GOOGLE_OAUTH_CLIENT_ID"

  payments="$(aget FEATURE_PAYMENTS)"; sponsor="$(aget FEATURE_SPONSORSHIPS)"
  if [ "$payments" == "true" ] || [ "$sponsor" == "true" ]; then
    [ -n "$(aget PAYMENTS_PRODUCTION_APPROVAL_REF)" ] || err "api.env: pagos encendidos sin PAYMENTS_PRODUCTION_APPROVAL_REF"
    if [ "$(aget PAYMENT_DRIVER)" == "mercadopago" ]; then
      for k in MERCADOPAGO_CLIENT_ID MERCADOPAGO_CLIENT_SECRET MERCADOPAGO_WEBHOOK_SECRET API_PUBLIC_BASE_URL; do
        [ -n "$(aget "$k")" ] || err "api.env: Mercado Pago exige $k"
      done
      [ "$(aget MERCADOPAGO_TEST)" != "true" ] || warn "MERCADOPAGO_TEST=true: Mercado Pago está en sandbox"
      [[ "$(aget API_PUBLIC_BASE_URL)" == "https://${APP_DOMAIN:-}/api" ]] || warn "API_PUBLIC_BASE_URL no es https://${APP_DOMAIN:-?}/api (Caddy publica la API bajo /api)"
    fi
  else
    warn "Pagos apagados (FEATURE_PAYMENTS y FEATURE_SPONSORSHIPS sin true): nadie puede donar"
  fi
  [ "$(aget FEATURE_VOLUNTEERING_MINORS)" != "true" ] || err "api.env: voluntariado con menores no se permite en producción"
  [ "$(aget PLAN_ENFORCEMENT)" != "true" ] || warn "PLAN_ENFORCEMENT=true: los planes se cobran/limitan desde PLAN_LAUNCH_DATE"
fi

# --- Permisos de los archivos con secretos -----------------------------------
for f in "$ENV_FILE" "$API_ENV_FILE"; do
  [ -f "$f" ] || continue
  perm="$(stat -c %a "$f")"
  [ "$perm" == "600" ] || [ "$perm" == "400" ] || err "$(basename "$f") tiene permisos $perm; usa chmod 600"
done

for w in "${warnings[@]+"${warnings[@]}"}"; do echo "AVISO: $w"; done
if [ "${#errors[@]}" -gt 0 ]; then
  for e in "${errors[@]}"; do echo "ERROR: $e" >&2; done
  echo "Preflight: ${#errors[@]} error(es). No despliegues todavía." >&2
  exit 1
fi
echo "Preflight OK"
