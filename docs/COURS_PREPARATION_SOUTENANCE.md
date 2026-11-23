# Cours de Préparation à la Soutenance — Cloud Computing & Architecture VoteCloud

> **Public :** Étudiant débutant en Cloud Computing (zéro jargon non expliqué)  
> **Objectif :** Maîtriser parfaitement la théorie Cloud **ET** ton propre projet **VoteCloud** (déployé sur **Oracle Cloud OCI ×2 + Supabase + Render + Vercel**) pour répondre avec aisance à toutes les questions pièges de **Prof. Imane HILAL**.

---

## PARTIE 1 — Les Fondamentaux du Cloud appliqués à TON projet

### 1.1 Qu'est-ce que le Cloud Computing ? (L'analogie de l'électricité)
Avant le Cloud, pour héberger un site d'élection, il fallait **acheter des serveurs physiques**, les mettre dans une salle climatisée et les maintenir soi-même (*On-Premise*).  
Avec le **Cloud Computing**, tu **loues** de la puissance informatique (serveurs, bases de données, fonctions) via Internet, à la demande, comme tu consommes l'électricité sans construire ta propre centrale.

### 1.2 IaaS vs PaaS vs FaaS — L'analogie de l'Appartement (et de la Pizza)

| Modèle | Analogie Appartement | Analogie Pizza | En informatique (Cloud) |
|---|---|---|---|
| **IaaS** (*Infrastructure as a Service*) | Tu loues un **appartement vide** : le propriétaire gère les murs et l'électricité ; **toi**, tu gères les meubles, la serrure et le ménage. | Tu achètes pâte + ingrédients et tu cuis dans ton four. | Le provider te loue une **Machine Virtuelle (VM)**. **Toi**, tu installes l'OS (Ubuntu), le pare-feu (`iptables`), `Nginx`, `Node.js` et ton code. |
| **PaaS** (*Platform as a Service*) | Tu loues un **appartement meublé clé-en-main**. | Tu commandes une **pizza livrée** : tu ne gères ni le four ni la cuisine. | Le provider gère le matériel, l'OS et les mises à jour. **Toi**, tu déposes uniquement ton **code** ou ton **schéma SQL**. |
| **FaaS** (*Function as a Service* / Serverless) | Tu loues une **chambre à l'heure** uniquement quand tu en as besoin. | Tu manges une **part de pizza au comptoir** sans attendre. | Aucun serveur ne tourne en continu : tu déposes **une fonction** qui se réveille uniquement quand un **événement** arrive (un clic « Voter ») puis s'éteint. |

---

### 1.3 Le Modèle de Responsabilité Partagée appliqué à TES 5 services

```text
                        IaaS #1 & #2          PaaS #1 & #2           FaaS #1
                       (OCI VM1 & VM2)     (Supabase & Render)      (Vercel)
                     +-----------------+   +-----------------+   +-----------------+
  Ton Code / SQL     |      TOI        |   |      TOI        |   |      TOI        |
  Configuration App  |      TOI        |   |      TOI        |   |      TOI        |
                     +-----------------+   +-----------------+   +-----------------+
  Runtime (Node.js)  |      TOI        |   |    PROVIDER     |   |    PROVIDER     |
  Nginx / Pare-feu   |      TOI        |   |    PROVIDER     |   |    PROVIDER     |
  OS (Ubuntu/Patch)  |      TOI        |   |    PROVIDER     |   |    PROVIDER     |
                     +-----------------+   +-----------------+   +-----------------+
  VM / Hyperviseur   |    PROVIDER     |   |    PROVIDER     |   |    PROVIDER     |
  Serveurs Physiques |    PROVIDER     |   |    PROVIDER     |   |    PROVIDER     |
  Datacenter / Réseau|    PROVIDER     |   |    PROVIDER     |   |    PROVIDER     |
                     +-----------------+   +-----------------+   +-----------------+
```

### 1.4 Cartographie exacte de TES 5 services (Fichiers + Rôle + Preuve)

| # | Modèle | Provider & Service | Dossier / Fichiers clés dans ton code | Pourquoi c'est ce modèle ? |
|---|---|---|---|---|
| **1** | **IaaS #1** | **Oracle Cloud (OCI)** — VM #1 `votecloud-oci-auth-iaas` (`51.170.128.156`, Casablanca) | `backend-auth/src/server.js`, `crypto.js`, `infra/scripts/setup-oci-vm.sh` | Accès **SSH** à une VM Ubuntu vide. Tu as configuré toi-même la **Security List OCI**, le pare-feu OS (**iptables**), **Nginx**, **Node.js 20** et le service **`systemd` (`votecloud-auth`)**. |
| **2** | **IaaS #2** | **Oracle Cloud (OCI)** — VM #2 `votecloud-oci-audit-iaas` (`51.170.134.226`, Casablanca) | `backend-audit/src/server.js`, `hashChain.js`, `infra/scripts/setup-oci-audit-vm.sh` | 2ème VM Ubuntu indépendante gérée en SSH : **iptables**, **Nginx**, volume persistant local (`/var/lib/votecloud/audit-chain.jsonl`) et service **`systemd` (`votecloud-audit`)**. |
| **3** | **PaaS #1** | **Supabase** — PostgreSQL 17 Managé (DBaaS) | `infra/sql/schema.sql`, `infra/sql/seed.sql` | **Aucun accès SSH**, ni OS ni PostgreSQL à installer. Supabase gère les sauvegardes, le TLS, le RLS et le **Session Pooler IPv4**. Tu n'as fourni que ton SQL. |
| **4** | **PaaS #2** | **Render** — Web Service Node.js Managé (`votecloud-frontend-paas`) | `frontend/server.js`, `frontend/public/index.html`, `app.js`, `styles.css` | Tu as donné ton URL GitHub (`frontend/`). Render gère Node.js, `npm install`, `npm start` et le **certificat HTTPS automatique** sans VM à administrer. |
| **5** | **FaaS #1** | **Vercel** — Serverless Functions (`votecloud-multicloud.vercel.app`) | `faas-vote/api/vote.js`, `faas-vote/api/health.js`, `faas-vote/index.mjs`, `faas-vote/vercel.json` | Fonctions événementielles Node.js 20 sans serveur actif en continu : Vercel exécute la fonction à chaque requête `/api/vote` puis la met en veille. |

---

## PARTIE 2 — Pourquoi le Multicloud et comment tes providers communiquent

### 2.1 Multicloud vs Cloud Hybride (Question classique de cours !)
- **Multicloud (TON PROJET) :** combiner **plusieurs fournisseurs de Cloud public différents** (ici **Oracle Cloud OCI + Supabase + Render + Vercel**) pour faire collaborer une même application.
- **Cloud Hybride :** combiner un **Cloud public** avec des **serveurs privés sur site (*On-Premise*)** appartenant à l'entreprise ou à l'école.

### 2.2 Avantages et Défis du Multicloud
- **Avantages :**
  1. **Éviter le *Vendor Lock-in* (verrouillage fournisseur) :** ne pas dépendre d'un seul fournisseur (si un cloud devient payant ou indisponible, on peut migrer un composant ailleurs sans tout réécrire — ce qu'on a concrétisé avec l'adaptateur `faas-vote/api/vote.js`).
  2. **Séparation des pouvoirs (*Separation of Duties*) :** séparer l'autorité d'identité (**OCI VM #1**), le processeur de vote (**Vercel FaaS**), l'urne (**Supabase**) et le registre d'audit (**OCI VM #2**).
  3. **Best-of-breed :** utiliser chaque service là où il est le meilleur et gratuit (*Always Free*).
- **Défis :**
  1. **Latence réseau inter-cloud** (Casablanca ↔ Irlande ↔ Europe/US).
  2. **Sécurité des échanges sur Internet public** : chiffrement TLS + authentification cryptographique (**JWT** et **HMAC-SHA256**).
  3. **Synchronisation des secrets et variables d'environnement** entre 4 consoles différentes.

### 2.3 Parcours EXACT d'un vote (du clic jusqu'à l'audit final)

1. **Clic de l'électeur (`frontend/public/app.js`) :** l'électeur (connecté sur **Render PaaS #2** en HTTPS) sélectionne un candidat et confirme.
2. **Émission du Jeton de Vote anonymisé (`Render` → `OCI IaaS #1`) :**  
   `frontend/server.js` transfère `POST /api/auth/vote-token` vers **`backend-auth/src/server.js`** (`51.170.128.156`).  
   - OCI vérifie que l'électeur est actif dans **Supabase**.
   - OCI calcule `voter_hash = HMAC-SHA256(VOTE_HMAC_SECRET, "electionId:voterId")` et signe un **Vote Token JWT** valable **5 minutes** (sans nom ni email).
3. **Validation & Enregistrement Serverless (`Render` → `Vercel FaaS #1` → `Supabase PaaS #1`) :**  
   `frontend/server.js` envoie `POST /api/vote` + `voteToken` vers **`faas-vote/api/vote.js`** → **`faas-vote/index.mjs`** sur **Vercel**.  
   - Vercel vérifie la signature JWT signée par OCI Auth.
   - Vercel ouvre une transaction SQL (`BEGIN`) sur **Supabase PostgreSQL 17** :
     - Si le scrutin est `CLOSED` ou `UPCOMING` → **HTTP 403**.
     - Tente `INSERT INTO votes (...)`. Si `(election_id, voter_hash)` existe déjà → violation `UNIQUE` (code `23505`) → **HTTP 409 (`DOUBLE_VOTE_DETECTED`)**.
     - Sinon → `COMMIT` + génération du reçu (`VC-XXXX-XXXX`, `receiptHash` SHA-256).
4. **Scellement dans la Chaîne d'Audit (`Vercel FaaS #1` → `OCI IaaS #2`) :**  
   Vercel envoie un webhook signé (`X-Audit-Signature: HMAC-SHA256`) à `POST /api/audit/events` sur **`backend-audit/src/server.js`** (`51.170.134.226`).  
   - **`backend-audit/src/hashChain.js`** vérifie la signature HMAC, calcule le hash SHA-256 du bloc chaîné au précédent (`prevHash`), l'écrit dans `/var/lib/votecloud/audit-chain.jsonl` sur le disque de la VM #2 et le réplique dans `audit_logs` sur Supabase.
5. **Réponse finale :** l'électeur reçoit son **Reçu Cryptographique** vérifiable.

---

## PARTIE 3 — Sécurité, Fiabilité, Scalabilité & Coûts

### 3.1 Les 5 garanties de sécurité
1. **Authentification forte (`backend-auth/src/crypto.js`) :** mots de passe hachés avec **`scrypt`** + sel aléatoire unique (`timingSafeEqual`).
2. **Anti-Double Vote atomique :** `voter_hash = HMAC-SHA256(VOTE_HMAC_SECRET, electionId:voterId)` + contrainte SQL **`UNIQUE(election_id, voter_hash)`** dans `infra/sql/schema.sql` (bloque même deux requêtes envoyées à la même milliseconde).
3. **Secret du vote :** aucune colonne nominative dans `votes` ; le webhook `VOTE_CAST` vers OCI Audit ne contient **jamais le `candidateId`**.
4. **Intégrité (Hash-Chain + Réconciliation Inter-Cloud) :** modifier 1 bloc casse toute la chaîne SHA-256 (`GET /api/audit/verify`), et `GET /api/audit/tally/:electionId` compare le nombre de bulletins dans **Supabase** au nombre de preuves sur le disque d'**OCI Audit**.
5. **Défense en profondeur :** Security List OCI (ports 22/80/443) + `iptables` + Nginx Reverse Proxy (rate limiting `/api/auth/login`) + HTTPS/TLS + JWT 5 min + HMAC-SHA256.

### 3.2 Scalabilité & Coût 0 €
- **Scalabilité verticale (*Scale Up*) :** augmenter CPU/RAM d'une VM existante.
- **Scalabilité horizontale (*Scale Out*) :** multiplier les instances en parallèle automatiquement — c'est ce que fait **Vercel Serverless (FaaS #1)** lors d'un pic d'électeurs.
- **Coût 0 € :** 2 VMs OCI *Always Free* (`VM.Standard.A1.Flex` 1 OCPU / 6 Go chacune < quota gratuit 4 OCPU / 24 Go), Supabase Free (500 Mo), Render Free et Vercel Hobby Free.

---

## PARTIE 4 — Simulation de Soutenance : 15 Questions Pièges + Réponses Modèles

### Question 1 : « Pourquoi ne pas avoir tout mis sur une seule VM ? »
- **Ce que le prof vérifie :** Comprends-tu l'intérêt du Cloud distribué et de la sécurité par séparation ?
- **Réponse modèle :** *« Tout mettre sur une seule VM créerait un **Single Point of Failure** et un **Single Point of Trust** : un pirate ou admin compromis pourrait modifier à la fois les électeurs, l'urne et les logs d'audit. En séparant l'authentification (OCI VM #1), le traitement du vote (Vercel FaaS), l'urne (Supabase) et l'audit (OCI VM #2), on isole les responsabilités et chaque composant utilise le modèle Cloud le plus adapté. »*

### Question 2 : « Quelle est la différence concrète entre vos VMs OCI (IaaS) et Render (PaaS) ? »
- **Ce que le prof vérifie :** Maîtrises-tu le modèle de responsabilité partagée ?
- **Réponse modèle :** *« Sur OCI, je me suis connecté en SSH sur Ubuntu, j'ai ouvert les règles Ingress/Egress dans la Security List, configuré `iptables`, installé Node.js 20, Nginx en reverse proxy et créé un service `systemd`. Sur Render, je n'ai aucun accès SSH ni OS à maintenir : j'ai juste connecté mon dépôt GitHub et Render gère le runtime et le certificat HTTPS automatiquement. »*

### Question 3 : « Pourquoi utiliser une fonction FaaS (Vercel) spécialement pour voter, et pas pour tout le reste ? »
- **Ce que le prof vérifie :** Sais-tu quand choisir le Serverless (FaaS) ?
- **Réponse modèle :** *« Le vote est **événementiel et sporadique** : pics forts à l'ouverture et avant la clôture, puis calme plat. Le FaaS passe automatiquement à l'échelle par événement et ne consomme rien au repos. »*

### Question 4 : « Que se passe-t-il si votre FaaS reçoit 10 000 votes en 1 seconde ? »
- **Ce que le prof vérifie :** Connais-tu le vrai goulot d'étranglement sous charge ?
- **Réponse modèle :** *« Le FaaS Vercel va scaler horizontalement en lançant des exécutions parallèles. Le vrai goulot d'étranglement serait le nombre de connexions simultanées vers **Supabase PostgreSQL**. C'est pour cela qu'on utilise le **Session Pooler** de Supabase et un pool réduit (`max: 3` dans `faas-vote/index.mjs`) réutilisé entre invocations warm. À très grande échelle nationale, on ajouterait une file de messages (queue) devant l'écriture en base. »*

### Question 5 : « Qu'est-ce qu'un *Cold Start* en FaaS et comment l'avez-vous géré ? »
- **Ce que le prof vérifie :** Connais-tu les limites techniques du Serverless ?
- **Réponse modèle :** *« Un *Cold Start* est le léger délai de démarrage d'une fonction serverless lorsqu'elle n'a pas été invoquée récemment. Dans `faas-vote/index.mjs`, je réutilise le `Pool` PostgreSQL en variable globale (`sharedPool`) pour que les invocations suivantes (*Warm Starts*) réutilisent la connexion déjà ouverte. »*

### Question 6 : « Où est stocké l'état (les données) ? Quels services sont *stateless* ? »
- **Ce que le prof vérifie :** Distingues-tu *stateless* et *stateful* ?
- **Réponse modèle :** *« `frontend` (Render), `backend-auth` (OCI VM #1) et `faas-vote` (Vercel) sont **100 % stateless** : aucune donnée durable en mémoire, les sessions sont des JWT. L'état (*stateful*) est stocké dans **Supabase PostgreSQL (PaaS #1)** pour les données ACID, et sur le disque persistant d'**OCI VM #2 (IaaS #2)** dans `/var/lib/votecloud/audit-chain.jsonl`. »*

### Question 7 : « Si la VM #1 d'authentification tombe en panne pendant l'élection, que se passe-t-il ? »
- **Ce que le prof vérifie :** Comprends-tu la tolérance aux pannes ?
- **Réponse modèle :** *« Les nouvelles connexions sont temporairement indisponibles, mais **aucun bulletin n'est perdu** (ils sont sur Supabase), et le **dépouillement temps réel, la vérification des reçus et le journal d'audit continuent de fonctionner à 100 %** sur OCI VM #2 et Supabase. »*

### Question 8 : « Et si la VM #2 d'audit tombe en panne, le vote est-il bloqué ? »
- **Ce que le prof vérifie :** As-tu pensé au découplage ?
- **Réponse modèle :** *« Non : l'appel webhook vers la VM d'audit a un timeout court (`4,5 s`) dans un bloc `try/catch` non-bloquant. Le vote reste enregistré de manière atomique dans Supabase, et la réconciliation inter-cloud signalera l'écart dès le retour de la VM d'audit. »*

### Question 9 : « Comment garantissez-vous qu'un électeur ne peut pas voter 2 fois en cliquant très vite ? »
- **Ce que le prof vérifie :** La sécurité est-elle côté serveur/DB et pas seulement côté navigateur ?
- **Réponse modèle :** *« Jamais uniquement dans le frontend : même si quelqu'un envoie 2 requêtes simultanées via `curl`, PostgreSQL applique la contrainte atomique `UNIQUE(election_id, voter_hash)`. La 2ème requête échoue forcément avec l'erreur `23505`, renvoyée en `HTTP 409 DOUBLE_VOTE_DETECTED` et journalisée dans l'audit. »*

### Question 10 : « Peut-on retrouver qui a voté pour qui à partir de `voter_hash` dans Supabase ? »
- **Ce que le prof vérifie :** Comprends-tu les garanties de ton anonymisation ?
- **Réponse modèle :** *« `voter_hash` est calculé par `HMAC-SHA256` avec une clé secrète (`VOTE_HMAC_SECRET`) stockée **uniquement sur OCI VM #1**. Ni Supabase, ni Vercel FaaS, ni OCI VM #2 ne possèdent cette clé : un accès à la table `votes` ne permet donc pas de retrouver l'identité civile de l'électeur. »*

### Question 11 : « Comment empêchez-vous quelqu'un d'appeler directement l'URL publique de votre FaaS Vercel ? »
- **Ce que le prof vérifie :** As-tu sécurisé ton endpoint serverless ?
- **Réponse modèle :** *« Dès l'entrée de `faas-vote/index.mjs`, la fonction exige un **Vote Token JWT** de 5 minutes signé avec `JWT_SECRET` par OCI Auth et vérifie qu'il correspond exactement au scrutin demandé. Sans jeton valide, la fonction rejette immédiatement en `HTTP 401`. »*

### Question 12 : « Comment empêchez-vous un attaquant d'injecter de faux logs dans votre VM d'audit ? »
- **Ce que le prof vérifie :** Sécurité inter-cloud !
- **Réponse modèle :** *« `POST /api/audit/events` exige un en-tête `X-Audit-Signature` calculé via `HMAC-SHA256(AUDIT_WEBHOOK_SECRET, rawBody)`, vérifié en temps constant (`crypto.timingSafeEqual`). Tout appel sans signature valide est rejeté en `HTTP 401`. »*

### Question 13 : « Pourquoi avoir installé Nginx devant Node.js sur vos 2 VMs OCI ? »
- **Ce que le prof vérifie :** Connais-tu le rôle d'un Reverse Proxy ?
- **Réponse modèle :** *« Pour isoler Node.js sur les ports internes `3001`/`3002` (fermés à Internet), n'exposer que le port standard `80`, masquer la version serveur (`server_tokens off`), ajouter des en-têtes de sécurité et limiter les tentatives de brute-force (`10 req/s`) sur `/api/auth/login`. »*

### Question 14 : « Pourquoi Render fait-il office de passerelle (BFF Proxy) vers vos VMs OCI ? »
- **Ce que le prof vérifie :** Preuve que tu as déployé en réel !
- **Réponse modèle :** *« Render sert le site en **HTTPS**, alors que mes VMs OCI sur IP nue exposent du **HTTP**. Un appel direct du navigateur `https://` vers `http://51.170.128.156` serait bloqué pour **Mixed Content**. La passerelle Express `frontend/server.js` sur Render relaie de serveur à serveur, éliminant tout blocage Mixed Content et CORS. »*

### Question 15 : « Pourquoi avez-vous utilisé le *Session Pooler* de Supabase au lieu de la connexion directe ? »
- **Ce que le prof vérifie :** Preuve technique concrète de ton déploiement !
- **Réponse modèle :** *« Sur Supabase Free, la connexion directe utilise **IPv6 uniquement**, alors que mes VMs OCI et Vercel utilisent **IPv4** par défaut. Le **Session Pooler** (port 5432, `pooler.supabase.com`) est compatible IPv4 et mutualise les connexions pour éviter de saturer la base depuis le FaaS. »*

---

## PARTIE 5 — Glossaire des 15 Mots-Clés à placer à l'oral

1. **IaaS / PaaS / FaaS** : VM gérée par toi / plateforme managée / fonction événementielle serverless.
2. **Modèle de Responsabilité Partagée** : qui gère l'OS, le réseau et le code entre toi et le fournisseur.
3. **Multicloud** : collaboration de plusieurs fournisseurs Cloud publics (OCI, Supabase, Render, Vercel).
4. **Vendor Lock-in** : dépendance à un seul fournisseur (évitée grâce à notre architecture découplée).
5. **Stateless vs Stateful** : sans mémoire durable (Render, Auth, Vercel FaaS) vs persistant (Supabase, disque OCI Audit).
6. **Reverse Proxy** : serveur intermédiaire (`Nginx`) protégeant et routant vers l'API interne.
7. **Security List / iptables** : double pare-feu réseau (niveau cloud OCI + niveau OS Linux).
8. **Cold Start / Warm Start** : démarrage à froid d'une fonction FaaS vs réutilisation d'une instance chaude.
9. **Scalabilité Horizontale (*Scale Out*)** : ajout automatique d'instances parallèles sur pic de trafic.
10. **Transaction ACID** : garantie PostgreSQL qu'un bulletin est écrit complètement ou annulé proprement.
11. **Contrainte `UNIQUE` / Idempotence** : blocage atomique en base de tout double vote.
12. **JWT (JSON Web Token)** : jeton cryptographiquement signé pour prouver un droit de vote entre clouds.
13. **HMAC-SHA256** : signature à clé secrète (nullifier `voter_hash` + authentification webhooks).
14. **Hash-Chain (Chaîne de hachage)** : journal d'audit chaîné SHA-256 rendant toute modification détectable.
15. **Separation of Duties** : séparation des rôles (Identité, Vote, Urne, Audit) sur des services isolés.
