# Feuille de Route Soutenance — VoteCloud (Mercredi 25 Novembre · 12h15)

> **À relire demain matin (10 min)** — Tout est simplifié, exact et prêt à dire à l'oral devant **Prof. Imane HILAL**.

---

## 1. Ton projet en 30 secondes (À savoir par cœur)

**Nom :** VoteCloud — Plateforme de vote électronique multicloud sécurisée.  
**Contraintes respectées :** **2 IaaS + 2 PaaS + 1 FaaS**, **4 fournisseurs différents**, **0 service Azure**, **0 €**.

| Modèle | Provider | Service réel déployé | Rôle en 1 phrase simple |
|---|---|---|---|
| **IaaS #1** | **Oracle Cloud (OCI)** | VM Ubuntu `votecloud-oci-auth-iaas` (`51.170.128.156`, Casablanca) | Authentifie les électeurs et crée un **ticket de vote anonyme** (`voter_hash`). |
| **IaaS #2** | **Oracle Cloud (OCI)** | VM Ubuntu `votecloud-oci-audit-iaas` (`51.170.134.226`, Casablanca) | Enregistre chaque preuve dans un **journal d'audit SHA-256** et calcule les résultats. |
| **PaaS #1** | **Supabase** | PostgreSQL 17 Managé (`votecloud-db`) | Stocke les données et **bloque physiquement les doubles votes** (`UNIQUE`). |
| **PaaS #2** | **Render** | Web Service Node.js (`votecloud-frontend-paas.onrender.com`) | Héberge le site web en HTTPS et fait la passerelle vers les 4 autres services. |
| **FaaS #1** | **Vercel** | Serverless Function (`votecloud-multicloud.vercel.app`) | Valide le ticket, vérifie les dates du scrutin et écrit le vote dans Supabase. |

---

## 2. Préparation 10 minutes AVANT de passer

Ouvre ces **5 onglets dans l'ordre** dans ton navigateur :

1. **Onglet 1 — Ton site (Render) :** `https://votecloud-frontend-paas.onrender.com`  
   *(Clique sur **`Actualiser`** dans la barre `Statut Live` pour réveiller Render et vérifier que les **5 points sont VERTS**.)*
2. **Onglet 2 — Oracle Cloud (OCI) :** *Compute → Instances* (on voit tes 2 VMs `Running` à Casablanca).
3. **Onglet 3 — Supabase :** *Table Editor → table `votes`* (prête à être rafraîchie).
4. **Onglet 4 — Vercel :** *Projet `votecloud-multicloud` → Logs* (pour montrer les appels serverless en direct).
5. **Onglet 5 — Render :** *Service `votecloud-frontend-paas` → Logs*.

*(Garde ton partage de connexion 4G/5G prêt sur ton téléphone au cas où le Wi-Fi de l'école serait lent !)*

---

## 3. Ta démonstration en 5 étapes (5 à 7 minutes chrono)

### ÉTAPE 1 — Montrer que les 5 clouds sont vivants (1 min)
- **Où je clique :** Onglet **`Infrastructure Multicloud`** → bouton **`Lancer un diagnostic`**.
- **Ce qui s'affiche :** 5 cartes **EN LIGNE** avec les vraies régions (`af-casablanca-1`, `eu-west-1`, `frankfurt`, `cdg1`), les hostnames et les latences.
- **Ce que je dis :**  
  > *« Voici mon architecture multicloud sans aucun service Azure : j'ai déployé 2 machines virtuelles IaaS sur Oracle Cloud à Casablanca où je gère moi-même Ubuntu, Nginx, iptables et systemd ; 2 services PaaS managés sur Supabase et Render sans gestion d'OS ; et 1 fonction serverless FaaS sur Vercel qui ne s'exécute qu'au moment d'un vote. »*
- **Preuve rapide :** Passe 5 secondes sur chacun des onglets **OCI, Supabase, Vercel, Render** pour montrer que tout tourne en vrai sur les consoles.

---

### ÉTAPE 2 — Scénario 1 : Un vote valide qui traverse les 5 clouds (1 min 30)
- **Où je clique :**
  1. Onglet **`Scrutins & Vote`** → clique sur **`Salma (Électrice)`** *(ou `Youssef` si Salma a déjà voté pendant tes essais)*.
  2. Sur le scrutin **`OPEN`** (*Élection du Bureau des Étudiants ESI*), clique **`Voter`** → choisis une liste → **`Confirmer mon vote`**.
- **Ce qui se passe en coulisses (simple) :**
  1. **Render** demande à **OCI Auth** un ticket anonyme pour Salma.
  2. **Render** envoie le bulletin + le ticket à **Vercel FaaS**.
  3. **Vercel FaaS** vérifie la signature du ticket + les dates du scrutin, puis enregistre le bulletin dans **Supabase**.
  4. **Vercel FaaS** envoie une preuve signée à **OCI Audit**, qui crée un nouveau bloc **SHA-256**.
- **Ce que je montre :**
  1. Le **Reçu Cryptographique vert** (`VC-XXXX-XXXX`) qui apparaît avec la trace des 5 clouds.
  2. Je bascule sur l'onglet **Supabase → table `votes`** → je clique *Refresh* → la nouvelle ligne apparaît **sans le nom ni l'email de Salma** (uniquement `voter_hash`).
  3. Je bascule sur l'onglet **Vercel → Logs** → on voit l'exécution serverless `POST /api/vote` (`201`).
- **Ce que je dis :**  
  > *« Le vote vient de traverser mes 5 services cloud. Dans Supabase, le bulletin est enregistré mais aucun nom n'apparaît : uniquement un hash anonyme pour garantir le secret du vote. »*

---

### ÉTAPE 3 — Scénario 2 : Bloquer un double vote (45 sec)
- **Où je clique :** Toujours connecté en tant que Salma, clique sur le bouton rouge **`Simuler double vote (409)`** sur le même scrutin.
- **Ce qui s'affiche :** Une alerte rouge **`[HTTP 409 - FaaS] Tentative de double vote bloquée`**.
- **Ce que je dis :**  
  > *« Même si un utilisateur essaie de tricher en contournant le site, OCI recalcule exactement le même `voter_hash` pour Salma sur ce scrutin. La contrainte SQL `UNIQUE(election_id, voter_hash)` dans Supabase bloque physiquement le doublon. La fonction FaaS renvoie une erreur 409 et envoie une alerte de sécurité à mon serveur d'audit OCI. »*

---

### ÉTAPE 4 — Scénario 3 : Bloquer un vote hors période (30 sec)
- **Où je clique :** Sur le scrutin **`CLOSED`** ou **`UPCOMING`**, clique sur le bouton jaune **`Tester hors période (403)`**.
- **Ce qui s'affiche :** Une alerte **`[HTTP 403 - FaaS] Vote refusé (hors période)`**.
- **Ce que je dis :**  
  > *« C'est la fonction serverless Vercel qui vérifie la date officielle en base de données. Un scrutin clôturé ou non ouvert est bloqué côté serveur en HTTP 403 et journalisé. »*

---

### ÉTAPE 5 — Dépouillement en direct & Journal d'Audit SHA-256 (1 min)
- **Où je clique :**
  1. Onglet **`Dépouillement & Reçu`** → montre les barres de résultats en direct + l'encadré vert **`Réconciliation Inter-Cloud Validée`** (*nombre de bulletins dans Supabase == nombre de preuves sur OCI Audit*).
  2. Colle le code reçu `VC-...` dans **`Vérification d'un Reçu`** → clique **`Vérifier`** *(prouve que le bulletin est compté sans jamais révéler le choix du candidat)*.
  3. Onglet **`Journal d'Audit`** → montre les lignes `LOGIN_SUCCESS`, `VOTE_CAST`, `DOUBLE_VOTE_ATTEMPT`, `OUT_OF_WINDOW_ATTEMPT` → clique **`Vérifier l'intégrité SHA-256`** → bandeau vert confirmant qu'aucun bloc n'a été falsifié.
- **Ce que je dis :**  
  > *« Mon 2ème serveur IaaS OCI est totalement indépendant du serveur d'authentification : il garde une chaîne de hachage SHA-256 sur son propre disque. Si quelqu'un modifiait un bulletin directement dans Supabase, la réconciliation inter-cloud détecterait immédiatement la fraude. »*

---

## 4. Les 6 questions les plus probables (Réponses en 2 phrases)

1. **« Pourquoi 2 VMs OCI au lieu d'une seule ? »**  
   *Réponse :* Pour séparer les pouvoirs (*Separation of Duties*) : la VM #1 gère l'identité des électeurs, la VM #2 gère l'audit et le dépouillement. Si l'une est compromise, elle ne peut pas falsifier l'autre.
2. **« Quelle différence entre vos VMs OCI (IaaS) et Render/Supabase (PaaS) ? »**  
   *Réponse :* Sur mes VMs OCI, j'ai installé et configuré moi-même Ubuntu, `iptables`, Nginx, Node.js et `systemd` en SSH. Sur Render et Supabase, je n'ai aucun accès OS : je ne gère que le code ou le SQL.
3. **« Pourquoi Vercel Serverless (FaaS) pour le vote ? »**  
   *Réponse :* Le vote est un événement ponctuel avec de gros pics à l'ouverture et à la clôture. Le FaaS passe à l'échelle automatiquement et ne coûte rien quand personne ne vote.
4. **« Comment garantissez-vous l'anonymat ET l'anti-double vote en même temps ? »**  
   *Réponse :* Par un hash `HMAC-SHA256(secret, scrutin + électeur)`. Il est anonyme (aucun nom dans l'urne) mais toujours identique pour un même électeur, donc bloqué par `UNIQUE` en base de données.
5. **« Comment sécurisez-vous la communication entre vos différents clouds ? »**  
   *Réponse :* En HTTPS/TLS partout, avec un **JWT de 5 minutes** signé par OCI Auth pour appeler le FaaS, et une **signature HMAC-SHA256** (`X-Audit-Signature`) pour authentifier les webhooks vers OCI Audit.
6. **« Combien coûte votre infrastructure ? »**  
   *Réponse :* **0 €** : OCI Always Free (2 VMs), Supabase Free (500 Mo), Render Free et Vercel Hobby Free.

---

## 5. Checklist express de demain matin (Mardi 24 nov.)
- [ ] Vérifier que les **5 pastilles sont VERTES** sur `https://votecloud-frontend-paas.onrender.com`.
- [ ] Garder au moins **2 comptes électeurs frais** (`Salma` et `Youssef`) qui n'ont pas encore voté pour la démo live devant la prof.
- [ ] Avoir [FICHE_TECHNIQUE.md](file:///c:/Users/saadc/OneDrive/Bureau/cloud_project/docs/FICHE_TECHNIQUE.md) prête (si la prof demande un récapitulatif écrit).
- [ ] Faire 1 répétition à voix haute (5 min chrono) avec cette feuille sous les yeux.
