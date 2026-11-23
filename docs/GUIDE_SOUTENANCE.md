# Guide de Soutenance & Checklist de Démonstration (Mercredi 25 Novembre · 12h15)

> **Rappel du barème de Prof. Imane HILAL :**  
> Ce qui est évalué en priorité : **la mise en œuvre concrète de chaque service cloud (IaaS, PaaS, FaaS) chez au moins 2 providers différents, leur interconnexion en direct sur les consoles des providers, et un scénario d'utilisation complet.**  
> *(Pour une version express en 1 page à relire le matin même, consulte aussi [`FEUILLE_ROUTE_SOUTENANCE.md`](./FEUILLE_ROUTE_SOUTENANCE.md).)*

---

## 1. Préparation 15 minutes AVANT de passer devant le jury

Ouvre **5 onglets bien ordonnés** dans ton navigateur avant d'entrer en salle :

1. **Onglet 1 — Portail VoteCloud (PaaS #2 Render) :** `https://votecloud-frontend-paas.onrender.com`  
   *(Clique sur **Actualiser** dans la barre `Statut Live` pour réveiller Render et vérifier que les 5 points sont VERTS.)*
2. **Onglet 2 — Console Oracle Cloud OCI (IaaS #1 & #2) :** *Compute → Instances* (`votecloud-oci-auth-iaas` et `votecloud-oci-audit-iaas` en état `Running` à Casablanca).
3. **Onglet 3 — Console Supabase (PaaS #1) :** *Table Editor → table `votes`* (prête à être rafraîchie devant la prof).
4. **Onglet 4 — Console Vercel (FaaS #1) :** *Projet `votecloud-multicloud` → Logs* (pour montrer les invocations serverless en direct).
5. **Onglet 5 — Console Render (PaaS #2) :** *Service `votecloud-frontend-paas` → Logs*.

---

## 2. Script de présentation minute par minute (8 à 10 minutes)

### Min 0–2 : Présentation de l'architecture Multicloud
- Explique la problématique : un système de vote exige **séparation des pouvoirs**, **anti-double vote**, **anonymat** et **auditabilité**.
- Présente les **5 services répartis sur 4 clouds (0 Azure, 0 €)** :
  1. **IaaS #1 — Oracle Cloud OCI VM #1 (`votecloud-oci-auth-iaas`, Casablanca)** : authentification électeurs, gestion des scrutins, émission de jetons anonymisés (`voter_hash = HMAC-SHA256`).
  2. **IaaS #2 — Oracle Cloud OCI VM #2 (`votecloud-oci-audit-iaas`, Casablanca)** : nœud indépendant d'audit cryptographique (chaîne SHA-256 sur disque local) et dépouillement vérifiable.
  3. **PaaS #1 — Supabase (PostgreSQL 17 Managé)** : stockage ACID, RLS activé, contrainte `UNIQUE(election_id, voter_hash)`.
  4. **PaaS #2 — Render (Web Service Managé)** : portail web HTTPS + passerelle BFF.
  5. **FaaS #1 — Vercel Serverless Functions (Node.js 20 HTTPS)** : validation serverless du bulletin et écriture atomique.

### Min 2–3 : Preuve directe des 5 services dans les consoles Cloud
- Dans VoteCloud, ouvre l'onglet **Infrastructure Multicloud** → clique **Lancer un diagnostic** → montre les **vraies régions**, **hostnames VM**, **version PostgreSQL 17** et **ID d'invocation FaaS**.
- Fais un passage éclair (5–10 secondes par onglet) sur **OCI**, **Supabase**, **Vercel** et **Render**.

### Min 3–7 : Démonstration Live des 3 Scénarios de Test

#### Scénario 1 : Vote Valide (Traversée complète des 5 services)
1. Onglet **Scrutins & Vote** → clique sur **Salma (Électrice)** (connexion via **OCI IaaS #1**).
2. Sur le scrutin **OPEN** (*Élection du Bureau des Étudiants ESI*), clique **Voter** → choisis une liste → **Confirmer mon vote**.
3. Montre le **Reçu Cryptographique** (`VC-XXXX-XXXX`, empreinte SHA-256, ID invocation Vercel FaaS, numéro de bloc OCI Audit et trace des 5 services).
4. **Preuves consoles en direct :**
   - Bascule sur **Supabase (Onglet 3)** → rafraîchis `votes` → montre la nouvelle ligne **sans nom ni email** (uniquement `voter_hash` + `receipt_code`).
   - Bascule sur **Vercel (Onglet 4)** → montre l'invocation serverless `POST /api/vote` (`201`).

#### Scénario 2 : Tentative de Double Vote (Blocage HTTP 409)
1. Toujours connecté en tant que **Salma**, clique sur **Simuler double vote (409)** sur le même scrutin.
2. Montre l'alerte **`[HTTP 409 - FaaS] Tentative de double vote bloquée !`**
3. Explique : OCI génère le même `voter_hash` déterministe ; **Vercel FaaS** tente l'insertion dans **Supabase**, la contrainte atomique `UNIQUE(election_id, voter_hash)` renvoie l'erreur PostgreSQL `23505`, et le FaaS notifie **OCI Audit** par webhook signé HMAC.

#### Scénario 3 : Vote Hors Période (Blocage HTTP 403)
1. Sur le scrutin **CLOSED** ou **UPCOMING**, clique **Tester hors période (403)**.
2. Montre le rejet serveur **`[HTTP 403 - FaaS] Vote refusé`** et l'alerte `OUT_OF_WINDOW_ATTEMPT` scellée sur OCI Audit.

### Min 7–9 : Dépouillement Temps Réel, Réconciliation & Intégrité SHA-256
1. Onglet **Dépouillement & Reçu** :
   - Montre les résultats en direct + compteurs de tentatives bloquées.
   - Pointe l'encadré vert **Réconciliation Inter-Cloud Validée** (`Urne Supabase == Registre OCI Audit`).
   - Colle le code reçu `VC-XXXX-XXXX` dans **Vérification d'un Reçu** → montre que le bulletin est confirmé sans révéler le choix du candidat.
2. Onglet **Journal d'Audit** :
   - Montre les événements `LOGIN_SUCCESS`, `VOTE_CAST`, `DOUBLE_VOTE_ATTEMPT`, `OUT_OF_WINDOW_ATTEMPT`.
   - Clique **Vérifier l'intégrité SHA-256** → bandeau vert prouvant l'intégrité de toute la chaîne.

---

## 3. Commandes `curl` de preuve directe (si la prof demande un test hors interface)

```bash
# 1. Santé IaaS #1 (Oracle Cloud OCI Auth)
curl -s http://51.170.128.156/health

# 2. Santé IaaS #2 (Oracle Cloud OCI Audit)
curl -s http://51.170.134.226/health

# 3. Santé FaaS #1 (Vercel Serverless Function)
curl -s https://votecloud-multicloud.vercel.app/health

# 4. Vérification cryptographique directe de la chaîne d'audit sur OCI #2
curl -s http://51.170.134.226/api/audit/verify

# 5. Preuve qu'un appel non signé au webhook d'audit OCI #2 est rejeté (HTTP 401)
curl -i -X POST http://51.170.134.226/api/audit/events \
  -H "Content-Type: application/json" \
  -d '{"eventType":"FAKE_EVENT","sourceCloud":"ATTACKER"}'
```

---

## 4. Checklist finale (Veille de soutenance)

- [ ] Les 5 points de `Statut Live` sur `https://votecloud-frontend-paas.onrender.com` sont **VERTS**.
- [ ] `BASE_URL=https://votecloud-frontend-paas.onrender.com node tests/e2e-test.mjs` passe **8/8 en vert**.
- [ ] Au moins 2 comptes démo (`salma@votecloud.ma`, `youssef@votecloud.ma`) n'ont pas encore voté pour la démo live.
- [ ] Fiche technique (`docs/FICHE_TECHNIQUE.md`) relue et exportée en PDF si besoin.
- [ ] Partage de connexion 4G/5G prêt en secours sur le téléphone.
