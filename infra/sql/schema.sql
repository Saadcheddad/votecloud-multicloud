-- ==============================================================================
-- VoteCloud - Schéma PostgreSQL Managé (PaaS #1 : Supabase PostgreSQL 15+)
-- ==============================================================================
-- Exécuter ce script dans Supabase -> SQL Editor -> New Query -> Run
-- ou via : npm run db:init
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Table des électeurs et administrateurs (gérée par IaaS #1 - GCP Compute Engine)
CREATE TABLE IF NOT EXISTS voters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    national_id VARCHAR(50) NOT NULL UNIQUE,
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(160) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'voter' CHECK (role IN ('voter', 'admin')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Table des scrutins (création/gestion par Admin via GCP IaaS #1)
CREATE TABLE IF NOT EXISTS elections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('UPCOMING', 'OPEN', 'CLOSED')),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    created_by UUID REFERENCES voters(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_election_dates CHECK (ends_at > starts_at)
);

-- 3. Table des candidats / options de vote par scrutin
CREATE TABLE IF NOT EXISTS candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    party VARCHAR(150) NOT NULL DEFAULT '',
    program TEXT NOT NULL DEFAULT '',
    color VARCHAR(20) NOT NULL DEFAULT '#2563eb',
    display_order INT NOT NULL DEFAULT 0
);

-- 4. Urne électronique anonymisée (écrite EXCLUSIVEMENT par FaaS #1 - AWS Lambda)
-- Sécurité anti-double vote :
--   * voter_hash = HMAC-SHA256(VOTE_HMAC_SECRET, election_id + ':' + voter_id)
--   * Aucune donnée nominative (ni voter_id, ni email, ni CIN) dans cette table
--   * Contrainte UNIQUE atomique garantissant 1 seul vote par électeur et par scrutin
CREATE TABLE IF NOT EXISTS votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    voter_hash CHAR(64) NOT NULL,
    receipt_code VARCHAR(32) NOT NULL UNIQUE,
    receipt_hash CHAR(64) NOT NULL UNIQUE,
    lambda_request_id VARCHAR(128) NOT NULL DEFAULT 'local-dev',
    cast_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_one_vote_per_voter_per_election UNIQUE (election_id, voter_hash)
);

-- 5. Journal d'audit cryptographique chaîné SHA-256 (miroir de IaaS #2 - AWS EC2)
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    block_index INT NOT NULL UNIQUE,
    event_type VARCHAR(64) NOT NULL,
    source_cloud VARCHAR(64) NOT NULL,
    election_id UUID NULL REFERENCES elections(id) ON DELETE SET NULL,
    actor_hash VARCHAR(64) NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    prev_hash CHAR(64) NOT NULL,
    block_hash CHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index de performance
CREATE INDEX IF NOT EXISTS idx_candidates_election ON candidates(election_id);
CREATE INDEX IF NOT EXISTS idx_votes_election ON votes(election_id);
CREATE INDEX IF NOT EXISTS idx_votes_candidate ON votes(candidate_id);
CREATE INDEX IF NOT EXISTS idx_votes_receipt_code ON votes(receipt_code);
CREATE INDEX IF NOT EXISTS idx_audit_logs_election ON audit_logs(election_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
