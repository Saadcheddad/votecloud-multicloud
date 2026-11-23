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
| **IaaS #1** | **OCI Compute (VM #1)** | **Oracle Cloud (OCI)** | VM `VM.Standard.A1.Flex` (`af-casablanca-1`), Ubuntu 22.04 LTS, OCI Security List + `iptables`, Nginx Reverse Proxy (rate limiting), Node.js 20 (`systemd`) | Héberge l'Autorité d'Authentification et de Gestion des Scrutins (`backend-auth`). Vérifie les électeurs et signe des jetons de vote anonymisés à durée de vie de 5 minutes. |
| **IaaS #2** | **OCI Compute (VM #2)** | **Oracle Cloud (OCI)** | VM `VM.Standard.A1.Flex` (`af-casablanca-1`), Ubuntu 22.04 LTS, OCI Security List + `iptables`, Nginx, volume persistant local, Node.js 20 (`systemd`) | Héberge le Nœud Indépendant d'Audit Cryptographique (`backend-audit`). Scelle chaque événement dans une chaîne de hachage SHA-256 locale (`audit-chain.jsonl`), calcule le dépouillement et exécute la réconciliation inter-cloud. |
| **PaaS #1** | **Supabase PostgreSQL 17** | **Supabase (DBaaS)** | PostgreSQL 17 managé, RLS activé, connexion TLS via Session Pooler IPv4, 0 gestion d'OS | Stocke les données persistantes (`voters`, `elections`, `candidates`, `votes`, `audit_logs`) et impose la contrainte ACID `UNIQUE(election_id, voter_hash)` empêchant tout double vote. |
| **PaaS #2** | **Render Web Service** | **Render** | Plateforme Node.js managée, déploiement Git, HTTPS/TLS automatique, 0 gestion d'OS | Héberge l'interface web citoyenne/administrateur (`frontend`) et fournit une passerelle BFF HTTPS unifiée vers OCI Auth, Vercel Serverless et OCI Audit. |
| **FaaS #1** | **Vercel Serverless Functions** | **Vercel** | Fonctions serverless événementielles Node.js 20 HTTPS (`/api/vote`, `/api/health`), Logs temps réel | Processeur événementiel de vote (`faas-vote`). Valide la signature cryptographique du jeton OCI, vérifie la fenêtre temporelle du scrutin, insère atomiquement le vote dans Supabase et notifie OCI Audit. |

---

## 3. Flux détaillé des données et interconnexion multicloud

### Flux A — Authentification & Obtention d'un droit de vote (Render → OCI VM #1 → Supabase → OCI VM #2)
1. L'électeur saisit ses identifiants sur le portail HTTPS (**PaaS #2 Render**).
2. La requête est transmise à l'API d'authentification (**IaaS #1 OCI VM #1**), qui vérifie le mot de passe `scrypt` dans **PaaS #1 Supabase PostgreSQL** et émet un JWT de session.
3. Lorsque l'électeur choisit un scrutin, **OCI IaaS #1** génère le nullifier anonymisé `voter_hash = HMAC-SHA256(secret, electionId:voterId)` et signe un **Jeton de Vote (`voteToken`)** valable 5 minutes.
4. L'événement de connexion est envoyé via webhook signé HMAC-SHA256 au nœud d'audit (**IaaS #2 OCI VM #2**).

### Flux B — Vote, Anti-Double Vote & Scellement d'Audit (Render → Vercel FaaS → Supabase → OCI VM #2)
1. Le portail (**PaaS #2 Render**) envoie le bulletin (`electionId`, `candidateId`) et le `voteToken` à la fonction serverless (**FaaS #1 Vercel**).
2. **Vercel FaaS** valide la signature cryptographique du jeton émis par **OCI Auth**.
3. **Vercel FaaS** ouvre une transaction SQL vers **PaaS #1 Supabase** :
   - Si le scrutin est `CLOSED` ou `UPCOMING` (ou hors `starts_at..ends_at`) → rejet **HTTP 403** + alerte `OUT_OF_WINDOW_ATTEMPT` envoyée à **OCI Audit**.
   - Si le couple `(election_id, voter_hash)` existe déjà dans `votes` → violation de la contrainte `UNIQUE` → rejet **HTTP 409** + alerte `DOUBLE_VOTE_ATTEMPT` envoyée à **OCI Audit**.
   - Si le vote est valide → `INSERT` atomique du bulletin + génération d'un reçu cryptographique (`receiptCode`, `receiptHash`).
4. **Vercel FaaS** envoie une preuve signée (`VOTE_CAST`, sans le choix du candidat pour garantir le secret du vote) à **IaaS #2 OCI Audit**, qui scelle un nouveau bloc SHA-256 sur son disque local et le réplique dans `audit_logs`.

### Flux C — Dépouillement temps réel & Réconciliation Inter-Cloud (Render → OCI VM #2 ↔ Supabase)
1. L'utilisateur consulte l'onglet *Dépouillement & Reçu* ou *Journal d'Audit*.
2. **IaaS #2 OCI Audit** agrège les résultats en direct depuis **Supabase PaaS #1**, compare le nombre total de bulletins en base au nombre de preuves `VOTE_CAST` dans son registre local (réconciliation inter-cloud) et permet de vérifier l'intégrité mathématique de toute la chaîne SHA-256.

---

## 4. Scénarios démontrés en direct lors de la soutenance

| Scénario | Services sollicités en direct | Résultat vérifié sur les consoles Cloud |
|---|---|---|
| **1. Diagnostic Multicloud Live** | Les 5 services simultanément | Statut `EN LIGNE`, hostnames OCI Casablanca, PostgreSQL 17 Supabase, invocation ID Vercel FaaS. |
| **2. Vote valide** | Render → OCI #1 → Vercel FaaS → Supabase → OCI #2 | `HTTP 201`, reçu `VC-XXXX-XXXX`, nouvelle ligne anonyme visible dans Supabase Table Editor, logs Vercel, bloc SHA-256 sur OCI #2. |
| **3. Tentative de double vote** | Render → OCI #1 → Vercel FaaS → Supabase → OCI #2 | Rejet `HTTP 409 DOUBLE_VOTE_DETECTED`, aucun doublon en base, alerte scellée dans la chaîne OCI #2. |
| **4. Vote hors période (`CLOSED` & `UPCOMING`)** | Render → OCI #1 → Vercel FaaS → Supabase → OCI #2 | Rejet `HTTP 403 ELECTION_CLOSED / NOT_STARTED`, alerte `OUT_OF_WINDOW_ATTEMPT` scellée sur OCI #2. |
| **5. Vérification d'intégrité & Reçu** | Render → OCI #2 ↔ Supabase | Recalcul SHA-256 de tous les blocs validé + réconciliation `Urne Supabase == Registre OCI Audit`. |
