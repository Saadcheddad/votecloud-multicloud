# Guide de Soutenance & Checklist de Démonstration (Mercredi 25 Novembre · 12h15)

> **Rappel du barème de Prof. Imane HILAL :**  
> Ce qui est évalué en priorité : **la mise en œuvre concrète de chaque service cloud (IaaS, PaaS, FaaS) chez au moins 2 providers différents, leur interconnexion en direct sur les consoles des providers, et un scénario d'utilisation complet.**  
> Comme tu présentes **seul**, tu maîtrises les 5 services de bout en bout — c'est un **énorme atout** si ta démo est fluide et structurée !

---

## 1. Préparation 15 minutes AVANT de passer devant le jury

Ouvre **6 onglets bien ordonnés** dans ton navigateur avant d'entrer en salle :

1. **Onglet 1 — Application VoteCloud (PaaS #2 Render) :** `https://votecloud-frontend-paas.onrender.com`  
   *(Clique sur **↻ Ping 5 Clouds** pour réveiller Render et vérifier que les 5 pastilles sont VERTES.)*
2. **Onglet 2 — Console Google Cloud (IaaS #1) :** *Compute Engine → Instances de VM* (avec fenêtre SSH ouverte sur `sudo journalctl -u votecloud-auth -f`).
3. **Onglet 3 — Console AWS EC2 (IaaS #2) :** *EC2 → Instances* (avec fenêtre SSH ouverte sur `sudo journalctl -u votecloud-audit -f`).
4. **Onglet 4 — Console AWS Lambda (FaaS #1) :** *Lambda → `votecloud-faas-vote` → Monitor → View CloudWatch logs*.
5. **Onglet 5 — Console Supabase (PaaS #1) :** *Table Editor → table `votes`* (prête à être rafraîchie devant la prof).
6. **Onglet 6 — Console Render (PaaS #2) :** *Web Service `votecloud-frontend-paas` → Logs*.

---

## 2. Script de présentation minute par minute (10 à 12 minutes)

### ⏱️ Min 0–2 : Présentation de l'architecture Multicloud
- Explique en 3 phrases la problématique : un système d'élection exige **séparation des pouvoirs**, **anti-double vote**, **anonymat** et **auditabilité**.
- Affiche le schéma Mermaid/ASCII ([`docs/ARCHITECTURE.md`](./ARCHITECTURE.md)) et énumère clairement les **5 services sur 4 clouds (0 Azure)** :
  1. **IaaS #1 — GCP Compute Engine (`e2-micro`, Ubuntu)** : authentification électeurs, gestion des scrutins, émission de jetons anonymisés (`voter_hash = HMAC-SHA256`).
  2. **IaaS #2 — AWS EC2 (`t3.micro`, Ubuntu)** : nœud indépendant d'audit cryptographique (chaîne SHA-256 sur EBS) et dépouillement vérifiable.
  3. **PaaS #1 — Supabase (PostgreSQL Managé)** : stockage ACID, contrainte `UNIQUE(election_id, voter_hash)`.
  4. **PaaS #2 — Render (Web Service Managé)** : portail web HTTPS + passerelle BFF.
  5. **FaaS #1 — AWS Lambda (Function URL HTTPS)** : validation serverless du bulletin et écriture atomique.

### ⏱️ Min 2–4 : Preuve directe des 5 services dans les consoles Cloud
- Dans VoteCloud, ouvre l'onglet **☁️ Topologie Multicloud** → clique **Lancer un Healthcheck Multicloud** → montre en direct les **vraies régions (`us-central1-a`, `eu-west-3`, `frankfurt`)**, **hostnames VM**, **version PostgreSQL**, et **`awsRequestId` de Lambda**.
- Fais un passage éclair (15 secondes par onglet) sur les 5 consoles ouvertes (GCP VM + UFW, AWS EC2 + Security Group, AWS Lambda Function URL, Supabase Tables, Render Dashboard) pour prouver que tout tourne réellement sur le cloud.

### ⏱️ Min 4–8 : Démonstration Live des 3 Scénarios de Test

#### ✅ Scénario 1 : Vote Valide (Traversée complète des 5 clouds)
1. Onglet **🗳️ Scrutins & Vote** → clique sur le raccourci **👤 Saad (Électeur)** (connexion via **GCP IaaS #1**).
2. Sur le scrutin **OPEN** (*Élection du Bureau des Étudiants ESI*), clique **🗳️ Voter (via AWS Lambda)** → choisis un candidat → **Confirmer**.
3. Montre le **Reçu Cryptographique** (`VC-XXXX-XXXX`, empreinte SHA-256, `awsRequestId`, numéro de bloc AWS EC2 et la trace des 5 clouds).
4. **Preuves consoles en direct :**
   - Bascule sur **Supabase (Onglet 5)** → rafraîchis la table `votes` → montre la nouvelle ligne **sans nom ni email** (uniquement `voter_hash` + `receipt_code`).
   - Bascule sur **AWS Lambda CloudWatch (Onglet 4)** → montre l'invocation correspondante.
   - Bascule sur le terminal **AWS EC2 (Onglet 3)** → exécute `tail -n 1 /var/lib/votecloud/audit-chain.jsonl` pour montrer le bloc scellé physiquement sur le disque EBS !

#### 🛡️ Scénario 2 : Tentative de Double Vote (Blocage HTTP 409)
1. Toujours connecté en tant que **Saad**, clique sur le bouton rouge **🧪 Tester Double Vote (Doit renvoyer HTTP 409)** sur le même scrutin.
2. Montre la notification d'erreur : **`[HTTP 409 - AWS Lambda] Tentative de double vote bloquée !`**
3. Explique : GCP a certifié l'électeur avec le même `voter_hash` déterministe ; **AWS Lambda** a tenté l'insertion dans **Supabase**, la contrainte atomique `UNIQUE(election_id, voter_hash)` a levé l'erreur PostgreSQL `23505`, et Lambda a aussitôt envoyé une alerte `DOUBLE_VOTE_ATTEMPT` signée HMAC à **AWS EC2**.

#### ⏳ Scénario 3 : Vote Hors Période (Blocage HTTP 403)
1. Sur le scrutin **CLOSED** (*Référendum Campus Numérique 2026*) ou **UPCOMING** (*Conseil Scientifique 2027*), clique **🧪 Tester Vote Hors Période (Doit renvoyer HTTP 403)**.
2. Montre le rejet serveur immédiat **`[HTTP 403 - AWS Lambda] Vote refusé : hors période`** et l'alerte `OUT_OF_WINDOW_ATTEMPT` générée sur AWS EC2.

### ⏱️ Min 8–10 : Dépouillement Temps Réel, Réconciliation & Intégrité SHA-256
1. Onglet **📊 Résultats & Reçu** :
   - Montre les barres de résultats en direct + le compteur **Doubles votes bloqués** et **Hors période bloqués**.
   - Pointe l'encadré vert **✅ Réconciliation Inter-Cloud Validée** : `Urne Supabase (PaaS #1) == Registre indépendant AWS EC2 (IaaS #2)`.
   - Colle le code reçu `VC-XXXX-XXXX` dans **Vérifier un Reçu** → montre que le bulletin est confirmé sur les deux clouds **sans révéler le choix du candidat**.
2. Onglet **🔐 Journal d'Audit (AWS EC2)** :
   - Montre les événements `LOGIN_SUCCESS`, `VOTE_CAST`, `DOUBLE_VOTE_ATTEMPT`, `OUT_OF_WINDOW_ATTEMPT` avec leurs badges cloud source (`GCP-IaaS`, `AWS-FaaS`).
   - Clique **🔍 Vérifier l'intégrité SHA-256** → montre le bandeau vert prouvant qu'aucun bloc n'a été altéré depuis le bloc Genesis.

---

## 3. Commandes `curl` de preuve directe (si la prof demande un test hors interface)

Remplace les IP/URL par les tiennes :

```bash
# 1. Santé IaaS #1 (GCP Compute Engine)
curl -s http://<IP_GCP>/health

# 2. Santé IaaS #2 (AWS EC2 Audit Node)
curl -s http://<IP_AWS_EC2>/health

# 3. Santé FaaS #1 (AWS Lambda Function URL HTTPS)
curl -s https://<ID_LAMBDA>.lambda-url.eu-west-3.on.aws/health

# 4. Vérification cryptographique directe sur AWS EC2
curl -s http://<IP_AWS_EC2>/api/audit/verify

# 5. Preuve qu'un appel non signé au webhook d'audit AWS EC2 est rejeté (HTTP 401)
curl -i -X POST http://<IP_AWS_EC2>/api/audit/events \
  -H "Content-Type: application/json" \
  -d '{"eventType":"FAKE_EVENT","sourceCloud":"ATTACKER"}'
```

---

## 4. Questions probables du jury & Réponses modèles

1. **« Pourquoi avoir mis l'authentification sur GCP (IaaS) et l'audit sur AWS EC2 (IaaS) au lieu de tout mettre sur la même VM ? »**  
   *Réponse :* Pour appliquer le principe de **séparation des pouvoirs (Separation of Duties)** et éviter un *Single Point of Trust*. Si la VM d'authentification GCP était compromise, elle ne peut pas modifier rétroactivement la chaîne d'audit SHA-256 stockée sur le disque EBS d'AWS EC2, et toute insertion frauduleuse directe dans Supabase serait détectée par la **réconciliation inter-cloud**.

2. **« Quelle est la différence concrète entre vos 2 IaaS, vos 2 PaaS et votre FaaS ? »**  
   *Réponse :*
   - Sur **GCP Compute Engine** et **AWS EC2 (IaaS)**, je gère moi-même l'OS Ubuntu, le pare-feu `UFW`, les règles réseau cloud, le reverse proxy `Nginx`, le runtime Node.js et le démon `systemd`.
   - Sur **Supabase** et **Render (PaaS)**, je n'ai aucun accès SSH ni OS à patcher : le fournisseur gère l'infrastructure, le TLS et la plateforme ; je ne déploie que le schéma SQL ou le code applicatif.
   - Sur **AWS Lambda (FaaS)**, il n'y a même pas de serveur actif en continu : mon code s'exécute uniquement à l'événement (soumission d'un bulletin), passe automatiquement à l'échelle lors d'un pic d'électeurs et coûte 0 € au repos.

3. **« Comment garantissez-vous l'anonymat ET l'impossibilité de voter deux fois en même temps ? »**  
   *Réponse :* Par un **nullifier cryptographique** `voter_hash = HMAC-SHA256(secret, electionId:voterId)`. Il est déterministe pour un même couple électeur/scrutin (donc bloqué par la contrainte SQL `UNIQUE(election_id, voter_hash)` même en cas de requêtes concurrentes), mais irréversible sans la clé secrète et découplé de toute information nominative dans la table `votes`.

4. **« Comment assurez-vous qu'un attaquant ne puisse pas appeler directement AWS Lambda ou falsifier le journal d'audit ? »**  
   *Réponse :* Deux verrous cryptographiques : (1) AWS Lambda exige un **Vote Token JWT** de durée 5 min signé par GCP IaaS (`issuer`/`audience` vérifiés) et lié au seul `electionId` demandé ; (2) le webhook d'audit d'AWS EC2 rejette toute requête sans signature **`X-Audit-Signature` HMAC-SHA256** valide (comparaison en temps constant `timingSafeEqual`).

5. **« Pourquoi n'avez-vous pas utilisé Azure ? »**  
   *Réponse :* Pour respecter votre consigne d'éviter les services déjà traités en TP (VM/DB Azure) et démontrer une maîtrise véritablement multicloud sur **GCP, AWS, Supabase et Render**.

---

## 5. Checklist finale (Mardi 24 Novembre soir)

- [ ] Les 5 voyants dans `https://votecloud-frontend-paas.onrender.com` sont **VERTS** (`UP`).
- [ ] `BASE_URL=https://... node tests/e2e-test.mjs` passe **8/8 en vert**.
- [ ] Les comptes démo (`saad@votecloud.ma`, `salma@votecloud.ma`, `admin@votecloud.ma`) n'ont pas encore voté sur le scrutin OPEN (ou un compte électeur frais comme `salma@votecloud.ma` / `youssef@votecloud.ma` est prêt pour le vote live devant la prof).
- [ ] La fiche technique (`docs/FICHE_TECHNIQUE.md`) est relue et exportée en PDF si besoin.
- [ ] Captures d'écran de secours prises pour chaque console cloud (au cas où le Wi-Fi de l'école serait lent).
- [ ] Partage de connexion 4G/5G prêt sur ton téléphone en plan B pour la démo en présentiel !
