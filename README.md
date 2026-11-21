# VoteCloud — Plateforme d'Élection & Vote Électronique Multicloud

Projet académique complet d'architecture **Multicloud DevSecOps** (coût **0,00 €**, **0 service Azure**) implémentant exactement **2 IaaS + 2 PaaS + 1 FaaS** sur **4 plateformes cloud distinctes**.

---

## Architecture en un coup d'œil

| # | Modèle | Service Cloud | Provider | Module du dépôt | Rôle |
|---|---|---|---|---|---|
| 1 | **IaaS #1** | Compute Engine (`e2-micro`, Ubuntu) | **GCP** | [`backend-auth/`](./backend-auth) | Authentification (`scrypt` + JWT), gestion des scrutins, jeton de vote anonymisé |
| 2 | **IaaS #2** | Amazon EC2 (`t3.micro`, Ubuntu) | **AWS** | [`backend-audit/`](./backend-audit) | Journal d'audit chaîné SHA-256 (EBS), dépouillement & réconciliation inter-cloud |
| 3 | **PaaS #1** | Supabase (PostgreSQL 15+ Managé) | **Supabase** | [`infra/sql/`](./infra/sql) | Stockage ACID & contrainte `UNIQUE(election_id, voter_hash)` anti-double vote |
| 4 | **PaaS #2** | Render Web Service (Node.js Managé) | **Render** | [`frontend/`](./frontend) | Portail web citoyen/admin HTTPS & passerelle BFF multicloud |
| 5 | **FaaS #1** | AWS Lambda + Function URL HTTPS | **AWS** | [`faas-vote/`](./faas-vote) | Validation serverless du vote, fenêtre temporelle & enregistrement atomique |

---

## Structure du dépôt

```text
cloud_project/
├── backend-auth/          # IaaS #1 (GCP Compute Engine) : Auth, Scrutins, Vote Token
├── backend-audit/         # IaaS #2 (AWS EC2) : Chaîne d'audit SHA-256, Tally, Reçus
├── faas-vote/             # FaaS #1 (AWS Lambda) : Handler serverless + script .zip
├── frontend/              # PaaS #2 (Render Web Service) : UI Web SPA + Passerelle BFF
├── infra/
│   ├── sql/               # schema.sql + seed.sql (PaaS #1 Supabase PostgreSQL)
│   ├── nginx/             # Configurations Reverse Proxy durcies (GCP & AWS EC2)
│   ├── scripts/           # Scripts bash automatisés (UFW, Node 20, Nginx, systemd)
│   ├── terraform/         # IaC Multicloud (GCP VM + AWS EC2 + AWS Lambda)
│   └── docker-compose.yml # Simulation complète locale des 5 services
├── tests/
│   ├── e2e-test.mjs       # Suite E2E (local Docker ou production multicloud)
│   └── local-integration-test.mjs # Validation autonome hors-ligne des 4 serveurs
├── docs/
│   ├── ARCHITECTURE.md    # Architecture détaillée, schémas Mermaid/ASCII & coûts 0 €
│   ├── FICHE_TECHNIQUE.md # Fiche technique prête pour remise académique (ESI)
│   ├── GUIDE_DEPLOIEMENT.md # Guide solo pas-à-pas de zéro à la production
│   └── GUIDE_SOUTENANCE.md  # Scénario de démo live, commandes curl & Q/A jury
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

### 3. Déploiement réel Multicloud (0 €)
Suivre étape par étape le guide complet : **[`docs/GUIDE_DEPLOIEMENT.md`](./docs/GUIDE_DEPLOIEMENT.md)**.

### 4. Préparation de la soutenance
Consulter la checklist et le script live : **[`docs/GUIDE_SOUTENANCE.md`](./docs/GUIDE_SOUTENANCE.md)**.

---

## Comptes de démonstration pré-chargés

| Rôle | Email | Mot de passe | CIN |
|---|---|---|---|
| Administrateur | `admin@votecloud.ma` | `Admin@2026!` | `ADM-0001` |
| Électeur 1 | `saad@votecloud.ma` | `Vote@2026!` | `CIN-1001` |
| Électeur 2 | `salma@votecloud.ma` | `Vote@2026!` | `CIN-1002` |
| Électeur 3 | `youssef@votecloud.ma` | `Vote@2026!` | `CIN-1003` |
| Électeur 4 | `nadia@votecloud.ma` | `Vote@2026!` | `CIN-1004` |
