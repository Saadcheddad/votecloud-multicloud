# Guide Pas-à-Pas de Déploiement — VoteCloud Multicloud (0 €, 0 Azure)

> **Architecture réelle déployée (4 providers · 2 IaaS · 2 PaaS · 1 FaaS · 0,00 €) :**
> - **IaaS #1 :** Oracle Cloud OCI — VM #1 `votecloud-oci-auth-iaas` (Ubuntu 22.04, Casablanca)
> - **IaaS #2 :** Oracle Cloud OCI — VM #2 `votecloud-oci-audit-iaas` (Ubuntu 22.04, Casablanca)
> - **PaaS #1 :** Supabase — PostgreSQL 17 Managé (Session Pooler IPv4 + RLS)
> - **PaaS #2 :** Render — Web Service Node.js Managé (HTTPS + BFF Proxy)
> - **FaaS #1 :** Vercel — Serverless Functions Node.js 20 (HTTPS)

---

## Étape 1 — Générer les secrets cryptographiques & pousser sur GitHub

```powershell
node -e "const c=require('crypto'); console.log('JWT_SECRET=' + c.randomBytes(32).toString('hex')); console.log('VOTE_HMAC_SECRET=' + c.randomBytes(32).toString('hex')); console.log('AUDIT_WEBHOOK_SECRET=' + c.randomBytes(32).toString('hex'));"
```

Pousser le dépôt sur GitHub (aucun `.env` n'est versionné grâce au `.gitignore`) :
```powershell
git init
git add .
git commit -m "feat: plateforme vote electronique multicloud VoteCloud"
git branch -M main
git remote add origin https://github.com/Saadcheddad/votecloud-multicloud.git
git push -u origin main
```

---

## Étape 2 — Déployer PaaS #1 : Supabase PostgreSQL 17 (0 €, sans carte bancaire)

1. Créer un projet `votecloud-db` sur **https://supabase.com** (plan `Free`).
2. Dans **SQL Editor**, exécuter [`infra/sql/schema.sql`](../infra/sql/schema.sql) (*Run and enable RLS*), puis [`infra/sql/seed.sql`](../infra/sql/seed.sql).
3. Cliquer sur **Connect → Direct → Method : Session pooler** (port `5432`, hôte `...pooler.supabase.com` compatible **IPv4**) pour copier `DATABASE_URL`.

---

## Étape 3 — Déployer IaaS #1 : Oracle Cloud OCI VM #1 (`backend-auth`, 0 € Always Free)

1. Sur **https://cloud.oracle.com** (`Morocco West (Casablanca)`) → **Compute → Instances → Create instance** :
   - **Name :** `votecloud-oci-auth-iaas`
   - **Image :** Canonical Ubuntu 22.04
   - **Shape :** `VM.Standard.A1.Flex` (*Always Free-eligible*, 1 OCPU, 6 Go RAM)
   - **Networking :** IPv4 publique activée
   - **SSH keys :** télécharger la clé privée (`.key`)
2. Ouvrir les règles dans la **Security List** du sous-réseau :
   - **Ingress Rules :** TCP `22`, `80`, `443` depuis `0.0.0.0/0`
   - **Egress Rules :** `All Protocols` vers `0.0.0.0/0`
3. Connexion SSH et installation automatisée :
```bash
git clone https://github.com/Saadcheddad/votecloud-multicloud.git ~/votecloud-multicloud
cd ~/votecloud-multicloud
chmod +x infra/scripts/setup-oci-vm.sh
sudo ./infra/scripts/setup-oci-vm.sh
```
4. Configurer `~/votecloud-multicloud/backend-auth/.env` (`DATABASE_URL`, `JWT_SECRET`, `VOTE_HMAC_SECRET`, `AUDIT_WEBHOOK_SECRET`, `AUDIT_SERVICE_URL=http://<IP_OCI_2>`), puis :
```bash
sudo systemctl restart votecloud-auth
curl -s http://127.0.0.1/health
```

---

## Étape 4 — Déployer IaaS #2 : Oracle Cloud OCI VM #2 (`backend-audit`, 0 € Always Free)

1. Créer une 2ème VM indépendante sur OCI (`Morocco West (Casablanca)`) :
   - **Name :** `votecloud-oci-audit-iaas`
   - **Image :** Canonical Ubuntu 22.04 | **Shape :** `VM.Standard.A1.Flex` (*Always Free-eligible*, 1 OCPU, 6 Go RAM)
   - **Networking :** même VCN/Subnet + IPv4 publique activée
2. Connexion SSH et installation automatisée :
```bash
git clone https://github.com/Saadcheddad/votecloud-multicloud.git ~/votecloud
cd ~/votecloud
chmod +x infra/scripts/setup-oci-audit-vm.sh
sudo ./infra/scripts/setup-oci-audit-vm.sh
```
3. Configurer `~/votecloud/backend-audit/.env` (`DATABASE_URL`, `AUDIT_WEBHOOK_SECRET`, `AUDIT_LEDGER_PATH=/var/lib/votecloud/audit-chain.jsonl`), puis :
```bash
sudo systemctl restart votecloud-audit
curl -s http://127.0.0.1/health
```
4. Renseigner `AUDIT_SERVICE_URL=http://<IP_OCI_2>` dans `backend-auth/.env` sur VM #1 et redémarrer `votecloud-auth`.

---

## Étape 5 — Déployer FaaS #1 : Vercel Serverless Functions (0 €, sans carte bancaire)

1. Sur **https://vercel.com** → **Add New… → Project** → importer `Saadcheddad/votecloud-multicloud`.
2. **Root Directory :** `faas-vote` | **Preset :** `Other` (Plan **Hobby Free**).
3. Ajouter les **Environment Variables** :
   - `DATABASE_URL` (Session Pooler IPv4 Supabase)
   - `DATABASE_SSL=true`
   - `JWT_SECRET`
   - `AUDIT_WEBHOOK_SECRET`
   - `AUDIT_SERVICE_URL=http://<IP_OCI_2>`
4. Cliquer **Deploy** → vérifier `https://<projet>.vercel.app/health` (`"status":"UP"`).

---

## Étape 6 — Déployer PaaS #2 : Render Web Service (`frontend`, 0 € Free Tier)

1. Sur **https://render.com** → **New + → Web Service** → connecter `Saadcheddad/votecloud-multicloud`.
2. **Language :** `Node` | **Root Directory :** `frontend` | **Build :** `npm install` | **Start :** `npm start` | **Plan :** `Free ($0/month)`.
3. Ajouter les **Environment Variables** :
   - `AUTH_SERVICE_URL=http://<IP_OCI_1>`
   - `AUDIT_SERVICE_URL=http://<IP_OCI_2>`
   - `FAAS_VOTE_URL=https://<projet>.vercel.app`
   - `CLOUD_PROVIDER=Render`
   - `CLOUD_SERVICE=Render Web Service (PaaS #2)`
4. Cliquer **Deploy Web Service**.

---

## Étape 7 — Validation End-to-End en Production

```powershell
$env:BASE_URL="https://votecloud-frontend-paas.onrender.com"
node tests/e2e-test.mjs
```

Les 8 scénarios (topologie, inscription/JWT, scrutins, vote valide 201, double vote bloqué 409, votes hors période bloqués 403, réconciliation inter-cloud, intégrité SHA-256) doivent passer en vert.

---

## Étape 8 — Nettoyage post-soutenance (0,00 € garanti)
- Les 2 VMs OCI sont *Always Free* (2 OCPU / 12 Go RAM < limite gratuite 4 OCPU / 24 Go) ; après la soutenance, tu peux néanmoins les **Terminate** (en cochant *Delete boot volume*) si tu ne souhaites plus les garder actives.
- Supabase, Render et Vercel en offre Free restent à **0,00 €** au repos.
