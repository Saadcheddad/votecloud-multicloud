#!/usr/bin/env bash
# ==============================================================================
# VoteCloud - Script d'installation automatisée pour IaaS #2 (Oracle Cloud OCI VM #2)
# OS cible : Ubuntu 22.04 LTS / 24.04 LTS (Always Free)
# Rôle : Nœud Indépendant d'Audit Cryptographique SHA-256 & Dépouillement (backend-audit)
# ==============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
AUDIT_DIR="$APP_DIR/backend-audit"
LEDGER_DIR="/var/lib/votecloud"
SERVICE_USER="${SUDO_USER:-ubuntu}"

echo "=== [1/6] Mise à jour Ubuntu et installation des prérequis ==="
apt-get update -y
apt-get install -y curl git nginx ca-certificates gnupg iptables-persistent

echo "=== [2/6] Installation de Node.js 20 LTS ==="
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1)" != "v20" ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "=== [3/6] Ouverture des ports 80/443 en ligne 1 dans iptables (spécifique OCI) ==="
iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT || true
iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT || true
netfilter-persistent save || true

echo "=== [4/6] Préparation du volume persistant pour la chaîne d'audit SHA-256 ==="
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
fi

echo "=== [5/6] Configuration du Reverse Proxy Nginx (port 80 -> 127.0.0.1:3002) ==="
cp "$APP_DIR/infra/nginx/oci-audit.conf" /etc/nginx/sites-available/votecloud-audit
ln -sf /etc/nginx/sites-available/votecloud-audit /etc/nginx/sites-enabled/votecloud-audit
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl restart nginx

echo "=== [6/6] Création du service systemd votecloud-audit ==="
cat >/etc/systemd/system/votecloud-audit.service <<EOF
[Unit]
Description=VoteCloud Independent Audit Hash-Chain & Tally Node (IaaS #2 - OCI)
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
echo "IaaS #2 (OCI Audit Node) configuré avec succès !"
echo "1. Éditez les secrets : nano $AUDIT_DIR/.env"
echo "2. Redémarrez         : sudo systemctl restart votecloud-audit"
echo "3. Vérifiez           : curl -s http://127.0.0.1/health"
echo "=============================================================================="
