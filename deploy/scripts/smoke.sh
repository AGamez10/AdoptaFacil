#!/usr/bin/env bash
# Prueba de humo DESPUÉS de desplegar, contra el dominio público real.
# Sale con 1 si algo falla. No crea datos ni mueve dinero.
#   deploy/scripts/smoke.sh            # usa APP_DOMAIN de deploy/.env
#   EXPECT_PAYMENTS=true deploy/scripts/smoke.sh   # cuando los pagos ya estén encendidos
. "$(dirname "$0")/lib.sh"

BASE="https://$APP_DOMAIN"
EXPECT_PAYMENTS="${EXPECT_PAYMENTS:-false}"
fails=0
ok() { echo "  OK   $*"; }
ko() { echo "  FALLA $*"; fails=$((fails + 1)); }
check() { if eval "$2" >/dev/null 2>&1; then ok "$1"; else ko "$1"; fi; }

echo "Humo sobre $BASE (release ${RELEASE:-?})"

health="$(curl -fsS -m 10 "$BASE/api/health" || true)"
[[ "$health" == *'"status":"ok"'* ]] && ok "API /health ok" || ko "API /health: ${health:-sin respuesta}"

check "La web carga (200 con HTML)" "curl -fsS -m 10 '$BASE/' | grep -qi '<html'"
check "http redirige a https" "curl -sI -m 10 'http://$APP_DOMAIN/' | grep -qiE '^location: https://'"
check "www redirige al dominio" "curl -sI -m 10 'https://www.$APP_DOMAIN/' | grep -qiE '^location: https://$APP_DOMAIN'"

hdrs="$(curl -sI -m 10 "$BASE/" || true)"
for h in strict-transport-security x-content-type-options; do
  grep -qi "^$h:" <<<"$hdrs" && ok "cabecera $h" || ko "falta la cabecera $h"
done

issuer="$(echo | openssl s_client -connect "$APP_DOMAIN:443" -servername "$APP_DOMAIN" 2>/dev/null | openssl x509 -noout -issuer 2>/dev/null || true)"
[[ "$issuer" == *"Let's Encrypt"* || "$issuer" == *"ZeroSSL"* || "$issuer" == *"Google Trust"* ]] \
  && ok "certificado público ($issuer)" || ko "certificado no público: ${issuer:-ilegible}"

if [ "${PORTALS_TLS:-off}" != "off" ]; then
  check "portal por subdominio responde" "curl -fsS -m 10 'https://prueba.$APP_DOMAIN/api/health' | grep -q '\"status\":\"ok\"'"
fi

features="$(curl -fsS -m 10 "$BASE/api/public/config/features" || true)"
if [ -z "$features" ]; then
  ko "no responde /api/public/config/features"
else
  pay="$(python3 -c 'import json,sys; print(str(json.load(sys.stdin)["features"].get("payments")).lower())' <<<"$features" 2>/dev/null || echo '?')"
  [ "$pay" == "$EXPECT_PAYMENTS" ] && ok "pagos = $pay (esperado $EXPECT_PAYMENTS)" || ko "pagos = $pay, se esperaba $EXPECT_PAYMENTS"
fi

# Rutas privadas sin sesión: deben pedir autenticación, nunca devolver datos.
code="$(curl -s -o /dev/null -w '%{http_code}' -m 10 "$BASE/api/platform/organizations" || true)"
[[ "$code" == 401 || "$code" == 403 ]] && ok "rutas de plataforma exigen sesión ($code)" || ko "/api/platform/organizations respondió $code sin sesión"

# Solo Caddy publica puertos hacia fuera del VPS.
pubs="$(compose ps --format '{{.Service}} {{.Publishers}}' 2>/dev/null | grep '0.0.0.0' | awk '{print $1}' | sort -u | tr '\n' ' ')"
[[ "$pubs" == "caddy " ]] && ok "solo caddy publica puertos" || ko "servicios con puertos públicos: ${pubs:-ninguno}"

compose logs migrate 2>/dev/null | grep -q 'postura RLS verificada' && ok "postura RLS verificada en migrate" || ko "migrate no reportó 'postura RLS verificada'"

if [ "$fails" -gt 0 ]; then echo "Humo: $fails falla(s)."; exit 1; fi
echo "Humo OK"
