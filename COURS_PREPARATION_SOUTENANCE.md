# Cours de Préparation à la Soutenance — Cloud Computing & Architecture VoteCloud

> **Public :** Étudiant débutant en Cloud Computing (zéro jargon non expliqué)  
> **Objectif :** Maîtriser parfaitement la théorie Cloud **ET** ton propre projet **VoteCloud** pour répondre avec aisance à toutes les questions pièges de **Prof. Imane HILAL** lors de la soutenance du **mercredi 25 novembre**.

---

## PARTIE 1 — Les Fondamentaux du Cloud appliqués à TON projet

### 1.1 Qu'est-ce que le Cloud Computing ? (L'analogie de l'électricité)
Avant le Cloud, si une école voulait héberger un site d'élection, elle devait **acheter des serveurs physiques**, les mettre dans une salle climatisée, payer l'électricité et les réparer en cas de panne (*On-Premise*).  
Avec le **Cloud Computing**, tu **loues** de la puissance informatique (serveurs, bases de données, fonctions) via Internet, à la demande, comme tu consommes l'électricité chez toi sans construire une centrale électrique.

### 1.2 IaaS vs PaaS vs FaaS — L'analogie de l'Appartement (et la Pizza)

Imagine que tu veux manger une pizza (ou habiter quelque part) :

| Modèle | Analogie Maison / Appartement | Analogie Pizza | En informatique (Cloud) |
|---|---|---|---|
| **IaaS** (*Infrastructure as a Service*) | Tu loues un **appartement vide** : le propriétaire gère les murs, l'eau et l'électricité ; **toi**, tu achètes les meubles, la serrure et tu fais le ménage. | Tu achètes la pâte et les ingrédients, tu fais la cuisson dans ton four. | Le provider te loue une **Machine Virtuelle (VM)** (CPU, RAM, disque, réseau). **Toi**, tu installes l'OS (Ubuntu), le pare-feu (`iptables`/`UFW`), `Nginx`, `Node.js` et ton code. |
| **PaaS** (*Platform as a Service*) | Tu loues un **appartement meublé clé-en-main** : tu poses juste tes valises. | Tu commandes une **pizza livrée** : tu ne gères ni le four ni la cuisine, juste ta table. | Le provider gère le matériel, l'OS, les mises à jour et le serveur. **Toi**, tu déposes uniquement ton **code** ou ton **schéma SQL**. |
| **FaaS** (*Function as a Service* / Serverless) | Tu loues une **chambre d'hôtel à l'heure** : tu ne paies que quand tu es dedans. | Tu manges une **part de pizza au comptoir** : zéro attente, tu paies juste la part mangée. | Il n'y a même plus de serveur allumé en permanence : tu déposes **une seule fonction** qui se réveille uniquement quand un **événement** arrive (un clic « Voter ») puis s'éteint. |

---

### 1.3 Le Modèle de Responsabilité Partagée appliqué à TES 5 services

Voici exactement **qui gère quoi** dans **VoteCloud** (à connaître par cœur pour l'oral !) :

```text
                        IaaS #1 & #2          PaaS #1 & #2           FaaS #1
                       (OCI & AWS EC2)     (Supabase & Render)    (AWS Lambda)
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
| **1** | **IaaS #1** | **Oracle Cloud (OCI)** — VM Ubuntu `votecloud-oci-auth-iaas` (`51.170.128.156`, Casablanca) | `backend-auth/src/server.js`, `crypto.js`, `infra/scripts/setup-oci-vm.sh`, `infra/nginx/gcp-auth.conf` | Tu as eu accès **SSH** à une VM Ubuntu vide. Tu as configuré toi-même les règles réseau OCI (**Security List**), le pare-feu OS (**iptables**), **Nginx**, **Node.js 20** et le service **`systemd` (`votecloud-auth`)**. |
| **2** | **IaaS #2** | **AWS EC2** — VM Ubuntu `t3.micro` (`eu-north-1`) | `backend-audit/src/server.js`, `hashChain.js`, `infra/scripts/setup-aws-ec2.sh`, `infra/nginx/aws-audit.conf` | Tu gères la VM Ubuntu 24.04, le **Security Group AWS**, **UFW**, **Nginx**, le disque **EBS** (`/var/lib/votecloud/audit-chain.jsonl`) et le service **`systemd` (`votecloud-audit`)**. |
| **3** | **PaaS #1** | **Supabase** — PostgreSQL 17 Managé (DBaaS) | `infra/sql/schema.sql`, `infra/sql/seed.sql` | Tu n'as **aucun accès SSH**, tu n'as ni installé Linux ni installé PostgreSQL. Supabase gère les sauvegardes, le TLS et le **Session Pooler IPv4**. Tu as juste exécuté ton SQL. |
| **4** | **PaaS #2** | **Render** — Web Service Node.js Managé (`votecloud-frontend-paas`) | `frontend/server.js`, `frontend/public/index.html`, `app.js`, `styles.css` | Tu as juste donné ton URL GitHub (`frontend/`). Render installe Node.js, exécute `npm install` + `npm start`, et fournit un **certificat HTTPS automatique** sans aucune VM à administrer. |
| **5** | **FaaS #1** | **AWS Lambda** — Fonction Node.js 20 + Function URL HTTPS | `faas-vote/index.mjs`, `faas-vote/faas-vote.zip` | Tu as uploadé un fichier `.zip` contenant une seule fonction `export async function handler(event, context)`. Aucun serveur ne tourne en continu : AWS lance la fonction à chaque vote et la met en pause après. |

---

## PARTIE 2 — Pourquoi le Multicloud et comment tes providers communiquent

### 2.1 Multicloud vs Cloud Hybride (Question classique de cours !)
- **Multicloud (TON PROJET) :** utiliser **plusieurs fournisseurs de Cloud public différents** (ici **Oracle Cloud OCI + AWS + Supabase + Render**) qui collaborent pour faire tourner une même application.
- **Cloud Hybride :** combiner un **Cloud public** (ex. AWS) avec un **datacenter privé / On-Premise** (serveurs physiques situés dans les locaux de l'entreprise ou de l'école).

### 2.2 Avantages et Défis du Multicloud
- **Avantages :**
  1. **Éviter le *Vendor Lock-in* (verrouillage fournisseur) :** tu ne dépends pas d'un seul géant (si un provider augmente ses prix ou bloque un compte — comme tu l'as vécu en vrai avec GCP/AWS ! — tu peux déplacer un composant ailleurs).
  2. **Séparation des pouvoirs (*Separation of Duties*) :** dans une élection, séparer l'autorité d'identité (**OCI**) du registre d'audit (**AWS EC2**) et de l'urne (**Supabase**) empêche un administrateur unique de truquer le scrutin.
  3. **Meilleur service pour chaque besoin (*Best-of-breed*) :** Always Free OCI à Casablanca, Lambda Always Free sur AWS, PostgreSQL managé sur Supabase, HTTPS automatique sur Render.
- **Défis :**
  1. **Latence réseau inter-cloud :** les requêtes traversent Internet entre Casablanca (OCI), Stockholm (AWS), Irlande/Paris (Supabase) et Francfort/Oregon (Render).
  2. **Sécurité des échanges :** impossible d'utiliser un réseau privé unique ; il faut donc chiffrer (HTTPS/TLS) et authentifier chaque appel inter-cloud (**JWT** + **HMAC-SHA256**).
  3. **Complexité de configuration :** il faut synchroniser les variables d'environnement (`JWT_SECRET`, `AUDIT_WEBHOOK_SECRET`, URLs) entre plusieurs consoles.

### 2.3 Parcours EXACT d'un vote (du clic jusqu'à l'audit final)

Suis ce trajet étape par étape — c'est le cœur de ta démonstration :

1. **Clic de l'électeur sur le navigateur (`frontend/public/app.js`) :**  
   L'électeur (connecté sur **Render PaaS #2** en HTTPS) choisit un candidat et clique sur *Confirmer*.
2. **Demande de Jeton de Vote anonymisé (`Render` → `OCI IaaS #1`) :**  
   `frontend/server.js` transfère `POST /api/auth/vote-token` vers **`backend-auth/src/server.js`** (sur **Oracle Cloud OCI**).  
   - OCI vérifie la session JWT de l'électeur et que son compte est actif dans **Supabase**.
   - OCI calcule le nullifier anonymisé : `voter_hash = HMAC-SHA256(VOTE_HMAC_SECRET, "electionId:voterId")`.
   - OCI signe un **Vote Token JWT** valable **5 minutes** (`issuer: votecloud-gcp-iaas-auth`, `audience: votecloud-aws-lambda-faas`) qui contient `voterHash` et `electionId`, **mais ni le nom ni l'email de l'électeur**.
3. **Validation & Enregistrement Serverless (`Render` → `AWS Lambda FaaS #1` → `Supabase PaaS #1`) :**  
   `frontend/server.js` envoie `POST /api/vote` avec le `voteToken` vers **`faas-vote/index.mjs`** sur **AWS Lambda**.  
   - AWS Lambda vérifie la signature cryptographique du `voteToken` grâce au `JWT_SECRET` partagé.
   - AWS Lambda ouvre une transaction SQL (`BEGIN`) sur **Supabase PostgreSQL** :
     - Vérifie `status === 'OPEN'` et `starts_at <= NOW() <= ends_at` (sinon → **HTTP 403**).
     - Exécute `INSERT INTO votes (election_id, candidate_id, voter_hash, receipt_code, receipt_hash, ...)`.
     - Si l'électeur a déjà voté, la contrainte SQL `UNIQUE(election_id, voter_hash)` renvoie l'erreur `23505` → **HTTP 409 (`DOUBLE_VOTE_DETECTED`)**.
     - Sinon → `COMMIT` + génération du reçu (`VC-XXXX-XXXX`).
4. **Scellement dans la Chaîne d'Audit (`AWS Lambda FaaS #1` → `AWS EC2 IaaS #2`) :**  
   AWS Lambda envoie un webhook HTTP signé (`X-Audit-Signature: HMAC-SHA256`) à `POST /api/audit/events` sur **`backend-audit/src/server.js`** (**AWS EC2**).  
   - AWS EC2 vérifie la signature HMAC (`timingSafeEqual`).
   - **`backend-audit/src/hashChain.js`** calcule le hash SHA-256 du nouveau bloc chaîné au bloc précédent (`prevHash`), l'écrit dans `/var/lib/votecloud/audit-chain.jsonl` sur son disque EBS, et le réplique dans la table `audit_logs` de **Supabase**.
5. **Réponse finale à l'électeur :**  
   L'électeur reçoit son **Reçu Cryptographique** (`receiptCode`, `receiptHash`, `awsRequestId` de Lambda, numéro de bloc AWS EC2).

---

## PARTIE 3 — Sécurité, Fiabilité, Scalabilité & Coûts

### 3.1 Comment les 5 règles de sécurité d'une élection sont garanties
1. **Authentification forte (`backend-auth/src/crypto.js`) :** mots de passe jamais stockés en clair, mais hachés avec **`scrypt`** + sel aléatoire unique par électeur (`crypto.scryptSync` + comparaison temps constant `timingSafeEqual`).
2. **Anti-Double Vote mathématique & atomique :**
   - `voter_hash = HMAC-SHA256(VOTE_HMAC_SECRET, electionId:voterId)` est **déterministe** (un même électeur produit toujours le même hash sur un même scrutin).
   - La contrainte SQL **`UNIQUE(election_id, voter_hash)`** dans `infra/sql/schema.sql` rend physiquement impossible un double vote, **même si un attaquant envoie 2 requêtes à la même milliseconde** (*race condition*).
3. **Anonymat (Secret du vote) :**
   - La table `votes` ne contient **aucune colonne nominative** (ni `voter_id`, ni `email`, ni `CIN`).
   - Le journal d'audit envoyé à AWS EC2 ne contient **jamais le `candidateId`** : on prouve *qu'un vote valide a eu lieu*, jamais *pour qui*.
4. **Intégrité & Anti-Falsification (Hash-Chain + Réconciliation) :**
   - Chaque bloc d'audit contient le hash SHA-256 du bloc précédent (principe de la blockchain). Modifier 1 caractère d'un ancien bloc casse tous les suivants, ce que détecte `GET /api/audit/verify`.
   - `GET /api/audit/tally/:electionId` compare le nombre de bulletins dans **Supabase** au nombre de preuves `VOTE_CAST` dans le fichier EBS local d'**AWS EC2** (**Réconciliation Inter-Cloud**).
5. **Défense réseau en profondeur :**
   - **Couche 1 (Cloud) :** Security List OCI + Security Group AWS (seuls les ports `22`, `80`, `443` ouverts ; les ports Node `3001`/`3002` sont fermés à Internet).
   - **Couche 2 (OS) :** `iptables` / `UFW` dans Ubuntu + **Nginx Reverse Proxy** avec rate-limiting sur `/api/auth/login`.
   - **Couche 3 (Application) :** HTTPS/TLS sur Render, AWS Lambda et Supabase (`DATABASE_SSL=true`), JWT courte durée (5 min) et signatures webhooks **HMAC-SHA256**.

### 3.2 Scalabilité & Facturation à l'usage
- **Scalabilité verticale (*Scale Up*) :** augmenter la puissance d'une même VM (ex. passer d'une `t3.micro` à une `t3.large`). Limité et nécessite souvent un redémarrage.
- **Scalabilité horizontale (*Scale Out*) :** multiplier le nombre d'instances en parallèle. C'est ce que fait **AWS Lambda (FaaS)** automatiquement : si 500 électeurs cliquent en même temps, AWS lance des dizaines d'instances parallèles de `faas-vote` en quelques millisecondes.
- **Pay-as-you-go & Always Free :** dans le Cloud, on paie uniquement ce qu'on consomme. Ici, nous exploitons les quotas gratuits permanents (**Always Free**) : OCI (VMs gratuites à vie), AWS Lambda (1 million d'invocations/mois à vie), Supabase (500 Mo gratuits à vie), Render (Free Tier) et AWS Free Plan (\$100 crédits plafonnés à 0 \$).

---

## PARTIE 4 — Simulation de Soutenance : 15 Questions Pièges + Réponses Modèles

### Question 1 : « Pourquoi ne pas avoir tout mis sur une seule VM ? »
- **Ce que le prof vérifie :** Comprends-tu l'intérêt du Cloud distribué et de la sécurité par séparation ?
- **Réponse modèle :** *« Tout mettre sur une seule VM créerait un **Single Point of Failure** (si la VM tombe, tout s'arrête) et un **Single Point of Trust** (un seul pirate ou admin compromis pourrait modifier à la fois les électeurs, l'urne et les logs d'audit). En séparant l'authentification sur OCI, le traitement du vote sur AWS Lambda, l'urne sur Supabase et l'audit sur AWS EC2, on isole les risques et chaque composant utilise le modèle Cloud le plus adapté. »*

### Question 2 : « Quelle est la différence concrète entre votre VM OCI (IaaS) et votre serveur Render (PaaS) ? »
- **Ce que le prof vérifie :** Maîtrises-tu le modèle de responsabilité partagée ?
- **Réponse modèle :** *« Sur OCI, j'ai dû me connecter en SSH sur Ubuntu, ouvrir les ports dans la Security List et `iptables`, installer Node.js 20, configurer Nginx en reverse proxy et créer un service `systemd`. Sur Render, je n'ai aucun accès SSH ni OS à maintenir : j'ai juste fourni mon dépôt GitHub et Render gère le runtime, le déploiement et le certificat HTTPS automatiquement. »*

### Question 3 : « Pourquoi utiliser une fonction FaaS (AWS Lambda) spécialement pour voter, et pas pour l'authentification ? »
- **Ce que le prof vérifie :** Sais-tu quand choisir le Serverless (FaaS) ?
- **Réponse modèle :** *« L'acte de vote est **événementiel et sporadique** : il y a des pics intenses à l'ouverture et juste avant la clôture du scrutin, puis zéro trafic le reste du temps. Le FaaS passe automatiquement à l'échelle lors des pics et coûte 0 € au repos (1 million de requêtes gratuites/mois). »*

### Question 4 : « Que se passe-t-il si votre FaaS reçoit 10 000 votes en 1 seconde ? »
- **Ce que le prof vérifie :** Connais-tu le comportement d'un FaaS sous charge et le vrai goulot d'étranglement ?
- **Réponse modèle :** *« AWS Lambda va scaler horizontalement en lançant des instances parallèles de `faas-vote`. Le vrai goulot d'étranglement ne sera pas Lambda, mais le nombre de connexions simultanées sur **Supabase PostgreSQL**. C'est précisément pour cela que nous utilisons le **Session/Transaction Pooler** de Supabase et un pool réduit (`max: 3` dans `faas-vote/index.mjs`) réutilisé entre invocations warm. En production massive, on ajouterait une file de messages (comme AWS SQS) devant l'écriture en base. »*

### Question 5 : « Qu'est-ce qu'un *Cold Start* sur AWS Lambda et comment l'avez-vous géré ? »
- **Ce que le prof vérifie :** Connais-tu les limites techniques du FaaS ?
- **Réponse modèle :** *« Un *Cold Start* est le délai (quelques centaines de millisecondes) nécessaire à AWS pour démarrer un nouveau conteneur Lambda quand la fonction n'a pas été appelée récemment. Dans `faas-vote/index.mjs`, je réutilise le `Pool` PostgreSQL en variable globale (`let sharedPool = null`) pour que les invocations suivantes (*Warm Starts*) soient quasi instantanées, et mon endpoint `/health` renvoie même le champ `coldStart: true/false`. »*

### Question 6 : « Où est stocké l'état (les données) de votre application ? Vos services sont-ils *stateless* ? »
- **Ce que le prof vérifie :** Distingues-tu les composants *stateless* (sans état) des composants *stateful* (avec état) ?
- **Réponse modèle :** *« `frontend` (Render), `backend-auth` (OCI) et `faas-vote` (AWS Lambda) sont **100 % stateless** : ils ne stockent aucune donnée durable en mémoire, les sessions sont des JWT signés. L'état est stocké à deux endroits : dans **Supabase PostgreSQL (PaaS #1)** pour les données ACID, et sur le **volume EBS persistant d'AWS EC2 (IaaS #2)** pour le fichier append-only `audit-chain.jsonl`. »*

### Question 7 : « Si Oracle Cloud (IaaS #1) tombe en panne pendant l'élection, que se passe-t-il ? »
- **Ce que le prof vérifie :** Comprends-tu la tolérance aux pannes de ton architecture ?
- **Réponse modèle :** *« Les nouvelles connexions et émissions de jetons de vote sont temporairement indisponibles. En revanche, **aucun bulletin déjà enregistré n'est perdu** (ils sont sur Supabase), le **dépouillement temps réel, la vérification des reçus et le journal d'audit continuent de fonctionner à 100 %** car ils tournent indépendamment sur AWS EC2 et Supabase. »*

### Question 8 : « Et si le nœud d'audit AWS EC2 (IaaS #2) tombe en panne, est-ce que le vote est bloqué ? »
- **Ce que le prof vérifie :** As-tu pensé au découplage entre services ?
- **Réponse modèle :** *« Non ! Dans `backend-auth/src/auditClient.js` et `faas-vote/index.mjs`, l'appel webhook vers AWS EC2 a un timeout court (`4s–4.5s`) et est géré dans un bloc `try/catch` non-bloquant. Le bulletin reste enregistré de manière atomique dans Supabase, et l'écart temporaire sera immédiatement visible dans la réconciliation inter-cloud dès le redémarrage d'AWS EC2. »*

### Question 9 : « Comment garantissez-vous qu'un électeur ne peut pas voter 2 fois en cliquant très vite (attaque par concurrence) ? »
- **Ce que le prof vérifie :** Ne t'appuies-tu pas seulement sur le bouton gris du frontend ?
- **Réponse modèle :** *« Jamais sur le frontend ! Même si un attaquant contourne l'interface avec `curl` et envoie 2 requêtes simultanées à AWS Lambda, la base PostgreSQL impose une **contrainte atomique `UNIQUE(election_id, voter_hash)`**. Le premier `INSERT` réussit, le second échoue forcément avec le code PostgreSQL `23505`, qu'AWS Lambda traduit en `HTTP 409 DOUBLE_VOTE_DETECTED` et journalise comme alerte sur AWS EC2. »*

### Question 10 : « Si `voter_hash` est stocké dans `votes`, un administrateur ne peut-il pas retrouver qui a voté pour qui ? »
- **Ce que le prof vérifie :** Comprends-tu les limites et garanties de ton anonymisation ?
- **Réponse modèle :** *« `voter_hash` est un HMAC-SHA256 utilisant un secret serveur (`VOTE_HMAC_SECRET`) présent **uniquement sur OCI (IaaS #1)** — ni Supabase, ni AWS Lambda, ni AWS EC2 ne possèdent ce secret ! Donc quelqu'un qui lit la base Supabase ou les logs AWS ne peut pas inverser le hash pour retrouver l'électeur. En production gouvernementale, on irait encore plus loin avec des preuves à divulgation nulle de connaissance (ZKP) ou du chiffrement homomorphe. »*

### Question 11 : « Pourquoi votre Lambda Function URL a `Auth type: NONE` ? Ce n'est pas une faille de sécurité ? »
- **Ce que le prof vérifie :** Comprends-tu la différence entre sécurité IAM AWS et sécurité applicative JWT ?
- **Réponse modèle :** *« `Auth type: NONE` signifie simplement que l'URL n'exige pas une signature IAM AWS (qu'un navigateur citoyen ne possède pas). Mais la fonction n'est **pas** ouverte à n'importe qui : dès la première ligne, `faas-vote/index.mjs` exige et vérifie un **Vote Token JWT** de 5 minutes signé par OCI (`issuer` + `audience` vérifiés). Sans jeton valide, Lambda rejette immédiatement en `HTTP 401`. »*

### Question 12 : « Comment empêchez-vous quelqu'un d'envoyer de faux événements à votre nœud d'audit AWS EC2 ? »
- **Ce que le prof vérifie :** As-tu sécurisé la communication inter-cloud ?
- **Réponse modèle :** *« Chaque requête vers `POST /api/audit/events` doit contenir un en-tête `X-Audit-Signature` calculé par `HMAC-SHA256(AUDIT_WEBHOOK_SECRET, rawBody)`. AWS EC2 recalcule la signature sur le corps brut et compare en temps constant (`crypto.timingSafeEqual`). Tout appel non signé est rejeté en `HTTP 401 INVALID_WEBHOOK_SIGNATURE`. »*

### Question 13 : « Pourquoi avez-vous mis Nginx devant Node.js sur vos 2 VMs IaaS ? »
- **Ce que le prof vérifie :** Connais-tu le rôle d'un Reverse Proxy en architecture Cloud ?
- **Réponse modèle :** *« Pour 3 raisons DevSecOps : (1) **Isolation** : Node.js écoute uniquement sur `127.0.0.1:3001/3002` (inaccessible de l'extérieur), seul Nginx expose le port standard `80` ; (2) **Sécurité** : Nginx masque la version serveur (`server_tokens off`), ajoute des en-têtes HTTP de sécurité et applique un **rate-limiting anti-brute-force** (`10 req/s`) sur `/api/auth/login` ; (3) **Évolutivité** : il permet d'ajouter TLS/HTTPS ou du load-balancing sans toucher au code Node.js. »*

### Question 14 : « Pourquoi le frontend sur Render fait-il office de passerelle (BFF Proxy) vers OCI et AWS ? »
- **Ce que le prof vérifie :** As-tu vraiment déployé et rencontré de vrais problèmes réseau Cloud ?
- **Réponse modèle :** *« Parce que Render sert l'application en **HTTPS**, alors que nos deux VMs IaaS sans nom de domaine payant exposent du **HTTP**. Si le navigateur appelait directement `http://51.170.128.156` depuis une page `https://`, Chrome bloquerait la requête pour **Mixed Content**. En utilisant `frontend/server.js` comme passerelle BFF côté serveur, le navigateur ne parle qu'en HTTPS à Render, et Render route de serveur à serveur vers OCI, AWS Lambda et AWS EC2. »*

### Question 15 : « Pourquoi avez-vous utilisé le *Session Pooler* de Supabase au lieu de la connexion directe ? »
- **Ce que le prof vérifie :** Preuve ultime que tu as déployé en vrai sur le Cloud !
- **Réponse modèle :** *« Sur l'offre gratuite de Supabase, la connexion directe (`db.xxx.supabase.co`) est en **IPv6 uniquement**, tandis que les instances IaaS OCI/AWS et AWS Lambda utilisent **IPv4** par défaut. Le **Session Pooler** (port 5432, `pooler.supabase.com`) est compatible IPv4 et mutualise les connexions PostgreSQL, ce qui évite les erreurs `ENETUNREACH` et protège la base contre la saturation de connexions depuis AWS Lambda. »*

---

## PARTIE 5 — Glossaire des 15 Mots-Clés à placer naturellement à l'oral

1. **IaaS / PaaS / FaaS** : les 3 niveaux d'abstraction Cloud (VM gérée / plateforme managée / fonction événementielle).
2. **Modèle de Responsabilité Partagée** : répartition des tâches de sécurité/maintenance entre toi et le fournisseur Cloud.
3. **Multicloud** : combinaison de plusieurs providers publics différents (OCI, AWS, Supabase, Render).
4. **Vendor Lock-in** : dépendance excessive à un seul fournisseur Cloud (évitée ici).
5. **Stateless vs Stateful** : service sans mémoire locale (Lambda, Render, Auth) vs stockage persistant (Supabase, EBS).
6. **Reverse Proxy** : serveur intermédiaire (`Nginx`) qui filtre, protège et redirige le trafic vers l'application interne.
7. **Security Group / Security List** : pare-feu réseau virtuel géré au niveau du fournisseur Cloud (AWS / OCI).
8. **Cold Start / Warm Start** : temps de démarrage à froid d'une fonction FaaS vs réutilisation d'un conteneur déjà chaud.
9. **Scalabilité Horizontale (*Scale Out*)** : ajout automatique d'instances parallèles pour absorber un pic de charge.
10. **Transaction ACID** : garantie de la base PostgreSQL qu'un vote est enregistré en entier ou pas du tout, sans corruption.
11. **Idempotence / Contrainte `UNIQUE`** : garantie qu'une action répétée (double vote) ne peut pas créer de doublon.
12. **JWT (JSON Web Token)** : jeton cryptographiquement signé permettant de prouver une identité d'un cloud à un autre.
13. **HMAC-SHA256** : signature cryptographique à clé secrète utilisée pour anonymiser `voter_hash` et authentifier les webhooks.
14. **Hash-Chain (Chaîne de hachage)** : journal d'audit où chaque bloc contient l'empreinte SHA-256 du précédent (anti-falsification).
15. **Separation of Duties (Séparation des pouvoirs)** : aucun cloud individuel ne détient à la fois l'identité civile, l'urne et le registre d'audit.
