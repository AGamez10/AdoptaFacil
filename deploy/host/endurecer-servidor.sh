#!/usr/bin/env bash
# Endurece un VPS Ubuntu 24.04 recién creado para AdoptaFácil. Se corre UNA vez,
# como root, con la sesión SSH de root abierta hasta probar el acceso nuevo.
# Guía completa: docs/operacion/BLINDAJE-VPS.md.
#
#   sudo bash deploy/host/endurecer-servidor.sh
#
# Qué hace (todo idempotente: correrlo de nuevo no rompe nada):
#   1. Parches del sistema y paquetes básicos (git, age, rclone, fail2ban…).
#   2. Usuario `deploy` con sudo (pide su contraseña) y la misma llave SSH de root.
#   3. SSH solo con llave, sin root y solo para `deploy`.
#   4. ufw: entra solo SSH (con límite de intentos). Los puertos 80/443 los
#      publica Docker, que se salta ufw: los cierra a Cloudflare
#      deploy/host/cloudflare-origen.sh.
#   5. fail2ban para SSH (bloqueo creciente para quien insiste).
#   6. Parches de seguridad automáticos, con reinicio a las 04:00 hora Colombia.
#   7. Ajustes del kernel (red y fugas de información), swap y journald acotado.
#   8. Docker desde el repositorio oficial, con logs rotados, live-restore y
#      no-new-privileges.
#
# Variables opcionales: DEPLOY_USER (deploy), SWAP_GB (4).
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"
SWAP_GB="${SWAP_GB:-4}"

paso() { printf '\n==> %s\n' "$*"; }
falla() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || falla "córrelo como root (sudo bash $0)"
. /etc/os-release
[ "${ID:-}" = ubuntu ] || falla "este script es para Ubuntu (encontré ${ID:-?})"
[ "${VERSION_ID:-}" = 24.04 ] || echo "AVISO: probado en Ubuntu 24.04; este es ${VERSION_ID:-?}"
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a

# --- 0. Antes de tocar SSH: tiene que existir una llave para entrar ----------
root_keys=/root/.ssh/authorized_keys
user_home="/home/$DEPLOY_USER"
user_keys="$user_home/.ssh/authorized_keys"
if ! grep -qsE '^(ssh-|ecdsa-|sk-)' "$root_keys" && ! grep -qsE '^(ssh-|ecdsa-|sk-)' "$user_keys"; then
  falla "no hay ninguna llave SSH en $root_keys ni en $user_keys. Agrega tu llave pública en hPanel (VPS → Configuración → Claves SSH) o con ssh-copy-id, y vuelve a correr el script. No sigo: te quedarías por fuera."
fi

# --- 1. Paquetes ---------------------------------------------------------------
paso "1/8 Actualizando el sistema (puede tardar unos minutos)"
apt-get update -q
apt-get -y -q -o Dpkg::Options::=--force-confold upgrade
apt-get -y -q install ca-certificates curl git gnupg jq openssl age rclone \
  ufw fail2ban python3-systemd unattended-upgrades apt-listchanges needrestart
timedatectl set-timezone UTC # UTC en el servidor; la web muestra hora Colombia

# --- 2. Usuario deploy ----------------------------------------------------------
paso "2/8 Usuario $DEPLOY_USER"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos '' "$DEPLOY_USER"
fi
usermod -aG sudo "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$user_home/.ssh"
if ! grep -qsE '^(ssh-|ecdsa-|sk-)' "$user_keys"; then
  install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$root_keys" "$user_keys"
  echo "Copiada la llave de root a $DEPLOY_USER."
fi
chmod 600 "$user_keys" && chown "$DEPLOY_USER:$DEPLOY_USER" "$user_keys"
# sudo pide contraseña: una llave SSH robada sola no da root.
if passwd -S "$DEPLOY_USER" | awk '{exit ($2=="P")?0:1}'; then
  echo "$DEPLOY_USER ya tiene contraseña para sudo."
else
  echo "Crea la contraseña de sudo de $DEPLOY_USER (larga; guárdala en tu gestor de contraseñas):"
  until passwd "$DEPLOY_USER"; do echo "Intenta de nuevo."; done
fi

# --- 3. SSH ----------------------------------------------------------------------
paso "3/8 SSH: solo llave, sin root, solo $DEPLOY_USER"
# 00- para ganarle a 50-cloud-init.conf: sshd se queda con el PRIMER valor que lee.
cat >/etc/ssh/sshd_config.d/00-adoptafacil.conf <<EOF
# AdoptaFácil (deploy/host/endurecer-servidor.sh). No editar a mano.
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitEmptyPasswords no
PubkeyAuthentication yes
AuthenticationMethods publickey
AllowUsers $DEPLOY_USER
MaxAuthTries 3
LoginGraceTime 30
MaxStartups 10:30:60
ClientAliveInterval 300
ClientAliveCountMax 2
X11Forwarding no
AllowAgentForwarding no
AllowTcpForwarding no
PermitTunnel no
EOF
sshd -t || falla "la configuración de SSH no es válida; no la apliqué"
systemctl reload ssh 2>/dev/null || systemctl restart ssh

# --- 4. ufw ----------------------------------------------------------------------
paso "4/8 Firewall ufw (entra solo SSH)"
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw limit 22/tcp comment 'SSH con limite de intentos'
ufw --force enable
ufw status verbose

# --- 5. fail2ban -------------------------------------------------------------------
paso "5/8 fail2ban"
cat >/etc/fail2ban/jail.d/adoptafacil.local <<'EOF'
# AdoptaFácil (deploy/host/endurecer-servidor.sh)
[DEFAULT]
backend = systemd
banaction = ufw
findtime = 10m
maxretry = 4
bantime = 1h
bantime.increment = true
bantime.maxtime = 1w

[sshd]
enabled = true

# Quien vuelve a caer varias veces en un día queda fuera una semana.
[recidive]
enabled = true
backend = auto
logpath = /var/log/fail2ban.log
findtime = 1d
maxretry = 3
bantime = 1w
EOF
systemctl enable --now fail2ban >/dev/null
systemctl restart fail2ban
sleep 2
fail2ban-client status sshd | sed -n 1,4p || true

# --- 6. Parches automáticos ------------------------------------------------------
paso "6/8 Parches de seguridad automáticos"
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
cat >/etc/apt/apt.conf.d/52adoptafacil-unattended <<'EOF'
// AdoptaFácil: si un parche lo exige, reinicia a las 09:00 UTC (04:00 Colombia).
// Los contenedores vuelven solos (restart: unless-stopped).
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "09:00";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
EOF
systemctl enable --now unattended-upgrades >/dev/null

# --- 7. Kernel, swap y journald --------------------------------------------------
paso "7/8 Kernel, swap y logs del sistema"
cat >/etc/sysctl.d/99-adoptafacil.conf <<'EOF'
# AdoptaFácil (deploy/host/endurecer-servidor.sh). No toca ip_forward: Docker lo necesita.
net.ipv4.tcp_syncookies = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0
net.ipv4.conf.all.log_martians = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1
kernel.kptr_restrict = 2
kernel.dmesg_restrict = 1
kernel.unprivileged_bpf_disabled = 1
net.core.bpf_jit_harden = 2
fs.suid_dumpable = 0
vm.swappiness = 10
EOF
sysctl --system >/dev/null
if ! swapon --show | grep -q .; then
  fallocate -l "${SWAP_GB}G" /swapfile
  chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
  echo "Swap de ${SWAP_GB} GB creada (margen para construir las imágenes)."
fi
install -d /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=500M\n' >/etc/systemd/journald.conf.d/adoptafacil.conf
systemctl restart systemd-journald

# --- 8. Docker -------------------------------------------------------------------
paso "8/8 Docker (repositorio oficial)"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get -y -q install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
install -d /etc/docker
cat >/etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" },
  "live-restore": true,
  "no-new-privileges": true,
  "icc": false
}
EOF
systemctl enable docker >/dev/null
systemctl restart docker
# Sin grupo docker para deploy: ese grupo equivale a root. Se usa `sudo docker`.
docker version --format 'Docker {{.Server.Version}}'
docker compose version

cat <<EOF

============================================================================
Listo. ANTES de cerrar esta sesión de root, abre OTRA terminal y prueba:

    ssh $DEPLOY_USER@$(hostname -I | awk '{print $1}')
    sudo whoami        # debe decir: root

Si entra, ya puedes cerrar la sesión de root. Si no entra, NO la cierres:
copia el error en el chat. Con esa sesión abierta se arregla en un minuto.
Siguiente paso: deploy/host/cloudflare-origen.sh (guía, paso 6).
============================================================================
EOF
