#!/usr/bin/env bash
# Revisión SOLO LECTURA del servidor de producción, desde el PC del dueño (WSL).
# No cambia nada y no imprime secretos: de cada variable dice solo si tiene valor.
#   bash scripts/ops/auditoria-servidor.sh            (pregunta usuario@IP)
#   bash scripts/ops/auditoria-servidor.sh root@1.2.3.4
# El resultado queda también en ~/auditoria.txt.
set -uo pipefail
H="${1:-}"
if [ -z "$H" ]; then read -rp "¿Cómo entras al servidor? (lo que escribes después de ssh, ej. root@1.2.3.4): " H; fi
ssh -t "$H" 'bash -s' <<'EOF' | tee ~/auditoria.txt
cd /opt/adoptafacil 2>/dev/null || cd "$(dirname "$(sudo find / -path '*/deploy/compose.yaml' -not -path '*/node_modules/*' 2>/dev/null | head -1)")/.." || exit 1
echo "== repo: $(pwd)"; git log --oneline -1; git rev-parse --abbrev-ref HEAD
echo "== servidor"; nproc; free -h | head -2; df -h / | tail -1
echo "== servicios"; sudo docker compose -f deploy/compose.yaml --env-file deploy/.env ps --format '{{.Service}} {{.State}} {{.Health}}'
echo "== deploy/.env"; sudo awk -F= '/^[A-Z_]+=/{print $1, (length($2)>0?"con valor":"VACIA")}' deploy/.env
echo "== deploy/api.env"; sudo awk -F= '/^[A-Z_]+=/{print $1, (length($2)>0?"con valor":"VACIA")}' deploy/api.env
echo "== valores no secretos"; sudo grep -hE '^(APP_DOMAIN|PORTALS_TLS|VITE_PAYMENT_PROVIDER|BACKUP_RCLONE_REMOTE|NOTIFICATION_DRIVER|SMTP_HOST|SMTP_FROM|STORAGE_DRIVER|S3_BUCKET|PAYMENT_DRIVER|FEATURE_[A-Z_]+|PLAN_ENFORCEMENT)=' deploy/.env deploy/api.env
echo "== cron"; sudo crontab -l 2>&1 | grep -v '^#'
echo "== respaldos"; ls -lt deploy/backups 2>/dev/null | head -4; sudo rclone listremotes 2>&1
echo "== fotos en disco"; sudo find /var/lib/docker/volumes/adoptafacil_api_storage/_data -type f 2>/dev/null | wc -l
echo "== herramientas"; which age rclone
echo "== salud"; curl -s "https://$(sudo grep -h '^APP_DOMAIN=' deploy/.env | cut -d= -f2)/api/health"; echo
EOF
