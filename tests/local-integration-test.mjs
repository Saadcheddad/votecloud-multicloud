/**
 * ==============================================================================
 * VoteCloud - Test d'intégration local autonome (sans Docker ni base externe)
 * ==============================================================================
 * Lance en mémoire les 4 serveurs réels :
 *   - backend-auth  (IaaS #1 GCP)
 *   - backend-audit (IaaS #2 AWS EC2 + vraie chaîne SHA-256 JSONL)
 *   - faas-vote     (FaaS #1 AWS Lambda handler réel)
 *   - frontend      (PaaS #2 Render BFF proxy réel)
 * avec un émulateur PostgreSQL en mémoire uniquement pour exécuter toute la suite E2E.
 * ==============================================================================
 */
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { runE2E } from './e2e-test.mjs';

const require = createRequire(import.meta.url);

// Petit émulateur SQL en mémoire couvrant nos requêtes paramétrées pour tests hors-ligne
function createInMemoryPgPool() {
  const now = Date.now();
  const state = {
    voters: [
      {
        id: '10000000-0000-4000-8000-000000000001',
        national_id: 'ADM-0001',
        full_name: 'Administrateur Électoral',
        email: 'admin@votecloud.ma',
        password_hash:
          'scrypt$a1b2c3d4e5f60718293a4b5c6d7e8f90$fd44ba6857a3f0877c7616521fa93437688b6face81d9ff15bcc66c4ec8fde584a5bf503e578f63798c50a5a923fa3b787b4ae3f155eaee8f82d9d68fad81402',
        role: 'admin',
        is_active: true,
        created_at: new Date().toISOString(),
      },
    ],
    elections: [
      {
        id: '20000000-0000-4000-8000-000000000001',
        title: 'Élection BDE ESI (OUVERT)',
        description: 'Scrutin ouvert',
        status: 'OPEN',
        starts_at: new Date(now - 86400000).toISOString(),
        ends_at: new Date(now + 10 * 86400000).toISOString(),
        created_at: new Date().toISOString(),
      },
      {
        id: '20000000-0000-4000-8000-000000000002',
        title: 'Référendum 2026 (CLÔTURÉ)',
        description: 'Scrutin fermé',
        status: 'CLOSED',
        starts_at: new Date(now - 10 * 86400000).toISOString(),
        ends_at: new Date(now - 2 * 86400000).toISOString(),
        created_at: new Date().toISOString(),
      },
      {
        id: '20000000-0000-4000-8000-000000000003',
        title: 'Conseil 2027 (À VENIR)',
        description: 'Scrutin futur',
        status: 'UPCOMING',
        starts_at: new Date(now + 5 * 86400000).toISOString(),
        ends_at: new Date(now + 15 * 86400000).toISOString(),
        created_at: new Date().toISOString(),
      },
    ],
    candidates: [
      { id: '30000000-0000-4000-8000-000000000001', election_id: '20000000-0000-4000-8000-000000000001', name: 'Liste CyberNova', party: 'Sécurité', program: 'Cloud', color: '#2563eb', display_order: 1 },
      { id: '30000000-0000-4000-8000-000000000002', election_id: '20000000-0000-4000-8000-000000000001', name: 'Liste DataPulse', party: 'IA', program: 'MLOps', color: '#10b981', display_order: 2 },
      { id: '30000000-0000-4000-8000-000000000005', election_id: '20000000-0000-4000-8000-000000000002', name: 'Option OUI', party: 'OUI', program: '', color: '#10b981', display_order: 1 },
      { id: '30000000-0000-4000-8000-000000000007', election_id: '20000000-0000-4000-8000-000000000003', name: 'Dr. Tazi', party: 'Cloud', program: '', color: '#8b5cf6', display_order: 1 },
    ],
    votes: [],
    audit_logs: [],
  };

  async function query(sql, params = []) {
    const q = sql.replace(/\s+/g, ' ').trim();

    if (q === 'BEGIN' || q === 'COMMIT' || q === 'ROLLBACK' || q === 'SELECT 1') {
      return { rows: [{ '?column?': 1 }] };
    }
    if (q.startsWith('SELECT version()')) {
      return { rows: [{ ver: 'PostgreSQL 16.0 (In-Memory Test)' }] };
    }
    if (q.includes('AS voters') && q.includes('AS elections')) {
      return { rows: [{ voters: state.voters.length, elections: state.elections.length, votes: state.votes.length }] };
    }
    if (q.startsWith('INSERT INTO voters')) {
      const [national_id, full_name, email, password_hash] = params;
      if (state.voters.some((v) => v.email === email || v.national_id === national_id)) {
        const e = new Error('duplicate key');
        e.code = '23505';
        throw e;
      }
      const row = { id: crypto.randomUUID(), national_id, full_name, email, password_hash, role: 'voter', is_active: true, created_at: new Date().toISOString() };
      state.voters.push(row);
      return { rows: [row] };
    }
    if (q.startsWith('SELECT id, national_id, full_name, email, password_hash, role, is_active FROM voters WHERE email')) {
      return { rows: state.voters.filter((v) => v.email === params[0]) };
    }
    if (q.startsWith('SELECT is_active FROM voters WHERE id')) {
      return { rows: state.voters.filter((v) => v.id === params[0]) };
    }
    if (q.startsWith("SELECT COUNT(*)::int AS total FROM voters")) {
      return { rows: [{ total: state.voters.filter((v) => v.role === 'voter' && v.is_active).length }] };
    }
    if (q === 'SELECT id FROM elections') {
      return { rows: state.elections.map((e) => ({ id: e.id })) };
    }
    if (q.startsWith('SELECT id, title, status FROM elections WHERE id') || q.startsWith('SELECT id, title, status, starts_at, ends_at FROM elections WHERE id') || q.startsWith('SELECT id, title, description, status, starts_at, ends_at FROM elections WHERE id')) {
      return { rows: state.elections.filter((e) => e.id === params[0]) };
    }
    if (q.startsWith('SELECT e.id, e.title, e.description, e.status')) {
      return {
        rows: state.elections.map((e) => ({
          ...e,
          total_votes: state.votes.filter((v) => v.election_id === e.id).length,
        })),
      };
    }
    if (q.startsWith('SELECT id, election_id, name, party, program, color, display_order FROM candidates')) {
      return { rows: state.candidates };
    }
    if (q.startsWith('SELECT id, name FROM candidates WHERE id = $1 AND election_id = $2')) {
      return { rows: state.candidates.filter((c) => c.id === params[0] && c.election_id === params[1]) };
    }
    if (q.startsWith('SELECT election_id, receipt_code, cast_at FROM votes WHERE voter_hash = ANY')) {
      const set = new Set(params[0] || []);
      return { rows: state.votes.filter((v) => set.has(v.voter_hash)) };
    }
    if (q.startsWith('INSERT INTO votes')) {
      const [election_id, candidate_id, voter_hash, receipt_code, receipt_hash, lambda_request_id, cast_at] = params;
      if (state.votes.some((v) => v.election_id === election_id && v.voter_hash === voter_hash)) {
        const e = new Error('duplicate key value violates unique constraint uq_one_vote_per_voter_per_election');
        e.code = '23505';
        throw e;
      }
      const row = { id: crypto.randomUUID(), election_id, candidate_id, voter_hash, receipt_code, receipt_hash, lambda_request_id, cast_at };
      state.votes.push(row);
      return { rows: [row] };
    }
    if (q.startsWith('SELECT v.receipt_code, v.receipt_hash, v.cast_at')) {
      const found = state.votes.find((v) => v.receipt_code === params[0]);
      if (!found) return { rows: [] };
      const elec = state.elections.find((e) => e.id === found.election_id);
      return {
        rows: [{
          receipt_code: found.receipt_code,
          receipt_hash: found.receipt_hash,
          cast_at: found.cast_at,
          lambda_request_id: found.lambda_request_id,
          election_id: elec.id,
          election_title: elec.title,
        }],
      };
    }
    if (q.startsWith('SELECT c.id, c.name, c.party, c.color, c.display_order')) {
      const electionId = params[0];
      return {
        rows: state.candidates
          .filter((c) => c.election_id === electionId)
          .map((c) => ({
            ...c,
            votes: state.votes.filter((v) => v.election_id === electionId && v.candidate_id === c.id).length,
          })),
      };
    }
    if (q.startsWith('SELECT block_index, event_type')) {
      return { rows: state.audit_logs };
    }
    if (q.startsWith('INSERT INTO audit_logs')) {
      const [block_index, event_type, source_cloud, election_id, actor_hash, details, prev_hash, block_hash, created_at] = params;
      if (!state.audit_logs.some((a) => a.block_index === block_index)) {
        state.audit_logs.push({ block_index, event_type, source_cloud, election_id, actor_hash, details: JSON.parse(details), prev_hash, block_hash, created_at });
      }
      return { rows: [] };
    }
    if (q.startsWith('SELECT COUNT(*)::int AS cnt FROM audit_logs')) {
      return { rows: [{ cnt: state.audit_logs.length }] };
    }

    throw new Error(`Requête non gérée par l'émulateur de test : ${q}`);
  }

  return {
    query,
    connect: async () => ({ query, release: () => {} }),
    end: async () => {},
  };
}

async function main() {
  const sharedPool = createInMemoryPgPool();
  const tmpLedger = path.join(os.tmpdir(), `votecloud-test-chain-${Date.now()}.jsonl`);

  const jwtSecret = 'test-jwt-secret-64-chars-ok';
  const voteHmacSecret = 'test-hmac-secret-64-chars-ok';
  const auditWebhookSecret = 'test-audit-secret-64-chars-ok';

  process.env.JWT_SECRET = jwtSecret;
  process.env.VOTE_HMAC_SECRET = voteHmacSecret;
  process.env.AUDIT_WEBHOOK_SECRET = auditWebhookSecret;

  const { createApp: createAuditApp } = require('../backend-audit/src/server.js');
  const { createApp: createAuthApp } = require('../backend-auth/src/server.js');
  const { createApp: createFrontendApp } = require('../frontend/server.js');
  const { setCustomPool } = await import('../faas-vote/index.mjs');
  const { createLocalLambdaServer } = await import('../faas-vote/local-server.mjs');

  setCustomPool(sharedPool);

  const auditApp = createAuditApp({ pool: sharedPool, auditWebhookSecret, ledgerPath: tmpLedger }).app;
  const auditServer = await new Promise((resolve) => {
    const s = auditApp.listen(0, '127.0.0.1', () => resolve(s));
  });
  const auditUrl = `http://127.0.0.1:${auditServer.address().port}`;
  process.env.AUDIT_SERVICE_URL = auditUrl;

  const authApp = createAuthApp({ pool: sharedPool, jwtSecret, voteHmacSecret, auditWebhookSecret, auditServiceUrl: auditUrl }).app;
  const authServer = await new Promise((resolve) => {
    const s = authApp.listen(0, '127.0.0.1', () => resolve(s));
  });
  const authUrl = `http://127.0.0.1:${authServer.address().port}`;

  const faasServer = await new Promise((resolve) => {
    const s = createLocalLambdaServer().listen(0, '127.0.0.1', () => resolve(s));
  });
  const faasUrl = `http://127.0.0.1:${faasServer.address().port}`;

  const frontendApp = createFrontendApp({ authServiceUrl: authUrl, auditServiceUrl: auditUrl, faasVoteUrl: faasUrl }).app;
  const frontendServer = await new Promise((resolve) => {
    const s = frontendApp.listen(0, '127.0.0.1', () => resolve(s));
  });
  const frontendUrl = `http://127.0.0.1:${frontendServer.address().port}`;

  try {
    await runE2E(frontendUrl);
  } finally {
    frontendServer.close();
    faasServer.close();
    authServer.close();
    auditServer.close();
    if (fs.existsSync(tmpLedger)) fs.unlinkSync(tmpLedger);
  }
}

main().catch((err) => {
  console.error('❌ ÉCHEC TEST D\'INTÉGRATION LOCAL :', err);
  process.exit(1);
});
