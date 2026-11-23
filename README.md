# VoteCloud — Plateforme d'Élection & Vote Électronique Multicloud

Projet académique complet d'architecture **Multicloud DevSecOps** (coût **0,00 €**, **0 service Azure**) implémentant exactement **2 IaaS + 2 PaaS + 1 FaaS** sur **4 plateformes cloud distinctes** (**Oracle Cloud OCI**, **Supabase**, **Render**, **Vercel**).

---

## Architecture en un coup d'œil

| # | Modèle | Service Cloud | Provider | Module du dépôt | Rôle |
|---|---|---|---|---|---|
| 1 | **IaaS #1** | OCI Compute (`VM.Standard.A1.Flex`, Ubuntu 22.04, Casablanca) | **Oracle Cloud (OCI)** | [`backend-auth/`](./backend-auth) | Authentification (`scrypt` + JWT), gestion des scrutins, émission du jeton de vote anonymisé |
| 2 | **IaaS #2** | OCI Compute (`VM.Standard.A1.Flex`, Ubuntu 22.04, Casablanca) | **Oracle Cloud (OCI)** | [`backend-audit/`](./backend-audit) | Journal d'audit chaîné SHA-256 (disque local), dépouillement temps réel & réconciliation inter-cloud |
| 3 | **PaaS #1** | Supabase (PostgreSQL 17 Managé / DBaaS) | **Supabase** | [`infra/sql/`](./infra/sql) | Stockage ACID & contrainte `UNIQUE(election_id, voter_hash)` anti-double vote |
| 4 | **PaaS #2** | Render Web Service (Node.js Managé) | **Render** | [`frontend/`](./frontend) | Portail web citoyen/admin HTTPS & passerelle BFF multicloud |
| 5 | **FaaS #1** | Vercel Serverless Functions (Node.js 20 HTTPS) | **Vercel** | [`faas-vote/`](./faas-vote) | Validation serverless du vote, contrôle de période & enregistrement atomique |

---

## Structure du dépôt

```text
cloud_project/
├── backend-auth/          # IaaS #1 (Oracle Cloud OCI VM #1) : Auth, Scrutins, Vote Token
├── backend-audit/         # IaaS #2 (Oracle Cloud OCI VM #2) : Chaîne d'audit SHA-256, Tally, Reçus
├── faas-vote/             # FaaS #1 (Vercel Serverless Functions) : /api/vote, /api/health + handler
├── frontend/              # PaaS #2 (Render Web Service) : UI Web SPA + Passerelle BFF HTTPS
├── infra/
│   ├── sql/               # schema.sql + seed.sql (PaaS #1 Supabase PostgreSQL)
│   ├── nginx/             # Configurations Reverse Proxy durcies (OCI Auth & OCI Audit)
│   ├── scripts/           # Scripts bash automatisés OCI (iptables, Node 20, Nginx, systemd)
│   ├── terraform/         # IaC Terraform Multicloud (OCI 2 VMs + VCN/Security List)
│   └── docker-compose.yml # Simulation complète locale des 5 services
├── tests/
│   ├── e2e-test.mjs       # Suite E2E (local Docker ou production multicloud)
│   └── local-integration-test.mjs # Validation autonome hors-ligne des 4 serveurs
├── docs/
│   ├── ARCHITECTURE.md               # Architecture détaillée, schémas Mermaid/ASCII & coûts 0 €
│   ├── FICHE_TECHNIQUE.md            # Fiche technique prête pour remise académique (ESI)
│   ├── GUIDE_DEPLOIEMENT.md          # Guide solo pas-à-pas de zéro à la production (OCI/Supabase/Render/Vercel)
│   ├── GUIDE_SOUTENANCE.md           # Scénario de démo complet, commandes curl & Q/A jury
│   ├── FEUILLE_ROUTE_SOUTENANCE.md   # Fiche express de démonstration (5 étapes en 5 min)
│   └── COURS_PREPARATION_SOUTENANCE.md # Cours complet Cloud Computing & 15 questions pièges
├── .env.example
└── package.json
```

---

## Démarrage rapide

### 1. Test local immédiat (sans Docker ni compte cloud)
```bash
npm run install:all
npm run test:local-mock
```

### 2. Simulation complète locale avec Docker Compose
```bash
docker compose -f infra/docker-compose.yml up --build
# Ouvrir http://localhost:3000
# Dans un autre terminal :
npm run test:e2e
```

### 3. Tests automatisés sur la production Multicloud
```bash
BASE_URL=https://votecloud-frontend-paas.onrender.com node tests/e2e-test.mjs
```

### 4. Documentation
- Architecture & schémas : **[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)**
- Fiche technique ESI : **[`docs/FICHE_TECHNIQUE.md`](./docs/FICHE_TECHNIQUE.md)**
- Guide de déploiement complet : **[`docs/GUIDE_DEPLOIEMENT.md`](./docs/GUIDE_DEPLOIEMENT.md)**
- Feuille de route soutenance : **[`docs/FEUILLE_ROUTE_SOUTENANCE.md`](./docs/FEUILLE_ROUTE_SOUTENANCE.md)**
- Cours & 15 questions pièges : **[`docs/COURS_PREPARATION_SOUTENANCE.md`](./docs/COURS_PREPARATION_SOUTENANCE.md)**

---

## Comptes de démonstration pré-chargés

| Rôle | Email | Mot de passe | CIN |
|---|---|---|---|
| Administrateur | `admin@votecloud.ma` | `Admin@2026!` | `ADM-0001` |
| Électeur 1 | `saad@votecloud.ma` | `Vote@2026!` | `CIN-1001` |
| Électeur 2 | `salma@votecloud.ma` | `Vote@2026!` | `CIN-1002` |
| Électeur 3 | `youssef@votecloud.ma` | `Vote@2026!` | `CIN-1003` |
| Électeur 4 | `nadia@votecloud.ma` | `Vote@2026!` | `CIN-1004` |
