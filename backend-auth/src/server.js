/**
 * ==============================================================================
 * VoteCloud - backend-auth (IaaS #1 : Google Cloud Compute Engine e2-micro)
 * ==============================================================================
 * Responsabilités :
 *   1. Inscription & authentification sécurisée des électeurs (scrypt + JWT)
 *   2. Création, consultation et ouverture/clôture des scrutins (Admin)
 *   3. Émission de Jetons de Vote anonymisés (HMAC-SHA256) consommés par AWS Lambda (FaaS #1)
 *   4. Journalisation inter-cloud signée vers AWS EC2 (IaaS #2)
 * ==============================================================================
 */
const os = require('os');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { createPool } = require('./db');
const {
  hashPassword,
  verifyPassword,
  computeVoterHash,
  hashIdentifier,
  signAccessToken,
  signVoteToken,
  verifyAccessToken,
} = require('./crypto');
const { emitAuditEvent } = require('./auditClient');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createApp(options = {}) {
  const pool = createPool(options.pool);
  const jwtSecret = options.jwtSecret || process.env.JWT_SECRET || 'dev-jwt-secret-change-me';
  const voteHmacSecret =
    options.voteHmacSecret || process.env.VOTE_HMAC_SECRET || 'dev-vote-hmac-secret-change-me';
  const auditWebhookSecret =
    options.auditWebhookSecret ||
    process.env.AUDIT_WEBHOOK_SECRET ||
    'dev-audit-webhook-secret-change-me';
  const getAuditUrl = () =>
    options.auditServiceUrl !== undefined ? options.auditServiceUrl : process.env.AUDIT_SERVICE_URL;

  const cloudProvider = process.env.CLOUD_PROVIDER || 'Oracle Cloud Infrastructure (OCI)';
  const cloudService = process.env.CLOUD_SERVICE || 'OCI Compute E2.1.Micro (IaaS #1)';
  const cloudRegion = process.env.CLOUD_REGION || process.env.OCI_CLOUD_REGION || 'eu-marseille-1';

  const app = express();
  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN === '*' || !process.env.CORS_ORIGIN ? true : process.env.CORS_ORIGIN.split(','),
      credentials: true,
    })
  );
  app.use(express.json({ limit: '256kb' }));

  // En-têtes de traçabilité multicloud sur chaque réponse
  app.use((req, res, next) => {
    res.setHeader('X-Cloud-Provider', cloudProvider);
    res.setHeader('X-Cloud-Service', cloudService);
    res.setHeader('X-Cloud-Host', os.hostname());
    next();
  });

  // --- Middlewares d'authentification ---
  function extractToken(req) {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) return null;
    return auth.slice(7).trim();
  }

  function requireAuth(req, res, next) {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Authentification requise.' });
    }
    try {
      req.user = verifyAccessToken(token, jwtSecret);
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Session expirée ou invalide.' });
    }
  }

  function optionalAuth(req, _res, next) {
    const token = extractToken(req);
    if (token) {
      try {
        req.user = verifyAccessToken(token, jwtSecret);
      } catch (_err) {
        req.user = null;
      }
    }
    next();
  }

  function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
      return res
        .status(403)
        .json({ error: 'ADMIN_REQUIRED', message: 'Accès réservé aux administrateurs électoraux.' });
    }
    return next();
  }

  // --- 1. Santé & Télémétrie Cloud (IaaS #1 + PaaS #1) ---
  app.get('/health', async (_req, res) => {
    const started = Date.now();
    let dbStatus = 'DOWN';
    let dbVersion = null;
    let counts = {};

    try {
      const verRes = await pool.query('SELECT version() AS ver');
      dbVersion = verRes.rows[0]?.ver?.split(' ').slice(0, 2).join(' ') || 'PostgreSQL';
      const cntRes = await pool.query(
        'SELECT (SELECT COUNT(*)::int FROM voters) AS voters, (SELECT COUNT(*)::int FROM elections) AS elections, (SELECT COUNT(*)::int FROM votes) AS votes'
      );
      counts = cntRes.rows[0] || {};
      dbStatus = 'UP';
    } catch (err) {
      dbStatus = `ERROR: ${err.message}`;
    }

    res.status(dbStatus === 'UP' ? 200 : 503).json({
      status: dbStatus === 'UP' ? 'UP' : 'DEGRADED',
      service: 'backend-auth',
      model: 'IaaS #1',
      provider: cloudProvider,
      cloudService,
      region: cloudRegion,
      hostname: os.hostname(),
      uptimeSeconds: Math.round(process.uptime()),
      latencyMs: Date.now() - started,
      database: {
        model: 'PaaS #1',
        provider: 'Supabase PostgreSQL',
        status: dbStatus,
        version: dbVersion,
        counts,
      },
      timestamp: new Date().toISOString(),
    });
  });

  // --- 2. Inscription d'un nouvel électeur ---
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { nationalId, fullName, email, password } = req.body || {};
      if (!nationalId || !fullName || !email || !password) {
        return res.status(400).json({
          error: 'MISSING_FIELDS',
          message: 'CIN/Identifiant national, nom complet, email et mot de passe sont requis.',
        });
      }
      if (String(password).length < 8) {
        return res.status(400).json({
          error: 'WEAK_PASSWORD',
          message: 'Le mot de passe doit contenir au moins 8 caractères.',
        });
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const normalizedNationalId = String(nationalId).trim().toUpperCase();
      const passwordHash = hashPassword(String(password));

      const result = await pool.query(
        `INSERT INTO voters (national_id, full_name, email, password_hash, role)
         VALUES ($1, $2, $3, $4, 'voter')
         RETURNING id, national_id, full_name, email, role, created_at`,
        [normalizedNationalId, String(fullName).trim(), normalizedEmail, passwordHash]
      );

      const voter = result.rows[0];
      const accessToken = signAccessToken(
        {
          sub: voter.id,
          email: voter.email,
          fullName: voter.full_name,
          nationalId: voter.national_id,
          role: voter.role,
        },
        jwtSecret
      );

      await emitAuditEvent({
        auditServiceUrl: getAuditUrl(),
        webhookSecret: auditWebhookSecret,
        eventType: 'VOTER_REGISTERED',
        actorHash: hashIdentifier(voteHmacSecret, voter.id),
        details: { nationalIdPrefix: normalizedNationalId.slice(0, 4) + '***', role: voter.role },
      });

      return res.status(201).json({
        message: 'Électeur inscrit avec succès sur GCP IaaS + Supabase PaaS.',
        accessToken,
        user: {
          id: voter.id,
          nationalId: voter.national_id,
          fullName: voter.full_name,
          email: voter.email,
          role: voter.role,
        },
      });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({
          error: 'ALREADY_REGISTERED',
          message: 'Cet email ou cet identifiant national (CIN) est déjà enregistré.',
        });
      }
      console.error('[REGISTER ERROR]', err);
      return res.status(500).json({ error: 'SERVER_ERROR', message: 'Erreur interne lors de l\'inscription.' });
    }
  });

  // --- 3. Connexion d'un électeur ou administrateur ---
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({
          error: 'MISSING_CREDENTIALS',
          message: 'Email et mot de passe requis.',
        });
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const result = await pool.query(
        'SELECT id, national_id, full_name, email, password_hash, role, is_active FROM voters WHERE email = $1',
        [normalizedEmail]
      );

      const voter = result.rows[0];
      if (!voter || !verifyPassword(String(password), voter.password_hash)) {
        await emitAuditEvent({
          auditServiceUrl: getAuditUrl(),
          webhookSecret: auditWebhookSecret,
          eventType: 'LOGIN_FAILED',
          actorHash: hashIdentifier(voteHmacSecret, normalizedEmail),
          details: { reason: 'INVALID_CREDENTIALS' },
        });
        return res.status(401).json({
          error: 'INVALID_CREDENTIALS',
          message: 'Email ou mot de passe incorrect.',
        });
      }

      if (!voter.is_active) {
        return res.status(403).json({
          error: 'ACCOUNT_DISABLED',
          message: 'Ce compte électeur est désactivé.',
        });
      }

      const accessToken = signAccessToken(
        {
          sub: voter.id,
          email: voter.email,
          fullName: voter.full_name,
          nationalId: voter.national_id,
          role: voter.role,
        },
        jwtSecret
      );

      await emitAuditEvent({
        auditServiceUrl: getAuditUrl(),
        webhookSecret: auditWebhookSecret,
        eventType: 'LOGIN_SUCCESS',
        actorHash: hashIdentifier(voteHmacSecret, voter.id),
        details: { role: voter.role, authHost: os.hostname() },
      });

      return res.json({
        accessToken,
        issuedBy: `${cloudProvider} - ${cloudService}`,
        user: {
          id: voter.id,
          nationalId: voter.national_id,
          fullName: voter.full_name,
          email: voter.email,
          role: voter.role,
        },
      });
    } catch (err) {
      console.error('[LOGIN ERROR]', err);
      return res.status(500).json({ error: 'SERVER_ERROR', message: 'Erreur interne lors de la connexion.' });
    }
  });

  // --- 4. Profil courant + statut d'émargement ---
  app.get('/api/auth/me', requireAuth, async (req, res) => {
    try {
      const electionsRes = await pool.query('SELECT id FROM elections');
      const votedElectionIds = [];

      if (electionsRes.rows.length > 0) {
        const hashes = electionsRes.rows.map((e) =>
          computeVoterHash(voteHmacSecret, e.id, req.user.sub)
        );
        const votesRes = await pool.query(
          'SELECT election_id, receipt_code, cast_at FROM votes WHERE voter_hash = ANY($1::char(64)[])',
          [hashes]
        );
        for (const row of votesRes.rows) {
          votedElectionIds.push({
            electionId: row.election_id,
            receiptCode: row.receipt_code,
            castAt: row.cast_at,
          });
        }
      }

      return res.json({
        user: {
          id: req.user.sub,
          nationalId: req.user.nationalId,
          fullName: req.user.fullName,
          email: req.user.email,
          role: req.user.role,
        },
        votedElections: votedElectionIds,
        servedBy: `${cloudProvider} - ${cloudService}`,
      });
    } catch (err) {
      console.error('[ME ERROR]', err);
      return res.status(500).json({ error: 'SERVER_ERROR', message: 'Impossible de charger le profil.' });
    }
  });

  // --- 5. Émission du Jeton Cryptographique de Vote (GCP IaaS #1 -> AWS Lambda FaaS #1) ---
  // Note architecturale : GCP IaaS certifie l'identité et calcule le nullifier anonymisé (voter_hash).
  // C'est ensuite AWS Lambda (FaaS #1) qui applique les contrôles d'ouverture du scrutin
  // et la contrainte atomique anti-double vote dans Supabase PostgreSQL (PaaS #1).
  app.post('/api/auth/vote-token', requireAuth, async (req, res) => {
    try {
      const { electionId } = req.body || {};
      if (!electionId || !UUID_REGEX.test(electionId)) {
        return res.status(400).json({ error: 'INVALID_ELECTION_ID', message: 'Identifiant de scrutin invalide.' });
      }

      const electionCheck = await pool.query('SELECT id, title, status FROM elections WHERE id = $1', [electionId]);
      if (electionCheck.rows.length === 0) {
        return res.status(404).json({ error: 'ELECTION_NOT_FOUND', message: 'Scrutin introuvable.' });
      }

      const voterCheck = await pool.query('SELECT is_active FROM voters WHERE id = $1', [req.user.sub]);
      if (!voterCheck.rows[0]?.is_active) {
        return res.status(403).json({ error: 'VOTER_INACTIVE', message: 'Électeur non éligible.' });
      }

      const voterHash = computeVoterHash(voteHmacSecret, electionId, req.user.sub);
      const voteToken = signVoteToken({ voterHash, electionId }, jwtSecret);

      return res.json({
        voteToken,
        electionId,
        voterHashPreview: `${voterHash.slice(0, 12)}...`,
        expiresInSeconds: 300,
        issuedBy: `${cloudProvider} (${os.hostname()})`,
        targetProcessor: 'AWS Lambda (FaaS #1)',
      });
    } catch (err) {
      console.error('[VOTE-TOKEN ERROR]', err);
      return res.status(500).json({ error: 'SERVER_ERROR', message: 'Erreur lors de la génération du jeton.' });
    }
  });

  // --- 6. Liste des scrutins & candidats ---
  app.get('/api/elections', optionalAuth, async (req, res) => {
    try {
      const electionsRes = await pool.query(
        `SELECT e.id, e.title, e.description, e.status, e.starts_at, e.ends_at, e.created_at,
                COUNT(v.id)::int AS total_votes
         FROM elections e
         LEFT JOIN votes v ON v.election_id = e.id
         GROUP BY e.id
         ORDER BY
           CASE e.status WHEN 'OPEN' THEN 1 WHEN 'UPCOMING' THEN 2 ELSE 3 END,
           e.created_at DESC`
      );

      const candidatesRes = await pool.query(
        `SELECT id, election_id, name, party, program, color, display_order
         FROM candidates
         ORDER BY display_order ASC, name ASC`
      );

      const candidatesByElection = new Map();
      for (const c of candidatesRes.rows) {
        if (!candidatesByElection.has(c.election_id)) {
          candidatesByElection.set(c.election_id, []);
        }
        candidatesByElection.get(c.election_id).push({
          id: c.id,
          name: c.name,
          party: c.party,
          program: c.program,
          color: c.color,
          displayOrder: c.display_order,
        });
      }

      const votedMap = new Map();
      if (req.user && electionsRes.rows.length > 0) {
        const hashes = electionsRes.rows.map((e) =>
          computeVoterHash(voteHmacSecret, e.id, req.user.sub)
        );
        const userVotes = await pool.query(
          'SELECT election_id, receipt_code, cast_at FROM votes WHERE voter_hash = ANY($1::char(64)[])',
          [hashes]
        );
        for (const uv of userVotes.rows) {
          votedMap.set(uv.election_id, { receiptCode: uv.receipt_code, castAt: uv.cast_at });
        }
      }

      const now = Date.now();
      const elections = electionsRes.rows.map((e) => {
        const startsMs = new Date(e.starts_at).getTime();
        const endsMs = new Date(e.ends_at).getTime();
        let windowState = 'OPEN';
        if (e.status === 'CLOSED' || now > endsMs) windowState = 'CLOSED';
        else if (e.status === 'UPCOMING' || now < startsMs) windowState = 'UPCOMING';

        const userReceipt = votedMap.get(e.id) || null;
        return {
          id: e.id,
          title: e.title,
          description: e.description,
          status: e.status,
          windowState,
          startsAt: e.starts_at,
          endsAt: e.ends_at,
          totalVotes: e.total_votes,
          hasVoted: Boolean(userReceipt),
          myReceipt: userReceipt,
          candidates: candidatesByElection.get(e.id) || [],
        };
      });

      return res.json({
        elections,
        servedBy: `${cloudProvider} - ${cloudService}`,
      });
    } catch (err) {
      console.error('[ELECTIONS LIST ERROR]', err);
      return res.status(500).json({ error: 'SERVER_ERROR', message: 'Impossible de récupérer les scrutins.' });
    }
  });

  // --- 7. Création d'un scrutin (Admin uniquement) ---
  app.post('/api/elections', requireAuth, requireAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
      const { title, description, startsAt, endsAt, status = 'OPEN', candidates } = req.body || {};

      if (!title || !startsAt || !endsAt || !Array.isArray(candidates) || candidates.length < 2) {
        return res.status(400).json({
          error: 'INVALID_PAYLOAD',
          message: 'Titre, dates (début/fin) et au moins 2 candidats sont requis.',
        });
      }

      const startDate = new Date(startsAt);
      const endDate = new Date(endsAt);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
        return res.status(400).json({
          error: 'INVALID_DATES',
          message: 'La date de fin doit être postérieure à la date de début.',
        });
      }

      if (!['OPEN', 'UPCOMING', 'CLOSED'].includes(status)) {
        return res.status(400).json({ error: 'INVALID_STATUS', message: 'Statut invalide.' });
      }

      await client.query('BEGIN');
      const elecRes = await client.query(
        `INSERT INTO elections (title, description, status, starts_at, ends_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, title, description, status, starts_at, ends_at`,
        [String(title).trim(), String(description || '').trim(), status, startDate.toISOString(), endDate.toISOString(), req.user.sub]
      );
      const election = elecRes.rows[0];

      const palette = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
      const insertedCandidates = [];
      for (let i = 0; i < candidates.length; i += 1) {
        const c = candidates[i];
        if (!c || !c.name) continue;
        const candRes = await client.query(
          `INSERT INTO candidates (election_id, name, party, program, color, display_order)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, name, party, program, color, display_order`,
          [
            election.id,
            String(c.name).trim(),
            String(c.party || '').trim(),
            String(c.program || '').trim(),
            c.color || palette[i % palette.length],
            i + 1,
          ]
        );
        insertedCandidates.push(candRes.rows[0]);
      }

      if (insertedCandidates.length < 2) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'MIN_CANDIDATES', message: 'Au moins 2 candidats valides sont requis.' });
      }

      await client.query('COMMIT');

      await emitAuditEvent({
        auditServiceUrl: getAuditUrl(),
        webhookSecret: auditWebhookSecret,
        eventType: 'ELECTION_CREATED',
        electionId: election.id,
        actorHash: hashIdentifier(voteHmacSecret, req.user.sub),
        details: { title: election.title, status: election.status, candidateCount: insertedCandidates.length },
      });

      return res.status(201).json({
        message: 'Scrutin créé et journalisé dans la chaîne d\'audit AWS EC2.',
        election: { ...election, candidates: insertedCandidates },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[CREATE ELECTION ERROR]', err);
      return res.status(500).json({ error: 'SERVER_ERROR', message: 'Erreur lors de la création du scrutin.' });
    } finally {
      client.release();
    }
  });

  // --- 8. Changement de statut d'un scrutin (Admin : ouvrir / clôturer en direct) ---
  app.patch('/api/elections/:id/status', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body || {};

      if (!UUID_REGEX.test(id)) {
        return res.status(400).json({ error: 'INVALID_ELECTION_ID', message: 'ID scrutin invalide.' });
      }
      if (!['OPEN', 'UPCOMING', 'CLOSED'].includes(status)) {
        return res.status(400).json({ error: 'INVALID_STATUS', message: 'Statut attendu : OPEN, UPCOMING ou CLOSED.' });
      }

      const result = await pool.query(
        'UPDATE elections SET status = $1 WHERE id = $2 RETURNING id, title, status, starts_at, ends_at',
        [status, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'ELECTION_NOT_FOUND', message: 'Scrutin introuvable.' });
      }

      await emitAuditEvent({
        auditServiceUrl: getAuditUrl(),
        webhookSecret: auditWebhookSecret,
        eventType: 'ELECTION_STATUS_CHANGED',
        electionId: id,
        actorHash: hashIdentifier(voteHmacSecret, req.user.sub),
        details: { newStatus: status, title: result.rows[0].title },
      });

      return res.json({
        message: `Statut du scrutin mis à jour : ${status}`,
        election: result.rows[0],
      });
    } catch (err) {
      console.error('[UPDATE STATUS ERROR]', err);
      return res.status(500).json({ error: 'SERVER_ERROR', message: 'Erreur de mise à jour du statut.' });
    }
  });

  return { app, pool };
}

if (require.main === module) {
  const PORT = Number(process.env.PORT || 3001);
  const { app } = createApp();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[backend-auth | IaaS #1 GCP] Démarré sur http://0.0.0.0:${PORT}`);
  });
}

module.exports = { createApp };
