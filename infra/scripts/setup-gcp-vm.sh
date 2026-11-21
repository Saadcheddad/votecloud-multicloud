#!/usr/bin/env bash
# ==============================================================================
# VoteCloud - Script d'installation automatisée pour IaaS #1 (GCP Compute Engine)
# OS cible : Ubuntu 22.04 LTS / 24.04 LTS (Machine e2-micro Always Free)
# ==============================================================================
# Usage sur la VM GCP (après `git clone` du projet dans ~/votecloud) :
#   cd ~/votecloud
#   chmod +x infra/scripts/setup-gcp-vm.sh
#   sudo ./infra/scripts/setup-gcp-vm.sh
# ==============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
BACKEND_DIR="$APP_DIR/backend-auth"
SERVICE_USER="${SUDO_USER:-$USER}"

echo "=== [1/6] Mise à jour de l'OS Ubuntu et installation des prérequis ==="
apt-get update -y
apt-get install -y curl git nginx ufw ca-certificates gnupg

echo "=== [2/6] Installation de Node.js 20 LTS ==="
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1)" != "v20" ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node -v
npm -v

echo "=== [3/6] Durcissement pare-feu OS (UFW) : ports 22, 80, 443 uniquement ==="
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status verbose

echo "=== [4/6] Installation des dépendances backend-auth ==="
cd "$BACKEND_DIR"
sudo -u "$SERVICE_USER" npm install --omit=dev

if [ ! -f "$BACKEND_DIR/.env" ]; then
  cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
  chown "$SERVICE_USER:$SERVICE_USER" "$BACKEND_DIR/.env"
  chmod 600 "$BACKEND_DIR/.env"
  echo ">>> ATTENTION : Éditez $BACKEND_DIR/.env avec vos vraies clés avant de redémarrer le service !"
fi

echo "=== [5/6] Configuration du Reverse Proxy Nginx (port 80 -> 127.0.0.1:3001) ==="
cp "$APP_DIR/infra/nginx/gcp-auth.conf" /etc/nginx/sites-available/votecloud-auth
ln -sf /etc/nginx/sites-available/votecloud-auth /etc/nginx/sites-enabled/votecloud-auth
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl restart nginx

echo "=== [6/6] Création du service systemd votecloud-auth ==="
cat >/etc/systemd/system/votecloud-auth.service <<EOF
[Unit]
Description=VoteCloud Backend Auth & Elections (IaaS #1 - GCP Compute Engine)
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$BACKEND_DIR
EnvironmentFile=$BACKEND_DIR/.env
ExecStart=/usr/bin/node $BACKEND_DIR/src/server.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable votecloud-auth
systemctl restart votecloud-auth

echo ""
echo "=============================================================================="
echo "IaaS #1 (GCP Compute Engine) configuré avec succès !"
echo "1. Vérifiez/éditez les variables : nano $BACKEND_DIR/.env"
echo "2. Redémarrez après édition      : sudo systemctl restart votecloud-auth"
echo "3. Vérifiez les logs en direct   : sudo journalctl -u votecloud-auth -f"
echo "4. Testez la santé locale        : curl -s http://127.0.0.1/health | head -c 400"
echo "=============================================================================="
