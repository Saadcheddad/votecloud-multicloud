# Fiche Technique du Projet Cloud — VoteCloud

> **Établissement :** École des Sciences de l'Information (ESI), Rabat  
> **Cours :** Cloud Computing (Prof. Imane HILAL)  
> **Thème :** Solution IT Multicloud pour les Élections (Vote Électronique Sécurisé)  
> **Réalisation :** Projet individuel (Étudiant seul)  
> **Contraintes respectées :** 2 IaaS · 2 PaaS · 1 FaaS · 4 Providers Multicloud · 0 Service Azure · Coût 0 €

---

## 1. Description fonctionnelle de la solution

**VoteCloud** est une plateforme d'élection et de vote électronique multicloud garantissant les quatre propriétés fondamentales d'un scrutin numérique fiable :

1. **Éligibilité & Authentification sécurisée :** inscription et connexion des électeurs par identifiant national (CIN), email et mot de passe haché (`scrypt`), avec séparation des rôles (`Électeur` / `Administrateur électoral`).
2. **Gestion complète des scrutins :** création de scrutins, définition des candidats et des fenêtres temporelles officielles (`UPCOMING`, `OPEN`, `CLOSED`), ouverture et clôture en temps réel.
3. **Unicité et anonymat du vote (Anti-Double Vote) :** chaque électeur ne peut exprimer qu'**un seul vote** par scrutin. Son identité est transformée en jeton pseudonymisé déterministe (`voter_hash = HMAC-SHA256`), dissociant l'identité civile du bulletin stocké dans l'urne.
4. **Dépouillement temps réel, vérifiabilité & audit immuable :** affichage instantané des résultats, délivrance d'un reçu cryptographique vérifiable (`VC-XXXX-XXXX`), journal d'audit chaîné SHA-256 et réconciliation croisée entre clouds.

---

## 2. Conception technique : Services Cloud choisis & Providers

Notre architecture évite les services déjà vus en TP (aucune VM Azure, aucune base de données Azure) et interconnecte **5 services cloud répartis sur 4 fournisseurs distincts** :

| Modèle | Service déployé | Provider | Configuration technique | Rôle dans la solution |
|---|---|---|---|---|
| **IaaS #1** | **Compute Engine** | **Google Cloud (GCP)** | VM `e2-micro` (`us-central1-a`), Ubuntu 22.04 LTS, UFW + VPC Firewall, Nginx Reverse Proxy (rate limiting), Node.js 20 (`systemd`) | Héberge l'Autorité d'Authentification et de Gestion des Scrutins (`backend-auth`). Vérifie les électeurs et signe des jetons de vote anonymisés à durée de vie de 5 minutes. |
| **IaaS #2** | **Amazon EC2** | **Amazon Web Services (AWS)** | Instance `t3.micro` (`eu-west-3`), Ubuntu 24.04 LTS, AWS Security Group + UFW, Nginx, volume EBS chiffré, Node.js 20 (`systemd`) | Héberge le Nœud Indépendant d'Audit Cryptographique (`backend-audit`). Scelle chaque événement dans une chaîne de hachage SHA-256 locale (`audit-chain.jsonl`), calcule le dépouillement et exécute la réconciliation inter-cloud. |
| **PaaS #1** | **Supabase PostgreSQL** | **Supabase (DBaaS)** | PostgreSQL 15+ managé, connexion TLS via Session Pooler IPv4, 0 gestion d'OS | Stocke les données persistantes (`voters`, `elections`, `candidates`, `votes`, `audit_logs`) et impose la contrainte ACID `UNIQUE(election_id, voter_hash)` empêchant tout double vote. |
| **PaaS #2** | **Render Web Service** | **Render** | Plateforme Node.js managée (`frankfurt`), CI/CD GitHub, HTTPS/TLS automatique | Héberge l'interface web citoyenne/administrateur (`frontend`) et fournit une passerelle BFF HTTPS unifiée vers GCP, AWS Lambda et AWS EC2. |
| **FaaS #1** | **AWS Lambda** | **Amazon Web Services (AWS)** | Fonction serverless Node.js 20.x (`eu-west-3`), exposée via **Lambda Function URL** HTTPS, CloudWatch Logs | Processeur événementiel de vote (`faas-vote`). Valide la signature cryptographique du jeton GCP, vérifie la fenêtre temporelle du scrutin, insère atomiquement le vote dans Supabase et notifie AWS EC2. |

---

## 3. Flux détaillé des données et interconnexion multicloud

### Flux A — Authentification & Obtention d'un droit de vote (Render → GCP → Supabase → AWS EC2)
1. L'électeur saisit ses identifiants sur le portail HTTPS (**PaaS #2 Render**).
2. La requête est transmise à l'API d'authentification (**IaaS #1 GCP Compute Engine**), qui vérifie le mot de passe `scrypt` dans **PaaS #1 Supabase PostgreSQL** et émet un JWT de session.
3. Lorsque l'électeur choisit un scrutin, **GCP IaaS #1** génère le nullifier anonymisé `voter_hash = HMAC-SHA256(secret, electionId:voterId)` et signe un **Jeton de Vote (`voteToken`)** valable 5 minutes à destination exclusive d'AWS Lambda.
4. L'événement de connexion est envoyé via webhook signé HMAC-SHA256 au nœud d'audit (**IaaS #2 AWS EC2**).

### Flux B — Vote, Anti-Double Vote & Scellement d'Audit (Render → AWS Lambda → Supabase → AWS EC2)
1. Le portail (**PaaS #2 Render**) envoie le bulletin (`electionId`, `candidateId`) et le `voteToken` à la fonction serverless (**FaaS #1 AWS Lambda**).
2. **AWS Lambda** valide la signature cryptographique du jeton émis par **GCP** (confiance inter-cloud sans partage de session).
3. **AWS Lambda** ouvre une transaction SQL vers **PaaS #1 Supabase** :
   - Si le scrutin est `CLOSED` ou `UPCOMING` (ou hors `starts_at..ends_at`) → rejet **HTTP 403** + alerte `OUT_OF_WINDOW_ATTEMPT` envoyée à **AWS EC2**.
   - Si le couple `(election_id, voter_hash)` existe déjà dans `votes` → violation de la contrainte `UNIQUE` → rejet **HTTP 409** + alerte `DOUBLE_VOTE_ATTEMPT` envoyée à **AWS EC2**.
   - Si le vote est valide → `INSERT` atomique du bulletin + génération d'un reçu cryptographique (`receiptCode`, `receiptHash`).
4. **AWS Lambda** envoie une preuve signée (`VOTE_CAST`, sans le choix du candidat pour garantir le secret du vote) à **IaaS #2 AWS EC2**, qui scelle un nouveau bloc SHA-256 sur son disque EBS et le réplique dans `audit_logs`.

### Flux C — Dépouillement temps réel & Réconciliation Inter-Cloud (Render → AWS EC2 ↔ Supabase)
1. L'utilisateur consulte l'onglet *Résultats* ou *Journal d'Audit*.
2. **IaaS #2 AWS EC2** agrège les résultats en direct depuis **Supabase PaaS #1**, compare le nombre total de bulletins en base au nombre de preuves `VOTE_CAST` dans son registre EBS local (réconciliation inter-cloud) et permet de vérifier l'intégrité mathématique de toute la chaîne SHA-256.

---

## 4. Scénarios démontrés en direct lors de la soutenance

| Scénario | Services sollicités en direct | Résultat vérifié sur les consoles Cloud |
|---|---|---|
| **1. Healthcheck Multicloud Live** | Les 5 services simultanément | Statut `UP`, hostnames GCP/AWS, version PostgreSQL Supabase, Request ID AWS Lambda. |
| **2. Vote valide** | Render → GCP → AWS Lambda → Supabase → AWS EC2 | `HTTP 201`, reçu `VC-XXXX-XXXX`, nouvelle ligne visible dans Supabase Table Editor, logs CloudWatch sur AWS Lambda, bloc SHA-256 sur AWS EC2. |
| **3. Tentative de double vote** | Render → GCP → AWS Lambda → Supabase → AWS EC2 | Rejet `HTTP 409 DOUBLE_VOTE_DETECTED`, aucun doublon en base, alerte scellée dans la chaîne AWS EC2. |
| **4. Vote hors période (`CLOSED` & `UPCOMING`)** | Render → GCP → AWS Lambda → Supabase → AWS EC2 | Rejet `HTTP 403 ELECTION_CLOSED / NOT_STARTED`, alerte `OUT_OF_WINDOW_ATTEMPT` scellée sur AWS EC2. |
| **5. Vérification d'intégrité & Reçu** | Render → AWS EC2 ↔ Supabase | Recalcul SHA-256 de tous les blocs validé + réconciliation `Urne Supabase == Registre AWS EC2`. |
