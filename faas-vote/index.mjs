/**
 * ==============================================================================
 * VoteCloud - faas-vote (FaaS #1 : AWS Lambda Node.js 20.x + Function URL)
 * ==============================================================================
 * Fonction serverless événementielle critique :
 *   1. Vérifie cryptographiquement le Jeton de Vote JWT émis par GCP IaaS #1
 *   2. Vérifie l'état du scrutin et la fenêtre temporelle officielle dans Supabase PaaS #1
 *   3. Enregistre le bulletin de manière atomique (transaction + contrainte UNIQUE anti-double vote)
 *   4. Génère un reçu cryptographique SHA-256 vérifiable par l'électeur
 *   5. Notifie de manière signée (HMAC-SHA256) le nœud d'audit AWS EC2 (IaaS #2)
 * ==============================================================================
 */
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import pg from 'pg';

const { Pool } = pg;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Réutilisation du pool entre invocations "warm" (bonne pratique AWS Lambda)
let sharedPool = null;
let invocationCount = 0;

export function setCustomPool(poolInstance) {
  sharedPool = poolInstance;
}

function getPool() {
  if (sharedPool) return sharedPool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL est manquant dans la configuration AWS Lambda.');
  }

  const useSsl =
    String(process.env.DATABASE_SSL || 'true').toLowerCase() === 'true' &&
    !connectionString.includes('localhost') &&
    !connectionString.includes('127.0.0.1') &&
    !connectionString.includes('@postgres:');

  sharedPool = new Pool({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    max: 3, // Faible empreinte pour environnement FaaS serverless
    idleTimeoutMillis: 15000,
    connectionTimeoutMillis: 8000,
  });

  return sharedPool;
}

function buildResponse(statusCode, bodyObj) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Cloud-Provider': 'Amazon Web Services (AWS)',
    'X-Cloud-Service': 'AWS Lambda (FaaS #1)',
  };

  if (String(process.env.DISABLE_LAMBDA_CORS || 'false').toLowerCase() !== 'true') {
    headers['Access-Control-Allow-Origin'] = process.env.CORS_ORIGIN || '*';
    headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization';
  }

  return {
    statusCode,
    headers,
    body: JSON.stringify(bodyObj),
  };
}

function generateReceiptCode() {
  const part1 = crypto.randomBytes(2).toString('hex').toUpperCase();
  const part2 = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `VC-${part1}-${part2}`;
}

async function notifyAuditNode({ eventType, electionId, actorHash, details }) {
  const auditUrl = process.env.AUDIT_SERVICE_URL;
  const webhookSecret = process.env.AUDIT_WEBHOOK_SECRET || 'dev-audit-webhook-secret-change-me';
  if (!auditUrl) return null;

  const endpoint = `${auditUrl.replace(/\/$/, '')}/api/audit/events`;
  const payload = {
    eventType,
    sourceCloud: 'AWS-FaaS',
    electionId,
    actorHash,
    details,
    timestamp: new Date().toISOString(),
  };

  const rawBody = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Audit-Signature': signature,
        'X-Source-Cloud': 'AWS-Lambda-FaaS',
      },
      body: rawBody,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) {
      console.warn(`[FAAS-AUDIT] AWS EC2 HTTP ${resp.status}`);
      return null;
    }
    return await resp.json();
  } catch (err) {
    console.warn(`[FAAS-AUDIT] Échec notification AWS EC2 : ${err.message}`);
    return null;
  }
}

function parseIncomingEvent(event) {
  const method =
    event?.requestContext?.http?.method ||
    event?.httpMethod ||
    (event?.action === 'health' ? 'GET' : 'POST');

  const rawPath = event?.rawPath || event?.path || '/';

  const headers = {};
  for (const [k, v] of Object.entries(event?.headers || {})) {
    headers[k.toLowerCase()] = v;
  }

  let body = {};
  if (typeof event?.body === 'string' && event.body.length > 0) {
    const decoded = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;
    try {
      body = JSON.parse(decoded);
    } catch (_err) {
      body = { __invalidJson: true };
    }
  } else if (event?.body && typeof event.body === 'object') {
    body = event.body;
  } else if (!event?.requestContext && !event?.httpMethod && typeof event === 'object') {
    // Invocation directe depuis la console AWS Lambda ("Test event")
    body = event;
  }

  return { method: method.toUpperCase(), rawPath, headers, body };
}

export async function handler(event = {}, context = {}) {
  invocationCount += 1;
  const started = Date.now();
  const coldStart = invocationCount === 1;
  const requestId =
    context?.awsRequestId ||
    event?.requestContext?.requestId ||
    `local-faas-${crypto.randomBytes(6).toString('hex')}`;
  const region = process.env.AWS_REGION || process.env.AWS_LAMBDA_REGION || 'eu-west-3';
  const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME || 'votecloud-faas-vote-local';

  const { method, rawPath, headers, body } = parseIncomingEvent(event);

  // Pré-vol CORS
  if (method === 'OPTIONS') {
    return buildResponse(204, {});
  }

  // Endpoint de santé & télémétrie FaaS #1
  if (method === 'GET' && (rawPath === '/' || rawPath === '/health' || rawPath.endsWith('/health'))) {
    let dbStatus = 'DOWN';
    try {
      const pool = getPool();
      await pool.query('SELECT 1');
      dbStatus = 'UP';
    } catch (err) {
      dbStatus = `ERROR: ${err.message}`;
    }

    return buildResponse(dbStatus === 'UP' ? 200 : 503, {
      status: dbStatus === 'UP' ? 'UP' : 'DEGRADED',
      service: 'faas-vote',
      model: 'FaaS #1',
      provider: 'Amazon Web Services (AWS)',
      cloudService: 'AWS Lambda (Node.js 20.x)',
      functionName,
      region,
      awsRequestId: requestId,
      coldStart,
      warmInvocations: invocationCount,
      latencyMs: Date.now() - started,
      databaseStatus: dbStatus,
      timestamp: new Date().toISOString(),
    });
  }

  if (method !== 'POST') {
    return buildResponse(405, {
      error: 'METHOD_NOT_ALLOWED',
      message: 'Utilisez POST pour soumettre un bulletin ou GET /health pour le diagnostic.',
    });
  }

  if (body.__invalidJson) {
    return buildResponse(400, { error: 'INVALID_JSON', message: 'Corps JSON malformé.' });
  }

  // 1. Extraction et vérification cryptographique du Jeton de Vote émis par GCP IaaS #1
  const authHeader = headers.authorization || '';
  const voteToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : body.voteToken;

  if (!voteToken) {
    return buildResponse(401, {
      error: 'VOTE_TOKEN_REQUIRED',
      message: 'Jeton cryptographique de vote (émis par GCP IaaS) requis.',
      awsRequestId: requestId,
    });
  }

  const jwtSecret = process.env.JWT_SECRET || 'dev-jwt-secret-change-me';
  let decodedToken;
  try {
    decodedToken = jwt.verify(voteToken, jwtSecret, {
      issuer: 'votecloud-gcp-iaas-auth',
      audience: 'votecloud-aws-lambda-faas',
    });
    if (decodedToken.typ !== 'vote_credential' || !decodedToken.voterHash || !decodedToken.electionId) {
      throw new Error('Type de jeton invalide');
    }
  } catch (err) {
    return buildResponse(401, {
      error: 'INVALID_VOTE_TOKEN',
      message: `Jeton de vote rejeté par AWS Lambda : ${err.message}`,
      awsRequestId: requestId,
    });
  }

  // 2. Validation des paramètres du bulletin
  const { electionId, candidateId } = body;
  if (!electionId || !candidateId || !UUID_REGEX.test(electionId) || !UUID_REGEX.test(candidateId)) {
    return buildResponse(400, {
      error: 'INVALID_BALLOT_PAYLOAD',
      message: 'electionId et candidateId (UUID valides) sont requis.',
      awsRequestId: requestId,
    });
  }

  if (decodedToken.electionId !== electionId) {
    return buildResponse(403, {
      error: 'TOKEN_ELECTION_MISMATCH',
      message: 'Ce jeton de vote a été délivré pour un autre scrutin.',
      awsRequestId: requestId,
    });
  }

  const voterHash = decodedToken.voterHash;
  const voterHashShort = `${voterHash.slice(0, 12)}...`;
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 3. Vérification de l'existence du scrutin et de la fenêtre temporelle officielle
    const elecRes = await client.query(
      'SELECT id, title, status, starts_at, ends_at FROM elections WHERE id = $1',
      [electionId]
    );
    if (elecRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return buildResponse(404, {
        error: 'ELECTION_NOT_FOUND',
        message: 'Scrutin introuvable dans la base Supabase PaaS.',
        awsRequestId: requestId,
      });
    }

    const election = elecRes.rows[0];
    const now = new Date();
    const startsAt = new Date(election.starts_at);
    const endsAt = new Date(election.ends_at);

    if (election.status === 'CLOSED' || now > endsAt) {
      await client.query('ROLLBACK');
      const auditResp = await notifyAuditNode({
        eventType: 'OUT_OF_WINDOW_ATTEMPT',
        electionId,
        actorHash: voterHashShort,
        details: {
          reason: 'ELECTION_CLOSED',
          electionTitle: election.title,
          endedAt: election.ends_at,
          lambdaRequestId: requestId,
        },
      });
      return buildResponse(403, {
        error: 'ELECTION_CLOSED',
        message: 'Vote refusé par AWS Lambda : ce scrutin est clôturé (hors période de vote).',
        electionStatus: election.status,
        endsAt: election.ends_at,
        awsRequestId: requestId,
        auditBlockIndex: auditResp?.block?.blockIndex || null,
      });
    }

    if (election.status === 'UPCOMING' || now < startsAt) {
      await client.query('ROLLBACK');
      const auditResp = await notifyAuditNode({
        eventType: 'OUT_OF_WINDOW_ATTEMPT',
        electionId,
        actorHash: voterHashShort,
        details: {
          reason: 'ELECTION_NOT_STARTED',
          electionTitle: election.title,
          startsAt: election.starts_at,
          lambdaRequestId: requestId,
        },
      });
      return buildResponse(403, {
        error: 'ELECTION_NOT_STARTED',
        message: 'Vote refusé par AWS Lambda : la période de vote de ce scrutin n\'a pas encore commencé.',
        electionStatus: election.status,
        startsAt: election.starts_at,
        awsRequestId: requestId,
        auditBlockIndex: auditResp?.block?.blockIndex || null,
      });
    }

    // 4. Vérification que le candidat appartient bien à ce scrutin
    const candRes = await client.query(
      'SELECT id, name FROM candidates WHERE id = $1 AND election_id = $2',
      [candidateId, electionId]
    );
    if (candRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return buildResponse(400, {
        error: 'INVALID_CANDIDATE',
        message: 'Candidat introuvable pour ce scrutin.',
        awsRequestId: requestId,
      });
    }

    // 5. Enregistrement atomique protégé par la contrainte UNIQUE(election_id, voter_hash)
    const castAt = new Date().toISOString();
    const receiptCode = generateReceiptCode();
    const receiptHash = crypto
      .createHash('sha256')
      .update(`${electionId}|${candidateId}|${voterHash}|${receiptCode}|${castAt}`)
      .digest('hex');

    await client.query(
      `INSERT INTO votes (election_id, candidate_id, voter_hash, receipt_code, receipt_hash, lambda_request_id, cast_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [electionId, candidateId, voterHash, receiptCode, receiptHash, requestId, castAt]
    );

    await client.query('COMMIT');

    // 6. Scellement dans la chaîne d'audit SHA-256 sur AWS EC2 (IaaS #2)
    // Note : candidateId n'est PAS transmis dans le log d'audit afin de préserver le secret du vote !
    const auditResp = await notifyAuditNode({
      eventType: 'VOTE_CAST',
      electionId,
      actorHash: voterHashShort,
      details: {
        receiptCode,
        receiptHashPrefix: receiptHash.slice(0, 16),
        lambdaRequestId: requestId,
        lambdaRegion: region,
        issuedBy: decodedToken.issuedBy,
      },
    });

    return buildResponse(201, {
      message: 'Bulletin validé et enregistré avec succès !',
      receipt: {
        receiptCode,
        receiptHash,
        electionId,
        electionTitle: election.title,
        castAt,
        lambdaRequestId: requestId,
        lambdaRegion: region,
        auditBlockIndex: auditResp?.block?.blockIndex || null,
        auditBlockHash: auditResp?.block?.blockHash || null,
      },
      cloudTrace: [
        'PaaS #2 : Render (Portail HTTPS)',
        'IaaS #1 : GCP Compute Engine (Auth & Jeton anonymisé)',
        `FaaS #1 : AWS Lambda ${region} (Validation & Urne)`,
        'PaaS #1 : Supabase PostgreSQL (Persistance ACID UNIQUE)',
        'IaaS #2 : AWS EC2 (Scellement Hash-Chain SHA-256)',
      ],
      latencyMs: Date.now() - started,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});

    // Code PostgreSQL 23505 = violation de contrainte UNIQUE(election_id, voter_hash)
    if (err.code === '23505') {
      const auditResp = await notifyAuditNode({
        eventType: 'DOUBLE_VOTE_ATTEMPT',
        electionId,
        actorHash: voterHashShort,
        details: {
          reason: 'UNIQUE_CONSTRAINT_VIOLATION',
          lambdaRequestId: requestId,
          blockedBy: 'AWS-Lambda + PostgreSQL-UNIQUE',
        },
      });

      return buildResponse(409, {
        error: 'DOUBLE_VOTE_DETECTED',
        message:
          'Tentative de double vote bloquée ! Cet électeur a déjà voté pour ce scrutin (contrainte cryptographique UNIQUE).',
        awsRequestId: requestId,
        auditBlockIndex: auditResp?.block?.blockIndex || null,
        auditBlockHash: auditResp?.block?.blockHash || null,
      });
    }

    console.error('[FAAS-VOTE ERROR]', err);
    return buildResponse(500, {
      error: 'FAAS_INTERNAL_ERROR',
      message: 'Erreur interne lors du traitement serverless du bulletin.',
      awsRequestId: requestId,
    });
  } finally {
    client.release();
  }
}
