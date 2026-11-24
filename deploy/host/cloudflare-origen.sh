#!/usr/bin/env bash
# Cierra los puertos 80/443 del VPS a todo lo que no sea Cloudflare (H-CF-02).
# Quien conozca la IP del servidor ya no puede saltarse el WAF ni el límite de
# peticiones de Cloudflare. Guía: docs/operacion/BLINDAJE-VPS.md, paso 6.
#
#   sudo bash deploy/host/cloudflare-origen.sh instalar   # una vez (servicio + revisión semanal)
#   sudo adoptafacil-cloudflare-origen estado             # ver las reglas
#   sudo adoptafacil-cloudflare-origen quitar             # abrir de nuevo (diagnóstico)
#   sudo adoptafacil-cloudflare-origen aplicar            # volver a cerrar
#
# Por qué en DOCKER-USER y no en ufw: Docker publica los puertos de Caddy con
# sus propias reglas de iptables y se salta ufw. DOCKER-USER es la cadena que
# Docker reserva para filtrar antes que las suyas, y no la borra al reiniciar.
#
# Requisitos: TODOS los registros del sitio (@, www y *) con la nube NARANJA en
# Cloudflare y PORTALS_TLS=cloudflare (certificados por DNS-01). Los dominios
# propios de las organizaciones Pro van con CUSTOM_DOMAINS=cloudflare (Cloudflare
# for SaaS); con CUSTOM_DOMAINS=on llegarían directo y quedarían bloqueados.
set -euo pipefail

CHAIN=AF-CLOUDFLARE
TAG=adoptafacil-cloudflare
STATE_DIR=/etc/adoptafacil
BIN=/usr/local/sbin/adoptafacil-cloudflare-origen
UNIT=adoptafacil-cloudflare-origen

# Último recurso si cloudflare.com no responde y no hay copia guardada. Misma
# lista que trusted_proxies en deploy/Caddyfile (https://www.cloudflare.com/ips/).
FALLBACK_V4="173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 188.114.96.0/20 197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13 104.24.0.0/14 172.64.0.0/13 131.0.72.0/22"
FALLBACK_V6="2400:cb00::/32 2606:4700::/32 2803:f800::/32 2405:b500::/32 2405:8100::/32 2a06:98c0::/29 2c0f:f248::/32"

[ "$(id -u)" -eq 0 ] || { echo "Córrelo con sudo." >&2; exit 1; }

iface() { ip route show default | awk '{print $5; exit}'; }

# Descarga la lista oficial; si falla o llega rara, usa la guardada o la de respaldo.
rangos() { # $1 = v4|v6
  local fam="$1" url="https://www.cloudflare.com/ips-$1" cache="$STATE_DIR/cloudflare-ips-$1" re list
  if [ "$fam" = v4 ]; then re='^[0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2}$'; else re='^[0-9a-fA-F:]+/[0-9]{1,3}$'; fi
  list="$(curl -fsS -m 20 "$url" 2>/dev/null | tr -d '\r' | grep -E "$re" || true)"
  if [ "$(wc -l <<<"$list")" -ge 5 ]; then
    install -d -m 755 "$STATE_DIR" && printf '%s\n' "$list" >"$cache"
  elif [ -s "$cache" ]; then
    echo "AVISO: no pude descargar $url; uso la copia guardada" >&2
    list="$(cat "$cache")"
  else
    echo "AVISO: no pude descargar $url; uso la lista incluida en el script" >&2
    if [ "$fam" = v4 ]; then list="$(tr ' ' '\n' <<<"$FALLBACK_V4")"; else list="$(tr ' ' '\n' <<<"$FALLBACK_V6")"; fi
  fi
  printf '%s\n' "$list"
}

quitar_saltos() { # $1 = iptables|ip6tables
  local ipt="$1"
  { $ipt -S DOCKER-USER 2>/dev/null || true; } | { grep -- "$TAG" || true; } | sed 's/^-A /-D /' | while read -r rule; do
    # shellcheck disable=SC2086
    $ipt $rule
  done
}

aplicar_familia() { # $1 = iptables|ip6tables  $2 = v4|v6
  local ipt="$1" fam="$2" dev r
  command -v "$ipt" >/dev/null || return 0
  dev="$(iface)"
  [ -n "$dev" ] || { echo "No encontré la interfaz de red pública" >&2; exit 1; }
  $ipt -N DOCKER-USER 2>/dev/null || true # Docker la reutiliza si ya existe
  $ipt -N "$CHAIN" 2>/dev/null || $ipt -F "$CHAIN"
  while read -r r; do
    [ -n "$r" ] && $ipt -A "$CHAIN" -s "$r" -j RETURN
  done < <(rangos "$fam")
  $ipt -A "$CHAIN" -j DROP
  quitar_saltos "$ipt"
  # Solo conexiones NUEVAS que entran por la interfaz pública a los puertos
  # publicados por Caddy (puerto original, antes del DNAT de Docker). El tráfico
  # interno de los contenedores y sus respuestas no pasan por aquí.
  for proto_port in tcp:443 tcp:80 udp:443; do
    $ipt -I DOCKER-USER -i "$dev" -p "${proto_port%%:*}" -m conntrack --ctstate NEW \
      --ctorigdstport "${proto_port##*:}" -m comment --comment "$TAG" -j "$CHAIN"
  done
}

aplicar() {
  aplicar_familia iptables v4
  aplicar_familia ip6tables v6
  echo "Origen cerrado: 80/443 solo desde Cloudflare ($(iptables -S "$CHAIN" | grep -c RETURN) rangos IPv4)."
}

quitar() {
  for ipt in iptables ip6tables; do
    command -v "$ipt" >/dev/null || continue
    quitar_saltos "$ipt"
    $ipt -F "$CHAIN" 2>/dev/null || true
    $ipt -X "$CHAIN" 2>/dev/null || true
  done
  echo "Origen ABIERTO a todo Internet. Vuelve a cerrarlo con: sudo $BIN aplicar"
}

estado() {
  echo "== DOCKER-USER (IPv4)"; iptables -S DOCKER-USER 2>/dev/null || echo "(no existe)"
  echo "== $CHAIN (IPv4): $(iptables -S "$CHAIN" 2>/dev/null | grep -c RETURN || true) rangos de Cloudflare"
  echo "== servicio"; systemctl is-enabled "$UNIT.service" 2>/dev/null || true
  systemctl list-timers "$UNIT.timer" --no-pager 2>/dev/null | sed -n 1,2p || true
}

instalar() {
  install -m 755 "$0" "$BIN"
  cat >/etc/systemd/system/$UNIT.service <<EOF
[Unit]
Description=AdoptaFácil: puertos 80/443 solo desde Cloudflare
After=docker.service network-online.target
Wants=network-online.target
PartOf=docker.service

[Service]
Type=oneshot
ExecStart=$BIN aplicar
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target docker.service
EOF
  cat >/etc/systemd/system/$UNIT.timer <<EOF
[Unit]
Description=AdoptaFácil: refrescar los rangos de Cloudflare cada semana

[Timer]
OnCalendar=Mon 08:30 UTC
Persistent=true
Unit=$UNIT-refresco.service

[Install]
WantedBy=timers.target
EOF
  cat >/etc/systemd/system/$UNIT-refresco.service <<EOF
[Unit]
Description=AdoptaFácil: refrescar los rangos de Cloudflare
After=docker.service

[Service]
Type=oneshot
ExecStart=$BIN aplicar
EOF
  systemctl daemon-reload
  systemctl enable "$UNIT.service" "$UNIT.timer" >/dev/null
  systemctl restart "$UNIT.service"
  systemctl start "$UNIT.timer"
  estado
}

case "${1:-}" in
  instalar) instalar ;;
  aplicar) aplicar ;;
  quitar) quitar ;;
  estado) estado ;;
  *) echo "uso: $0 instalar|aplicar|quitar|estado" >&2; exit 2 ;;
esac
