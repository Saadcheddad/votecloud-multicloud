#!/usr/bin/env bash
# ==============================================================================
# VoteCloud - Script d'installation automatisée pour IaaS #2 (AWS EC2)
# OS cible : Ubuntu 24.04 LTS / 22.04 LTS (Instance t3.micro / t2.micro Free Tier)
# ==============================================================================
# Usage sur la VM AWS EC2 (après `git clone` du projet dans ~/votecloud) :
#   cd ~/votecloud
#   chmod +x infra/scripts/setup-aws-ec2.sh
#   sudo ./infra/scripts/setup-aws-ec2.sh
# ==============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
AUDIT_DIR="$APP_DIR/backend-audit"
LEDGER_DIR="/var/lib/votecloud"
SERVICE_USER="${SUDO_USER:-ubuntu}"

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

echo "=== [4/6] Préparation du volume persistant EBS pour la chaîne d'audit SHA-256 ==="
mkdir -p "$LEDGER_DIR"
chown -R "$SERVICE_USER:$SERVICE_USER" "$LEDGER_DIR"
chmod 750 "$LEDGER_DIR"

cd "$AUDIT_DIR"
sudo -u "$SERVICE_USER" npm install --omit=dev

if [ ! -f "$AUDIT_DIR/.env" ]; then
  cp "$AUDIT_DIR/.env.example" "$AUDIT_DIR/.env"
  sed -i "s|AUDIT_LEDGER_PATH=.*|AUDIT_LEDGER_PATH=$LEDGER_DIR/audit-chain.jsonl|" "$AUDIT_DIR/.env"
  chown "$SERVICE_USER:$SERVICE_USER" "$AUDIT_DIR/.env"
  chmod 600 "$AUDIT_DIR/.env"
  echo ">>> ATTENTION : Éditez $AUDIT_DIR/.env avec vos vraies clés avant de redémarrer le service !"
fi

echo "=== [5/6] Configuration du Reverse Proxy Nginx (port 80 -> 127.0.0.1:3002) ==="
cp "$APP_DIR/infra/nginx/aws-audit.conf" /etc/nginx/sites-available/votecloud-audit
ln -sf /etc/nginx/sites-available/votecloud-audit /etc/nginx/sites-enabled/votecloud-audit
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl restart nginx

echo "=== [6/6] Création du service systemd votecloud-audit ==="
cat >/etc/systemd/system/votecloud-audit.service <<EOF
[Unit]
Description=VoteCloud Independent Audit Hash-Chain & Tally Node (IaaS #2 - AWS EC2)
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$AUDIT_DIR
EnvironmentFile=$AUDIT_DIR/.env
ExecStart=/usr/bin/node $AUDIT_DIR/src/server.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable votecloud-audit
systemctl restart votecloud-audit

echo ""
echo "=============================================================================="
echo "IaaS #2 (AWS EC2 Audit Node) configuré avec succès !"
echo "1. Vérifiez/éditez les variables : nano $AUDIT_DIR/.env"
echo "2. Redémarrez après édition      : sudo systemctl restart votecloud-audit"
echo "3. Inspectez la chaîne locale    : cat $LEDGER_DIR/audit-chain.jsonl"
echo "4. Vérifiez les logs en direct   : sudo journalctl -u votecloud-audit -f"
echo "5. Testez la santé locale        : curl -s http://127.0.0.1/health | head -c 400"
echo "=============================================================================="
