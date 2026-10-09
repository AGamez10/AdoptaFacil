#!/usr/bin/env bash
# Vigilancia desde el propio VPS (R3-3, OPS-002). Ver docs/operacion/MONITOREO.md.
# Alerta por webhook SOLO cuando cambia el estado (nuevo problema o recuperación),
# para no inundar el teléfono. No sustituye a un monitor EXTERNO de uptime: si
# el VPS se cae, este script se cae con él.
# Cron sugerido (cada 5 minutos):
#   */5 * * * * /opt/adoptafacil/deploy/scripts/monitor.sh >> /var/log/adoptafacil-monitor.log 2>&1
. "$(dirname "$0")/lib.sh"

STATE_FILE="${MONITOR_STATE_FILE:-/var/tmp/adoptafacil-monitor.state}"
DISK_MAX_PCT="${MONITOR_DISK_MAX_PCT:-85}"
BACKUP_MAX_AGE_H="${MONITOR_BACKUP_MAX_AGE_H:-26}"
TLS_MIN_DAYS="${MONITOR_TLS_MIN_DAYS:-14}"
ERRORS_MAX="${MONITOR_API_ERRORS_MAX:-20}"
problems=()

# 1. La API responde por HTTPS a través de Caddy, con base de datos y Redis arriba.
health="$(curl -fsS -m 10 "https://$APP_DOMAIN/api/health" 2>/dev/null || true)"
[[ "$health" == *'"status":"ok"'* ]] || problems+=("API /health no responde ok: ${health:-sin respuesta}")

# 2. Contenedores en marcha y sanos.
for svc in caddy api postgres redis; do
  state="$(compose ps -a --format '{{.State}} {{.Health}}' "$svc" 2>/dev/null || true)"
  [[ "$state" == running* && "$state" != *unhealthy* ]] || problems+=("contenedor $svc: ${state:-no existe}")
done

# 3. Disco (raíz y datos de Docker).
for path in / /var/lib/docker; do
  [ -d "$path" ] || continue
  pct="$(df --output=pcent "$path" | tail -n1 | tr -dc '0-9')"
  [ "$pct" -lt "$DISK_MAX_PCT" ] || problems+=("disco $path al ${pct}%")
done

# 4. Respaldo reciente.
latest="$(ls -1t "$BACKUP_DIR"/db-*.dump.age 2>/dev/null | head -n1 || true)"
if [ -z "$latest" ]; then
  problems+=("no hay ningún respaldo en $BACKUP_DIR")
else
  age_h=$((($(date +%s) - $(stat -c %Y "$latest")) / 3600))
  [ "$age_h" -lt "$BACKUP_MAX_AGE_H" ] || problems+=("último respaldo hace ${age_h} h")
fi

# 5. Certificado TLS.
not_after="$(echo | openssl s_client -connect "$APP_DOMAIN:443" -servername "$APP_DOMAIN" 2>/dev/null |
  openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || true)"
if [ -n "$not_after" ]; then
  days=$((($(date -d "$not_after" +%s) - $(date +%s)) / 86400))
  [ "$days" -ge "$TLS_MIN_DAYS" ] || problems+=("certificado TLS vence en $days días")
else
  problems+=("no se pudo leer el certificado TLS de $APP_DOMAIN")
fi

# 6. Ráfaga de errores de la API en los últimos 5 minutos (solo se cuentan
#    líneas; nunca se reenvía su contenido, que puede traer datos personales).
api_id="$(compose ps -q api 2>/dev/null || true)"
if [ -n "$api_id" ]; then
  errors="$(docker logs --since 5m "$api_id" 2>&1 | grep -c ' ERROR ' || true)"
  [ "$errors" -le "$ERRORS_MAX" ] || problems+=("$errors errores de la API en 5 min")
fi

current="$(printf '%s\n' "${problems[@]+"${problems[@]}"}" | sed '/^$/d' | LC_ALL=C sort)"
previous="$(cat "$STATE_FILE" 2>/dev/null || true)"
printf '%s' "$current" >"$STATE_FILE"

stamp="$(date -u +%FT%TZ)"
if [ -n "$current" ]; then
  echo "$stamp PROBLEMAS: $(tr '\n' ';' <<<"$current")"
  [ "$current" == "$previous" ] || alert "$(printf 'Problemas:\n%s' "$current")"
  exit 1
fi
echo "$stamp OK"
[ -z "$previous" ] || alert "Recuperado: todo en orden de nuevo"
