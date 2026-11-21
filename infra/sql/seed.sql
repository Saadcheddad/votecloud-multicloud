-- ==============================================================================
-- VoteCloud - Données de démonstration (Idempotent)
-- ==============================================================================
-- Comptes de démonstration pré-configurés :
--   Admin   : admin@votecloud.ma   / Admin@2026! (CIN: ADM-0001)
--   Électeur: saad@votecloud.ma    / Vote@2026!  (CIN: CIN-1001)
--   Électeur: salma@votecloud.ma   / Vote@2026!  (CIN: CIN-1002)
--   Électeur: youssef@votecloud.ma / Vote@2026!  (CIN: CIN-1003)
--   Électeur: nadia@votecloud.ma   / Vote@2026!  (CIN: CIN-1004)
-- ==============================================================================

INSERT INTO voters (id, national_id, full_name, email, password_hash, role, is_active)
VALUES
  (
    '10000000-0000-4000-8000-000000000001',
    'ADM-0001',
    'Administrateur Électoral',
    'admin@votecloud.ma',
    'scrypt$a1b2c3d4e5f60718293a4b5c6d7e8f90$fd44ba6857a3f0877c7616521fa93437688b6face81d9ff15bcc66c4ec8fde584a5bf503e578f63798c50a5a923fa3b787b4ae3f155eaee8f82d9d68fad81402',
    'admin',
    TRUE
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'CIN-1001',
    'Saad Ch.',
    'saad@votecloud.ma',
    'scrypt$11223344556677889900aabbccddeeff$b917df0fefc8f965f5fb288705731bf28ffa23412d27eaa3abf9027459f4ad18e22760fc6f4302025eeaa806da038a313427aef0b63e1e718874e82eb20542c2',
    'voter',
    TRUE
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    'CIN-1002',
    'Salma B.',
    'salma@votecloud.ma',
    'scrypt$22334455667788990011bbccddeeffaa$e7764e7e0a042a555d2114a9d200dd30b2ee0dabd3ab9dca501c0b0224eafdfe125501e228e4f4a0acd5ea36011307dca6ee509540ea9a816bbfcda4eaf0e4c7',
    'voter',
    TRUE
  ),
  (
    '10000000-0000-4000-8000-000000000004',
    'CIN-1003',
    'Youssef K.',
    'youssef@votecloud.ma',
    'scrypt$33445566778899001122ccddeeffaabb$ee3bdaac54962d8125b61ae99c4effe883cb678d9762a662cca350d3e3abb1a4774f2358c2e842f8010ce43e01248d69e5d84cb2b57efbbff4c0962e78b93ca3',
    'voter',
    TRUE
  ),
  (
    '10000000-0000-4000-8000-000000000005',
    'CIN-1004',
    'Nadia M.',
    'nadia@votecloud.ma',
    'scrypt$44556677889900112233ddeeffaabbcc$6ecb037f655d77b11e7d754297566dc63527da8a906ca554306d8768e9ad21e4b310d3d7f92e8ba9a68bf46c53821ff2ac959463323e306a0bae7bfa23c608ef',
    'voter',
    TRUE
  )
ON CONFLICT (email) DO NOTHING;

-- 3 Scrutins de démonstration couvrant TOUS les scénarios de la soutenance :
-- 1) OPEN     -> Scénario 1 (Vote valide) + Scénario 2 (Tentative de double vote)
-- 2) CLOSED   -> Scénario 3a (Vote hors période : scrutin clôturé)
-- 3) UPCOMING -> Scénario 3b (Vote hors période : scrutin non encore ouvert)

INSERT INTO elections (id, title, description, status, starts_at, ends_at, created_by)
VALUES
  (
    '20000000-0000-4000-8000-000000000001',
    'Élection du Bureau des Étudiants ESI — Promo 2027',
    'Scrutin officiel ouvert pour élire la liste représentative des étudiants en ingénierie Data & Cyberdéfense. Vote unique anonymisé garanti par AWS Lambda + PostgreSQL + Audit Hash-Chain.',
    'OPEN',
    NOW() - INTERVAL '2 days',
    NOW() + INTERVAL '30 days',
    '10000000-0000-4000-8000-000000000001'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'Référendum Campus Numérique 2026 (Clôturé)',
    'Scrutin terminé — utilisé pour démontrer le blocage serveur (HTTP 403) lors d''une tentative de vote sur un scrutin clôturé.',
    'CLOSED',
    NOW() - INTERVAL '15 days',
    NOW() - INTERVAL '2 days',
    '10000000-0000-4000-8000-000000000001'
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    'Conseil Scientifique & Innovation 2027 (À venir)',
    'Scrutin planifié dans le futur — utilisé pour démontrer le blocage serveur (HTTP 403) avant la date d''ouverture officielle.',
    'UPCOMING',
    NOW() + INTERVAL '7 days',
    NOW() + INTERVAL '21 days',
    '10000000-0000-4000-8000-000000000001'
  )
ON CONFLICT (id) DO NOTHING;

-- Candidats du scrutin 1 (OUVERT)
INSERT INTO candidates (id, election_id, name, party, program, color, display_order)
VALUES
  (
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'Liste CyberNova',
    'Pôle Sécurité & Cloud',
    'Labs Cyberdéfense 24/7, hackathons CTF mensuels et bourses de certifications Cloud (AWS/GCP).',
    '#2563eb',
    1
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    'Liste DataPulse',
    'Pôle IA & Science des Données',
    'Cluster GPU partagé, ateliers MLOps, partenariats entreprises Data/IA et mentorat PFE.',
    '#10b981',
    2
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000001',
    'Liste OpenESI',
    'Collectif Innovation & Vie Campus',
    'Modernisation des espaces collaboratifs, clubs open-source et mobilité internationale.',
    '#f59e0b',
    3
  ),
  (
    '30000000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000001',
    'Vote Blanc',
    'Expression neutre',
    'Bulletin blanc comptabilisé dans la participation sans attribution à une liste.',
    '#64748b',
    4
  ),
  -- Candidats du scrutin 2 (CLÔTURÉ)
  (
    '30000000-0000-4000-8000-000000000005',
    '20000000-0000-4000-8000-000000000002',
    'Pour la dématérialisation totale',
    'Option OUI',
    'Passage à 100% numérique pour les démarches administratives du campus.',
    '#10b981',
    1
  ),
  (
    '30000000-0000-4000-8000-000000000006',
    '20000000-0000-4000-8000-000000000002',
    'Maintien du format hybride',
    'Option NON',
    'Conservation d''un guichet physique en complément du portail numérique.',
    '#ef4444',
    2
  ),
  -- Candidats du scrutin 3 (À VENIR)
  (
    '30000000-0000-4000-8000-000000000007',
    '20000000-0000-4000-8000-000000000003',
    'Dr. Amina Tazi',
    'Axe Systèmes Distribués & Cloud',
    'Développement d''une plateforme pédagogique multicloud open-source.',
    '#8b5cf6',
    1
  ),
  (
    '30000000-0000-4000-8000-000000000008',
    '20000000-0000-4000-8000-000000000003',
    'Dr. Karim Mansouri',
    'Axe Cryptographie & Sécurité',
    'Renforcement des travaux pratiques en cryptographie appliquée et vote vérifiable.',
    '#06b6d4',
    2
  )
ON CONFLICT (id) DO NOTHING;
