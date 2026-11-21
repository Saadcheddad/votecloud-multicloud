# Guide Pas-à-Pas de Déploiement — Spécial Étudiant Seul (De Zéro à la Soutenance)

> **Objectif :** Déployer les **5 services Multicloud** (2 IaaS + 2 PaaS + 1 FaaS, 0 Azure, **0,00 €**) seul, sans blocage, avant la soutenance du **mercredi 25 novembre à 12h15**.  
> **Temps total estimé :** 2 h 30 à 3 h 30 (réparties sereinement sur 3 jours).

---

## 📅 Planning recommandé (Solo — 4 jours avant la soutenance)

| Jour | Objectif | Temps |
|---|---|---|
| **Jour 1 (Samedi 21 nov.)** | Tester le projet en local + pousser sur GitHub + créer **PaaS #1 (Supabase)** | 45 min |
| **Jour 2 (Dimanche 22 nov.)** | Déployer **IaaS #2 (AWS EC2)** + **IaaS #1 (GCP Compute Engine)** + alertes budget 0 € | 1 h 30 |
| **Jour 3 (Lundi 23 nov.)** | Déployer **FaaS #1 (AWS Lambda)** + **PaaS #2 (Render)** + lancer la suite `tests/e2e-test.mjs` | 1 h 00 |
| **Jour 4 (Mardi 24 nov.)** | Répétition complète de la soutenance (10 min chrono) + réinitialiser la base si besoin + captures d'écran de secours | 45 min |
| **Jour J (Mercredi 25 nov.)** | Réveiller Render 5 min avant de passer, vérifier les 5 voyants verts, dérouler la démo ! | 15 min |

---

## Étape 0 : Préparer tes secrets et ton dépôt GitHub (15 min)

### 0.1 Générer tes 3 secrets cryptographiques (PowerShell sur ton PC)
Ouvre un terminal dans `c:\Users\saadc\OneDrive\Bureau\cloud_project` et exécute :

```powershell
node -e "const c=require('crypto'); console.log('JWT_SECRET=' + c.randomBytes(32).toString('hex')); console.log('VOTE_HMAC_SECRET=' + c.randomBytes(32).toString('hex')); console.log('AUDIT_WEBHOOK_SECRET=' + c.randomBytes(32).toString('hex'));"
```

**Copie ces 3 lignes dans un Bloc-notes local** (ne les mets JAMAIS dans Git !). Ces 3 secrets doivent être **identiques** partout où ils sont demandés.

### 0.2 Pousser le projet sur GitHub
1. Crée un dépôt GitHub (ex. `votecloud-multicloud`, public ou privé).
2. Depuis ton dossier `cloud_project` :
```powershell
git init
git add .
git commit -m "feat: plateforme vote electronique multicloud VoteCloud"
git branch -M main
git remote add origin https://github.com/TON_PSEUDO/votecloud-multicloud.git
git push -u origin main
```
*(Si le dépôt est **Public**, les VMs GCP/AWS pourront faire `git clone` sans même configurer de clé SSH GitHub — c'est plus rapide, tant que tu ne commites aucun fichier `.env` ! Notre `.gitignore` bloque déjà tous les `.env`.)*

---

## Étape 1 : Déployer PaaS #1 — Supabase PostgreSQL (0 € · Sans carte bancaire · 10 min)

1. Va sur **https://supabase.com** → *Start your project* → connecte-toi avec GitHub.
2. Clique **New Project** :
   - **Name :** `votecloud-db`
   - **Database Password :** choisis un mot de passe fort **sans caractères spéciaux compliqués** (uniquement lettres + chiffres, ex. `VoteCloud2026Secure` pour éviter les soucis d'encodage URL).
   - **Region :** `West EU (Paris)` ou `Central EU (Frankfurt)`
   - **Plan :** `Free` (0 $/mois) → **Create new project** (attends ~2 min).
3. **Créer les tables et les données de démo :**
   - Dans le menu gauche, clique **SQL Editor** → **New query**.
   - Copie tout le contenu de [`infra/sql/schema.sql`](../infra/sql/schema.sql) → colle → clique **Run** (tu dois voir *Success*).
   - Clique **New query**, copie tout [`infra/sql/seed.sql`](../infra/sql/seed.sql) → colle → clique **Run**.
   - Clique **Table Editor** à gauche : tu vois tes 5 tables (`voters`, `elections`, `candidates`, `votes`, `audit_logs`) avec 5 comptes et 3 scrutins !
4. **⚠️ POINT CRITIQUE — Récupérer l'URL IPv4 (Session Pooler) :**
   - En haut du dashboard Supabase, clique sur le bouton **Connect**.
   - Sélectionne **Method : Session pooler** (port `5432`, hôte de type `aws-0-eu-west-3.pooler.supabase.com`).
   - **Pourquoi ?** La connexion directe (`db.xxx.supabase.co`) est en IPv6 uniquement, alors que GCP `e2-micro` et AWS Lambda utilisent IPv4 par défaut. Le **Session Pooler** fonctionne en **IPv4 partout** !
   - Copie l'URI et remplace `[YOUR-PASSWORD]` par ton mot de passe DB. Note cette URL dans ton Bloc-notes :
     ```text
     DATABASE_URL=postgresql://postgres.abcdefg:VoteCloud2026Secure@aws-0-eu-west-3.pooler.supabase.com:5432/postgres
     ```

---

## Étape 2 : Déployer IaaS #2 — AWS EC2 Audit Node (0 € Free Tier · 25 min)

*(On déploie AWS EC2 avant GCP et Lambda pour avoir déjà son IP publique `AUDIT_SERVICE_URL` !)*

### 2.1 Créer ton compte AWS & Alerte Budget 0,01 $
1. Va sur **https://aws.amazon.com/free** et crée un compte (choisis **AWS Free Plan** si proposé : plafond 0 $ garanti).
2. En haut à droite, sélectionne la région **Europe (Paris) `eu-west-3`**.
3. **Sécurité facturation (2 min) :** cherche **Billing and Cost Management** → **Budgets** → **Create budget** → *Use a template (simplified)* → **Zero spend budget** → entre ton email → **Create**.

### 2.2 Lancer la VM Ubuntu (`t3.micro`)
1. Cherche **EC2** → **Instances** → **Launch instances** :
   - **Name :** `votecloud-aws-audit-iaas`
   - **OS Image (AMI) :** `Ubuntu` → `Ubuntu Server 24.04 LTS (HVM)` *(Free tier eligible)*
   - **Instance type :** `t3.micro` *(Free tier eligible en `eu-west-3`)*
   - **Key pair :** *Create new key pair* → nom `votecloud-ec2-key` → `.pem` → télécharge-la précieusement.
   - **Network settings (Security Group) :** coche :
     - ✅ Allow SSH traffic from Anywhere (ou My IP) — port `22`
     - ✅ Allow HTTP traffic from the internet — port `80`
     - ✅ Allow HTTPS traffic from the internet — port `443`
   - **Configure storage :** `16 GiB gp3` (inclus dans les 30 Go gratuits).
   - Clique **Launch instance**.
2. Attends ~1 min que l'état passe à **Running**. Copie son **Public IPv4 address** (ex. `13.38.xx.xx`) dans ton Bloc-notes :
   ```text
   AUDIT_SERVICE_URL=http://13.38.xx.xx
   ```

### 2.3 Installer et démarrer `backend-audit` sur la VM AWS EC2
1. Dans la console EC2, sélectionne l'instance → clique **Connect** → onglet **EC2 Instance Connect** → clique **Connect** (un terminal SSH s'ouvre directement dans ton navigateur, zéro logiciel requis !).
2. Exécute ces commandes :
```bash
git clone https://github.com/TON_PSEUDO/votecloud-multicloud.git ~/votecloud
cd ~/votecloud
chmod +x infra/scripts/setup-aws-ec2.sh
sudo ./infra/scripts/setup-aws-ec2.sh
```
3. Édite le fichier `.env` avec tes vraies valeurs (Supabase + secret HMAC) :
```bash
nano ~/votecloud/backend-audit/.env
```
Vérifie ces lignes :
```env
PORT=3002
DATABASE_URL=postgresql://postgres.TON_REF:TON_MDP@aws-0-eu-west-3.pooler.supabase.com:5432/postgres
DATABASE_SSL=true
AUDIT_WEBHOOK_SECRET=TON_SECRET_AUDIT_DU_BLOC_NOTES
AUDIT_LEDGER_PATH=/var/lib/votecloud/audit-chain.jsonl
CLOUD_PROVIDER=Amazon Web Services (AWS)
CLOUD_SERVICE=Amazon EC2 t3.micro (IaaS #2)
CLOUD_REGION=eu-west-3
```
Sauvegarde (`Ctrl+O`, `Entrée`, `Ctrl+X`), puis redémarre et vérifie :
```bash
sudo systemctl restart votecloud-audit
curl -s http://127.0.0.1/health
```
4. **Vérification publique depuis ton PC :** ouvre `http://13.38.xx.xx/health` dans ton navigateur → tu dois voir `"status": "UP"` et `"model": "IaaS #2"` ! 🎉

---

## Étape 3 : Déployer IaaS #1 — GCP Compute Engine Auth Node (0 € Always Free · 25 min)

### 3.1 Créer ton projet GCP & Alerte Budget
1. Va sur **https://console.cloud.google.com**, connecte-toi avec ton compte Google (300 $ gratuits 90 j + Always Free à vie).
2. Crée un projet nommé `votecloud-esi`.
3. Menu gauche → **Facturation (Billing)** → **Budgets et alertes** → crée un budget de **1 €** pour être prévenu immédiatement en cas d'erreur.
4. Active l'API **Compute Engine API** (menu gauche → *Compute Engine* → *Instances de VM*).

### 3.2 Créer la VM `e2-micro` **100 % Always Free**
Clique **Créer une instance** et respecte **EXACTEMENT** ces 4 réglages gratuits :
1. **Nom :** `votecloud-gcp-auth-iaas`
2. **Région :** **`us-central1` (Iowa)** · Zone : **`us-central1-a`** *(⚠️ Obligatoire pour Always Free !)*
3. **Configuration de la machine :** Série `E2` → Type **`e2-micro`** (2 vCPU partagés, 1 Go RAM)
4. **Disque de démarrage (Boot disk)** → clique **Modifier** :
   - OS : **Ubuntu** · Version : **Ubuntu 22.04 LTS (x86/64)**
   - **Type de disque :** **`Disque persistant standard` (`pd-standard`)** *(⚠️ NE PAS laisser « équilibré / pd-balanced » sinon c'est payant !)*
   - Taille : **`20 Go`** (gratuit jusqu'à 30 Go)
5. **Pare-feu (Firewall) :** coche ✅ **Autoriser le trafic HTTP** et ✅ **Autoriser le trafic HTTPS**.
6. Clique **Créer**. Copie son **Adresse IP externe** (ex. `34.120.xx.xx`) dans ton Bloc-notes :
   ```text
   AUTH_SERVICE_URL=http://34.120.xx.xx
   ```

### 3.3 Installer et démarrer `backend-auth` sur la VM GCP
1. Sur la ligne de ta VM dans GCP Console, clique le bouton **SSH** (un terminal SSH s'ouvre directement dans ton navigateur !).
2. Exécute :
```bash
git clone https://github.com/TON_PSEUDO/votecloud-multicloud.git ~/votecloud
cd ~/votecloud
chmod +x infra/scripts/setup-gcp-vm.sh
sudo ./infra/scripts/setup-gcp-vm.sh
```
3. Édite le fichier `.env` :
```bash
nano ~/votecloud/backend-auth/.env
```
Renseigne tes vraies valeurs :
```env
PORT=3001
DATABASE_URL=postgresql://postgres.TON_REF:TON_MDP@aws-0-eu-west-3.pooler.supabase.com:5432/postgres
DATABASE_SSL=true
JWT_SECRET=TON_JWT_SECRET_DU_BLOC_NOTES
VOTE_HMAC_SECRET=TON_VOTE_HMAC_SECRET_DU_BLOC_NOTES
AUDIT_WEBHOOK_SECRET=TON_SECRET_AUDIT_DU_BLOC_NOTES
AUDIT_SERVICE_URL=http://13.38.xx.xx
CLOUD_PROVIDER=Google Cloud Platform (GCP)
CLOUD_SERVICE=Compute Engine e2-micro (IaaS #1)
CLOUD_REGION=us-central1-a
```
Sauvegarde (`Ctrl+O`, `Entrée`, `Ctrl+X`), puis redémarre et vérifie :
```bash
sudo systemctl restart votecloud-auth
curl -s http://127.0.0.1/health
```
4. **Vérification publique :** ouvre `http://34.120.xx.xx/health` dans ton navigateur → tu dois voir `"status": "UP"`, `"model": "IaaS #1"` et `"database": { "status": "UP" }` ! 🎉

---

## Étape 4 : Déployer FaaS #1 — AWS Lambda + Function URL HTTPS (0 € Always Free · 15 min)

### 4.1 Générer l'archive `faas-vote.zip` sur ton PC
Dans PowerShell sur ton PC (`c:\Users\saadc\OneDrive\Bureau\cloud_project`) :
```powershell
npm run package:lambda
```
Cela crée le fichier `faas-vote/faas-vote.zip` (~1 Mo, prêt pour AWS Lambda).

### 4.2 Créer et configurer la fonction sur la Console AWS
1. Dans la Console AWS (région **Europe Paris `eu-west-3`**), cherche **Lambda** → **Create function** :
   - **Author from scratch**
   - **Function name :** `votecloud-faas-vote`
   - **Runtime :** `Node.js 20.x`
   - **Architecture :** `x86_64`
   - Déplie **Additional configurations** :
     - ✅ Coche **Enable function URL**
     - **Auth type :** `NONE` *(la sécurité est assurée applicativement par JWT signé GCP + HMAC)*
     - **Laisse `Configure cross-origin resource sharing (CORS)` DÉCOCHÉ** *(notre code Lambda gère déjà proprement les en-têtes CORS sans doublon)*.
   - Clique **Create function**.
2. **Téléverser ton code :**
   - Onglet **Code** → clique **Upload from** → **.zip file** → sélectionne `faas-vote/faas-vote.zip` → **Save**.
3. **Ajuster timeout et mémoire :**
   - Onglet **Configuration** → **General configuration** → **Edit** :
     - Memory : `256 MB`
     - Timeout : `15 sec` → **Save**.
4. **Ajouter les variables d'environnement :**
   - Onglet **Configuration** → **Environment variables** → **Edit** → ajoute ces 5 variables :
     - `DATABASE_URL` = ton URL Session Pooler Supabase
     - `DATABASE_SSL` = `true`
     - `JWT_SECRET` = ton `JWT_SECRET` (identique à GCP !)
     - `AUDIT_WEBHOOK_SECRET` = ton `AUDIT_WEBHOOK_SECRET` (identique à AWS EC2 !)
     - `AUDIT_SERVICE_URL` = `http://13.38.xx.xx` (IP de ton AWS EC2)
   - Clique **Save**.
5. **Copier la Function URL HTTPS :**
   - En haut à droite dans *Function overview*, copie la **Function URL** (ex. `https://abcd1234.lambda-url.eu-west-3.on.aws/`).
   - Ouvre `https://abcd1234.lambda-url.eu-west-3.on.aws/health` dans ton navigateur → tu dois voir `"status": "UP"`, `"model": "FaaS #1"` et un vrai `awsRequestId` ! 🎉

---

## Étape 5 : Déployer PaaS #2 — Render Web Service (0 € · Sans carte bancaire · 10 min)

1. Va sur **https://render.com** → *Get Started for Free* → connecte-toi avec GitHub.
2. Clique **New +** → **Web Service** → sélectionne ton dépôt `votecloud-multicloud`.
3. Configure :
   - **Name :** `votecloud-frontend-paas`
   - **Region :** `Frankfurt (EU Central)`
   - **Root Directory :** `frontend`
   - **Runtime :** `Node`
   - **Build Command :** `npm install`
   - **Start Command :** `npm start`
   - **Instance Type :** **`Free`** (0 $/mois)
4. Dans **Environment Variables**, ajoute :
   - `AUTH_SERVICE_URL` = `http://34.120.xx.xx` *(sans `/` à la fin)*
   - `AUDIT_SERVICE_URL` = `http://13.38.xx.xx` *(sans `/` à la fin)*
   - `FAAS_VOTE_URL` = `https://abcd1234.lambda-url.eu-west-3.on.aws` *(sans `/` à la fin)*
   - `CLOUD_PROVIDER` = `Render`
   - `CLOUD_SERVICE` = `Render Web Service (PaaS #2)`
   - `CLOUD_REGION` = `frankfurt`
5. Clique **Create Web Service** (déploiement en ~1 min).
6. Ouvre ton URL HTTPS finale : `https://votecloud-frontend-paas.onrender.com` !
   - Vérifie que les **5 voyants verts** s'allument dans le bandeau supérieur !

---

## Étape 6 : Lancer la suite de tests automatisée contre ton vrai Multicloud !

Depuis PowerShell sur ton PC :
```powershell
$env:BASE_URL="https://votecloud-frontend-paas.onrender.com"
node tests/e2e-test.mjs
```
Si les **8 assertions passent en vert**, ta plateforme multicloud complète est **100 % opérationnelle et prête pour la soutenance !**

---

## Étape 7 : Dépannage rapide (Erreurs courantes)

| Symptôme | Cause probable | Solution immédiate |
|---|---|---|
| `ENETUNREACH` ou timeout vers Supabase depuis GCP/Lambda | Utilisation de l'URL Direct Connection (IPv6) | Prendre l'URL **Session Pooler** (IPv4, `pooler.supabase.com:5432`) dans Supabase → *Connect*. |
| `JWT_SECRET` / `INVALID_VOTE_TOKEN` (401) sur AWS Lambda | `JWT_SECRET` différent entre GCP `.env` et Lambda Env Vars | Vérifier au caractère près que `JWT_SECRET` est identique sur GCP et AWS Lambda. |
| `INVALID_WEBHOOK_SIGNATURE` dans les logs AWS EC2 | `AUDIT_WEBHOOK_SECRET` différent entre GCP/Lambda et AWS EC2 | Aligner `AUDIT_WEBHOOK_SECRET` sur les 3 services et redémarrer `systemctl restart`. |
| Render met 30 secondes à répondre au 1er chargement | Mise en veille automatique du Free Tier Render après 15 min | Ouvrir l'URL Render **5 minutes avant ton créneau de soutenance** et cliquer *Ping 5 Clouds*. |
| Port 80 injoignable sur GCP ou AWS EC2 | Pare-feu cloud ou UFW manquant | Vérifier le tag `http-server` / Firewall GCP (port 80) et le Security Group AWS (Inbound TCP 80 `0.0.0.0/0`). |

---

## Étape 8 : Nettoyage post-soutenance (Pour rester à 0,00 € à vie)

Une fois ta note validée après la soutenance :
1. **AWS EC2 :** sélectionne `votecloud-aws-audit-iaas` → *Instance state* → **Terminate instance**.
2. **GCP Compute Engine :** sélectionne `votecloud-gcp-auth-iaas` → **Supprimer**.
3. **AWS Lambda, Supabase, Render :** ils sont **Always Free à vie** (0 € au repos), tu peux les garder pour ton portfolio / CV !
