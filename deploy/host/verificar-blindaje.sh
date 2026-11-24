#!/usr/bin/env bash
# Revisión SOLO LECTURA del blindaje del VPS. No cambia nada ni imprime secretos.
#   sudo bash deploy/host/verificar-blindaje.sh
# Sale con 1 si algo falla. Guía: docs/operacion/BLINDAJE-VPS.md, paso 12.
set -uo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Córrelo con sudo." >&2; exit 1; }
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
fails=0
ok() { echo "  OK    $*"; }
ko() { echo "  FALLA $*"; fails=$((fails + 1)); }
aviso() { echo "  AVISO $*"; }
check() { if eval "$2" >/dev/null 2>&1; then ok "$1"; else ko "$1"; fi; }

echo "== SSH"
sshd_cfg="$(sshd -T 2>/dev/null)"
check "root no entra por SSH" "grep -qx 'permitrootlogin no' <<<\"\$sshd_cfg\""
check "sin contraseñas por SSH" "grep -qx 'passwordauthentication no' <<<\"\$sshd_cfg\""
check "sin teclado interactivo" "grep -qx 'kbdinteractiveauthentication no' <<<\"\$sshd_cfg\""
check "solo entra $DEPLOY_USER" "grep -qx 'allowusers $DEPLOY_USER' <<<\"\$sshd_cfg\""
check "$DEPLOY_USER tiene llave SSH" "grep -qE '^(ssh-|ecdsa-|sk-)' /home/$DEPLOY_USER/.ssh/authorized_keys"

echo "== Firewall y fail2ban"
ufw_out="$(ufw status verbose 2>/dev/null)"
check "ufw activo" "grep -q 'Status: active' <<<\"\$ufw_out\""
check "ufw niega lo entrante por defecto" "grep -q 'deny (incoming)' <<<\"\$ufw_out\""
extra="$(grep -E 'ALLOW|LIMIT' <<<"$ufw_out" | grep -vE '^22/tcp' || true)"
[ -z "$extra" ] && ok "ufw solo abre SSH" || aviso "ufw abre algo más que SSH: $(tr '\n' ';' <<<"$extra")"
check "fail2ban vigila SSH" "fail2ban-client status sshd"

echo "== Origen solo desde Cloudflare"
check "puertos 80/443 cerrados a todo lo que no sea Cloudflare" "iptables -S DOCKER-USER | grep -q adoptafacil-cloudflare"
check "rangos de Cloudflare cargados" "[ \"\$(iptables -S AF-CLOUDFLARE | grep -c RETURN)\" -ge 10 ]"
check "se reaplica al reiniciar" "systemctl is-enabled adoptafacil-cloudflare-origen.service"

echo "== Puertos que escuchan fuera del servidor"
listening="$(ss -Htuln | awk '{print $5}' | grep -vE '^(127\.|\[::1\]|\[?::ffff:127\.)' | sed -E 's/.*:([0-9]+)$/\1/' | sort -un | tr '\n' ' ')"
unexpected="$(tr ' ' '\n' <<<"$listening" | grep -vxE '22|80|443|68|546|' || true)"
[ -z "$unexpected" ] && ok "solo 22, 80 y 443 ($listening)" || ko "puertos inesperados: $(tr '\n' ' ' <<<"$unexpected")"

echo "== Sistema"
check "parches automáticos activos" "grep -q 'Unattended-Upgrade \"1\"' /etc/apt/apt.conf.d/20auto-upgrades"
[ -f /var/run/reboot-required ] && aviso "hay un reinicio pendiente (se hará solo a las 04:00 hora Colombia)" || ok "sin reinicio pendiente"
check "swap activa" "swapon --show | grep -q ."
check "hora del servidor en UTC" "[ \"\$(timedatectl show -p Timezone --value)\" = UTC ]"

echo "== Docker"
dinfo="$(docker info --format '{{json .SecurityOptions}} {{.LiveRestoreEnabled}}' 2>/dev/null)"
check "no-new-privileges por defecto" "grep -q 'no-new-privileges' /etc/docker/daemon.json"
check "live-restore" "grep -q 'true$' <<<\"\$dinfo\""
id -nG "$DEPLOY_USER" 2>/dev/null | grep -qw docker && ko "$DEPLOY_USER está en el grupo docker (equivale a root)" || ok "$DEPLOY_USER fuera del grupo docker"

if [ -f "$REPO/deploy/.env" ]; then
  echo "== Aplicación"
  for f in "$REPO/deploy/.env" "$REPO/deploy/api.env"; do
    [ -f "$f" ] || { ko "no existe $(basename "$f")"; continue; }
    perm="$(stat -c %a "$f")"
    [[ "$perm" == 600 || "$perm" == 400 ]] && ok "$(basename "$f") con permisos $perm" || ko "$(basename "$f") con permisos $perm (usa chmod 600)"
  done
  check "PORTALS_TLS=cloudflare (certificados por DNS)" "grep -qx 'PORTALS_TLS=cloudflare' '$REPO/deploy/.env'"
  grep -qx 'CUSTOM_DOMAINS=on' "$REPO/deploy/.env" && ko "CUSTOM_DOMAINS=on con el origen cerrado a Cloudflare: los dominios propios no cargarían (usa cloudflare)" || ok "dominios propios compatibles con el origen cerrado"
  check "secretos fuera de git" "! git -C '$REPO' ls-files --error-unmatch deploy/.env deploy/api.env"
  pubs="$(docker compose -f "$REPO/deploy/compose.yaml" --env-file "$REPO/deploy/.env" ps --format '{{.Service}} {{.Publishers}}' 2>/dev/null | grep -E '0\.0\.0\.0|::' | awk '{print $1}' | sort -u | tr '\n' ' ')"
  [[ "$pubs" == "caddy " ]] && ok "solo caddy publica puertos" || ko "servicios con puertos públicos: ${pubs:-ninguno (¿la pila está arriba?)}"
  cron="$(crontab -l 2>/dev/null || true)"
  for s in backup.sh restore-test.sh monitor.sh; do
    grep -q "$s" <<<"$cron" && ok "cron de $s" || ko "falta el cron de $s"
  done
fi

echo
if [ "$fails" -gt 0 ]; then echo "Blindaje: $fails falla(s)."; exit 1; fi
echo "Blindaje OK"
