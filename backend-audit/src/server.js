/**
 * ==============================================================================
 * VoteCloud - backend-audit (IaaS #2 : Amazon Web Services EC2 t3.micro)
 * ==============================================================================
 * Responsabilités :
 *   1. Réception authentifiée (HMAC-SHA256) des preuves d'audit depuis AWS Lambda & GCP IaaS
 *   2. Scellement dans un registre local append-only SHA-256 sur EBS + miroir Supabase
 *   3. Vérification cryptographique complète de l'intégrité de la chaîne d'audit
 *   4. Dépouillement temps réel + Réconciliation Inter-Cloud (Supabase PaaS vs AWS EC2 EBS)
 *   5. Vérification publique des reçus de vote sans compromettre le secret du vote
 * ==============================================================================
 */
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { createPool } = require('./db');
const { AuditHashChain } = require('./hashChain');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function verifyHmacSignature(secret, rawBody, providedSignature) {
  if (!providedSignature || typeof providedSignature !== 'string') return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(providedSignature.trim(), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function createApp(options = {}) {
  const pool = createPool(options.pool);
  const webhookSecret =
    options.auditWebhookSecret ||
    process.env.AUDIT_WEBHOOK_SECRET ||
    'dev-audit-webhook-secret-change-me';
  const ledgerPath =
    options.ledgerPath ||
    process.env.AUDIT_LEDGER_PATH ||
    path.resolve(__dirname, '../data/audit-chain.jsonl');

  const cloudProvider = process.env.CLOUD_PROVIDER || 'Amazon Web Services (AWS)';
  const cloudService = process.env.CLOUD_SERVICE || 'Amazon EC2 t3.micro (IaaS #2)';
  const cloudRegion = process.env.CLOUD_REGION || process.env.AWS_EC2_REGION || 'eu-west-3';

  const chain = new AuditHashChain(ledgerPath, pool);

  const app = express();
  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN === '*' || !process.env.CORS_ORIGIN ? true : process.env.CORS_ORIGIN.split(','),
      credentials: true,
    })
  );

  // Capture le corps brut pour vérifier la signature HMAC-SHA256 exacte
  app.use(
    express.json({
      limit: '256kb',
      verify: (req, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    })
  );

  app.use((req, res, next) => {
    res.setHeader('X-Cloud-Provider', cloudProvider);
    res.setHeader('X-Cloud-Service', cloudService);
    res.setHeader('X-Cloud-Host', os.hostname());
    next();
  });

  // --- 1. Santé & Télémétrie Cloud (IaaS #2) ---
  app.get('/health', async (_req, res) => {
    const started = Date.now();
    await chain.init();
    const verification = chain.verify();
    let dbStatus = 'DOWN';

    try {
      await pool.query('SELECT 1');
      dbStatus = 'UP';
    } catch (err) {
      dbStatus = `ERROR: ${err.message}`;
    }

    res.status(dbStatus === 'UP' ? 200 : 503).json({
      status: dbStatus === 'UP' && verification.valid ? 'UP' : 'DEGRADED',
      service: 'backend-audit',
      model: 'IaaS #2',
      provider: cloudProvider,
      cloudService,
      region: cloudRegion,
      hostname: os.hostname(),
      uptimeSeconds: Math.round(process.uptime()),
      latencyMs: Date.now() - started,
      auditChain: {
        blocksCount: chain.blocks.length,
        valid: verification.valid,
        tipHash: verification.tipHash,
      },
      databaseStatus: dbStatus,
      timestamp: new Date().toISOString(),
    });
  });

  // --- 2. Webhook interne signé (HMAC-SHA256) : réception des événements inter-cloud ---
  app.post('/api/audit/events', async (req, res) => {
    try {
      const signature = req.headers['x-audit-signature'];
      const rawBody = req.rawBody || JSON.stringify(req.body || {});

      if (!verifyHmacSignature(webhookSecret, rawBody, signature)) {
        return res.status(401).json({
          error: 'INVALID_WEBHOOK_SIGNATURE',
          message: 'Signature HMAC-SHA256 absente ou invalide.',
        });
      }

      const { eventType, sourceCloud, electionId, actorHash, details, timestamp } = req.body || {};
      if (!eventType || !sourceCloud) {
        return res.status(400).json({
          error: 'INVALID_AUDIT_EVENT',
          message: 'eventType et sourceCloud sont obligatoires.',
        });
      }

      const sealedBlock = await chain.append({
        eventType: String(eventType),
        sourceCloud: String(sourceCloud),
        electionId: electionId && UUID_REGEX.test(electionId) ? electionId : null,
        actorHash: actorHash ? String(actorHash).slice(0, 64) : null,
        details: details || {},
        timestamp,
      });

      return res.status(201).json({
        message: 'Événement scellé dans la chaîne d\'audit SHA-256 (AWS EC2).',
        block: sealedBlock,
      });
    } catch (err) {
      console.error('[AUDIT EVENT ERROR]', err);
      return res.status(500).json({ error: 'SERVER_ERROR', message: 'Erreur lors du scellement d\'audit.' });
    }
  });

  // --- 3. Consultation du journal d'audit chaîné ---
  app.get('/api/audit/logs', async (req, res) => {
    try {
      await chain.init();
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
      const verification = chain.verify();

      return res.json({
        servedBy: `${cloudProvider} - ${cloudService} (${os.hostname()})`,
        totalBlocks: chain.blocks.length,
        chainIntegrity: verification,
        logs: chain.getRecent(limit),
      });
    } catch (err) {
      console.error('[AUDIT LOGS ERROR]', err);
      return res.status(500).json({ error: 'SERVER_ERROR', message: 'Erreur de lecture du journal d\'audit.' });
    }
  });

  // --- 4. Vérification cryptographique complète de l'intégrité + comparaison DB ---
  app.get('/api/audit/verify', async (_req, res) => {
    try {
      await chain.init();
      const localVerification = chain.verify();

      let dbCount = 0;
      let dbSynced = false;
      try {
        const dbRes = await pool.query('SELECT COUNT(*)::int AS cnt FROM audit_logs');
        dbCount = dbRes.rows[0]?.cnt || 0;
        dbSynced = dbCount === chain.blocks.length;
      } catch (_err) {
        dbSynced = false;
      }

      return res.json({
        verifiedAt: new Date().toISOString(),
        verifiedBy: `${cloudProvider} - ${cloudService} (${os.hostname()})`,
        localEbsLedger: localVerification,
        crossCloudMirror: {
          awsEc2Blocks: chain.blocks.length,
          supabaseBlocks: dbCount,
          synchronized: dbSynced,
        },
        overallValid: localVerification.valid,
      });
    } catch (err) {
      console.error('[AUDIT VERIFY ERROR]', err);
      return res.status(500).json({ error: 'SERVER_ERROR', message: 'Erreur lors de la vérification.' });
    }
  });

  // --- 5. Dépouillement temps réel & Réconciliation Inter-Cloud (Supabase vs AWS EC2) ---
  app.get('/api/audit/tally/:electionId', async (req, res) => {
    try {
      const { electionId } = req.params;
      if (!UUID_REGEX.test(electionId)) {
        return res.status(400).json({ error: 'INVALID_ELECTION_ID', message: 'ID scrutin invalide.' });
      }

      await chain.init();

      const elecRes = await pool.query(
        'SELECT id, title, description, status, starts_at, ends_at FROM elections WHERE id = $1',
        [electionId]
      );
      if (elecRes.rows.length === 0) {
        return res.status(404).json({ error: 'ELECTION_NOT_FOUND', message: 'Scrutin introuvable.' });
      }
      const election = elecRes.rows[0];

      const tallyRes = await pool.query(
        `SELECT c.id, c.name, c.party, c.color, c.display_order,
                COUNT(v.id)::int AS votes
         FROM candidates c
         LEFT JOIN votes v ON v.candidate_id = c.id AND v.election_id = $1
         WHERE c.election_id = $1
         GROUP BY c.id
         ORDER BY votes DESC, c.display_order ASC`,
        [electionId]
      );

      const votersTotalRes = await pool.query("SELECT COUNT(*)::int AS total FROM voters WHERE role = 'voter' AND is_active = TRUE");
      const registeredVoters = votersTotalRes.rows[0]?.total || 0;

      const totalVotesDb = tallyRes.rows.reduce((sum, r) => sum + r.votes, 0);
      const totalVotesAuditLedger = chain.countVotesForElection(electionId);

      // Compte également les alertes de sécurité interceptées pour ce scrutin
      const blockedDoubleVotes = chain.blocks.filter(
        (b) => b.eventType === 'DOUBLE_VOTE_ATTEMPT' && b.electionId === electionId
      ).length;
      const blockedOutOfWindow = chain.blocks.filter(
        (b) => b.eventType === 'OUT_OF_WINDOW_ATTEMPT' && b.electionId === electionId
      ).length;

      const results = tallyRes.rows.map((r) => ({
        candidateId: r.id,
        name: r.name,
        party: r.party,
        color: r.color,
        votes: r.votes,
        percentage: totalVotesDb > 0 ? Number(((r.votes / totalVotesDb) * 100).toFixed(1)) : 0,
      }));

      return res.json({
        election: {
          id: election.id,
          title: election.title,
          status: election.status,
          startsAt: election.starts_at,
          endsAt: election.ends_at,
        },
        totalVotes: totalVotesDb,
        registeredVoters,
        turnoutPercentage:
          registeredVoters > 0 ? Number(((totalVotesDb / registeredVoters) * 100).toFixed(1)) : 0,
        results,
        securityMetrics: {
          blockedDoubleVotes,
          blockedOutOfWindow,
        },
        crossCloudReconciliation: {
          supabaseBallotCount: totalVotesDb,
          awsEc2AuditCount: totalVotesAuditLedger,
          reconciled: totalVotesDb === totalVotesAuditLedger,
          verifiedBy: `${cloudProvider} - ${cloudService} (${os.hostname()})`,
        },
        computedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[TALLY ERROR]', err);
      return res.status(500).json({ error: 'SERVER_ERROR', message: 'Erreur lors du dépouillement.' });
    }
  });

  // --- 6. Vérification publique d'un reçu cryptographique de vote ---
  app.get('/api/audit/receipt/:receiptCode', async (req, res) => {
    try {
      const code = String(req.params.receiptCode || '').trim().toUpperCase();
      if (!code) {
        return res.status(400).json({ error: 'MISSING_RECEIPT', message: 'Code reçu manquant.' });
      }

      await chain.init();

      const voteRes = await pool.query(
        `SELECT v.receipt_code, v.receipt_hash, v.cast_at, v.lambda_request_id,
                e.id AS election_id, e.title AS election_title
         FROM votes v
         JOIN elections e ON e.id = v.election_id
         WHERE v.receipt_code = $1`,
        [code]
      );

      if (voteRes.rows.length === 0) {
        return res.status(404).json({
          found: false,
          message: 'Aucun bulletin correspondant à ce reçu dans l\'urne Supabase.',
        });
      }

      const row = voteRes.rows[0];
      const auditBlock = chain.findReceiptBlock(code);

      return res.json({
        found: true,
        verifiedCrossCloud: Boolean(auditBlock),
        note: 'Pour préserver le secret du vote, le choix du candidat n\'est jamais affiché lors de la vérification du reçu.',
        receipt: {
          receiptCode: row.receipt_code,
          receiptHash: row.receipt_hash,
          electionId: row.election_id,
          electionTitle: row.election_title,
          castAt: row.cast_at,
          lambdaRequestId: row.lambda_request_id,
          awsAuditBlockIndex: auditBlock ? auditBlock.blockIndex : null,
          awsAuditBlockHash: auditBlock ? auditBlock.blockHash : null,
        },
      });
    } catch (err) {
      console.error('[RECEIPT VERIFY ERROR]', err);
      return res.status(500).json({ error: 'SERVER_ERROR', message: 'Erreur lors de la vérification du reçu.' });
    }
  });

  return { app, pool, chain };
}

if (require.main === module) {
  const PORT = Number(process.env.PORT || 3002);
  const { app } = createApp();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[backend-audit | IaaS #2 AWS EC2] Démarré sur http://0.0.0.0:${PORT}`);
  });
}

module.exports = { createApp };
