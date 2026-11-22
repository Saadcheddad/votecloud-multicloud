#!/usr/bin/env bash
# ==============================================================================
# VoteCloud - Script d'installation automatisée pour IaaS #1 (Oracle Cloud OCI)
# OS cible : Ubuntu 22.04 LTS / 24.04 LTS (VM.Standard.E2.1.Micro Always Free)
# ==============================================================================
# Usage sur la VM OCI (après `git clone` du projet dans ~/votecloud) :
#   cd ~/votecloud
#   chmod +x infra/scripts/setup-oci-vm.sh
#   sudo ./infra/scripts/setup-oci-vm.sh
# ==============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
BACKEND_DIR="$APP_DIR/backend-auth"
SERVICE_USER="${SUDO_USER:-ubuntu}"

echo "=== [1/7] Mise à jour de l'OS Ubuntu et installation des prérequis ==="
apt-get update -y
apt-get install -y curl git nginx ca-certificates gnupg iptables-persistent

echo "=== [2/7] Installation de Node.js 20 LTS ==="
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1)" != "v20" ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node -v
npm -v

echo "=== [3/7] Ouverture des ports 80/443 dans iptables (spécifique aux images Ubuntu OCI) ==="
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT || true
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT || true
netfilter-persistent save || true

echo "=== [4/7] Installation des dépendances backend-auth ==="
cd "$BACKEND_DIR"
sudo -u "$SERVICE_USER" npm install --omit=dev

if [ ! -f "$BACKEND_DIR/.env" ]; then
  cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
  chown "$SERVICE_USER:$SERVICE_USER" "$BACKEND_DIR/.env"
  chmod 600 "$BACKEND_DIR/.env"
  echo ">>> ATTENTION : Éditez $BACKEND_DIR/.env avec vos vraies clés avant de redémarrer le service !"
fi

echo "=== [5/7] Configuration du Reverse Proxy Nginx (port 80 -> 127.0.0.1:3001) ==="
cp "$APP_DIR/infra/nginx/gcp-auth.conf" /etc/nginx/sites-available/votecloud-auth
sed -i 's/GCP-Compute-Engine-IaaS-Nginx/OCI-Compute-IaaS-Nginx/g' /etc/nginx/sites-available/votecloud-auth
ln -sf /etc/nginx/sites-available/votecloud-auth /etc/nginx/sites-enabled/votecloud-auth
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl restart nginx

echo "=== [6/7] Création du service systemd votecloud-auth ==="
cat >/etc/systemd/system/votecloud-auth.service <<EOF
[Unit]
Description=VoteCloud Backend Auth & Elections (IaaS #1 - Oracle Cloud OCI)
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

echo "=== [7/7] Activation et démarrage du service ==="
systemctl daemon-reload
systemctl enable votecloud-auth
systemctl restart votecloud-auth

echo ""
echo "=============================================================================="
echo "IaaS #1 (Oracle Cloud OCI) configuré avec succès !"
echo "1. Vérifiez/éditez les variables : nano $BACKEND_DIR/.env"
echo "2. Redémarrez après édition      : sudo systemctl restart votecloud-auth"
echo "3. Vérifiez les logs en direct   : sudo journalctl -u votecloud-auth -f"
echo "4. Testez la santé locale        : curl -s http://127.0.0.1/health"
echo "=============================================================================="
