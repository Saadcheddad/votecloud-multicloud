/**
 * ==============================================================================
 * VoteCloud - Suite de Tests End-to-End (Local Docker ou Production Multicloud)
 * ==============================================================================
 * Usage local      : node tests/e2e-test.mjs
 * Usage multicloud : BASE_URL=https://votecloud-frontend-paas.onrender.com node tests/e2e-test.mjs
 * ==============================================================================
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

async function request(path, options = {}) {
  const resp = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await resp.json().catch(() => ({}));
  return { status: resp.status, data };
}

export async function runE2E(targetBaseUrl = BASE_URL) {
  const base = targetBaseUrl.replace(/\/$/, '');
  const call = async (p, opts = {}) => {
    const resp = await fetch(`${base}${p}`, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    const data = await resp.json().catch(() => ({}));
    return { status: resp.status, data };
  };

  console.log(`\n🚀 Lancement de la suite E2E VoteCloud sur : ${base}\n`);

  // 1. Topologie Multicloud
  const topo = await call('/api/topology');
  assert.equal(topo.status, 200, 'Topologie doit répondre 200');
  assert.equal(topo.data.summary.iaasCount, 2);
  assert.equal(topo.data.summary.paasCount, 2);
  assert.equal(topo.data.summary.faasCount, 1);
  assert.equal(topo.data.summary.azureServices, 0);
  console.log('✅ [1/8] Topologie Multicloud vérifiée (2 IaaS, 2 PaaS, 1 FaaS, 0 Azure)');

  // 2. Inscription & Authentification d'un nouvel électeur sur GCP IaaS #1
  const suffix = crypto.randomBytes(4).toString('hex');
  const testUser = {
    nationalId: `CIN-TEST-${suffix.toUpperCase()}`,
    fullName: `Électeur Test ${suffix}`,
    email: `test.${suffix}@votecloud.ma`,
    password: 'TestPassword@2026!',
  };
  const reg = await call('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(testUser),
  });
  assert.equal(reg.status, 201, `Register attendu 201, reçu ${reg.status}: ${JSON.stringify(reg.data)}`);
  assert.ok(reg.data.accessToken, 'accessToken JWT doit être retourné');
  const jwtToken = reg.data.accessToken;
  console.log(`✅ [2/8] Inscription & JWT GCP IaaS #1 OK (${testUser.email})`);

  // 3. Récupération des 3 scrutins (OPEN, CLOSED, UPCOMING)
  const elecResp = await call('/api/elections', {
    headers: { Authorization: `Bearer ${jwtToken}` },
  });
  assert.equal(elecResp.status, 200);
  const elections = elecResp.data.elections || [];
  const openElection = elections.find((e) => e.windowState === 'OPEN');
  const closedElection = elections.find((e) => e.windowState === 'CLOSED');
  const upcomingElection = elections.find((e) => e.windowState === 'UPCOMING');
  assert.ok(openElection, 'Un scrutin OPEN doit exister');
  assert.ok(closedElection, 'Un scrutin CLOSED doit exister');
  assert.ok(upcomingElection, 'Un scrutin UPCOMING doit exister');
  console.log('✅ [3/8] Scrutins OPEN / CLOSED / UPCOMING chargés depuis Supabase PaaS #1');

  // Helper pour obtenir un Vote Token auprès de GCP IaaS #1
  async function getVoteToken(electionId) {
    const t = await call('/api/auth/vote-token', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwtToken}` },
      body: JSON.stringify({ electionId }),
    });
    assert.equal(t.status, 200, `Vote token attendu 200, reçu ${t.status}`);
    return t.data.voteToken;
  }

  // 4. Scénario 1 : Vote Valide (Render -> GCP -> AWS Lambda -> Supabase -> AWS EC2)
  const openToken = await getVoteToken(openElection.id);
  const validVote = await call('/api/vote', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openToken}` },
    body: JSON.stringify({
      electionId: openElection.id,
      candidateId: openElection.candidates[0].id,
    }),
  });
  assert.equal(validVote.status, 201, `Vote valide attendu 201, reçu ${validVote.status}: ${JSON.stringify(validVote.data)}`);
  assert.ok(validVote.data.receipt?.receiptCode, 'Reçu cryptographique attendu');
  assert.ok(validVote.data.receipt?.auditBlockIndex, 'Bloc d\'audit AWS EC2 attendu');
  const receiptCode = validVote.data.receipt.receiptCode;
  console.log(`✅ [4/8] Scénario 1 — Vote valide accepté par AWS Lambda (Reçu: ${receiptCode}, Bloc AWS EC2 #${validVote.data.receipt.auditBlockIndex})`);

  // 5. Scénario 2 : Tentative de Double Vote -> doit retourner HTTP 409
  const secondToken = await getVoteToken(openElection.id);
  const doubleVote = await call('/api/vote', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secondToken}` },
    body: JSON.stringify({
      electionId: openElection.id,
      candidateId: openElection.candidates[1]?.id || openElection.candidates[0].id,
    }),
  });
  assert.equal(doubleVote.status, 409, `Double vote attendu 409, reçu ${doubleVote.status}`);
  assert.equal(doubleVote.data.error, 'DOUBLE_VOTE_DETECTED');
  console.log(`✅ [5/8] Scénario 2 — Double vote bloqué (HTTP 409 DOUBLE_VOTE_DETECTED, Bloc AWS EC2 #${doubleVote.data.auditBlockIndex})`);

  // 6. Scénario 3 : Vote Hors Période (CLOSED + UPCOMING) -> doivent retourner HTTP 403
  const closedToken = await getVoteToken(closedElection.id);
  const closedVote = await call('/api/vote', {
    method: 'POST',
    headers: { Authorization: `Bearer ${closedToken}` },
    body: JSON.stringify({
      electionId: closedElection.id,
      candidateId: closedElection.candidates[0].id,
    }),
  });
  assert.equal(closedVote.status, 403, `Scrutin clôturé attendu 403, reçu ${closedVote.status}`);
  assert.equal(closedVote.data.error, 'ELECTION_CLOSED');

  const upcomingToken = await getVoteToken(upcomingElection.id);
  const upcomingVote = await call('/api/vote', {
    method: 'POST',
    headers: { Authorization: `Bearer ${upcomingToken}` },
    body: JSON.stringify({
      electionId: upcomingElection.id,
      candidateId: upcomingElection.candidates[0].id,
    }),
  });
  assert.equal(upcomingVote.status, 403, `Scrutin à venir attendu 403, reçu ${upcomingVote.status}`);
  assert.equal(upcomingVote.data.error, 'ELECTION_NOT_STARTED');

  // Bonus sécurité : Jeton falsifié -> HTTP 401
  const forgedVote = await call('/api/vote', {
    method: 'POST',
    headers: { Authorization: 'Bearer fake.jwt.signature' },
    body: JSON.stringify({
      electionId: openElection.id,
      candidateId: openElection.candidates[0].id,
    }),
  });
  assert.equal(forgedVote.status, 401, 'Jeton falsifié doit être rejeté 401');
  console.log('✅ [6/8] Scénario 3 — Votes hors période (CLOSED/UPCOMING -> 403) & jeton falsifié (401) bloqués');

  // 7. Dépouillement temps réel, réconciliation inter-cloud & vérification du reçu (AWS EC2)
  const receiptResp = await call(`/api/audit/receipt/${encodeURIComponent(receiptCode)}`);
  assert.equal(receiptResp.status, 200);
  assert.equal(receiptResp.data.found, true);
  assert.equal(receiptResp.data.verifiedCrossCloud, true);

  const tallyResp = await call(`/api/audit/tally/${openElection.id}`);
  assert.equal(tallyResp.status, 200);
  assert.ok(tallyResp.data.totalVotes >= 1);
  assert.ok(tallyResp.data.securityMetrics.blockedDoubleVotes >= 1);
  console.log(
    `✅ [7/8] Dépouillement temps réel & Vérification Reçu OK (Total: ${tallyResp.data.totalVotes}, Réconcilié: ${tallyResp.data.crossCloudReconciliation.reconciled})`
  );

  // 8. Intégrité cryptographique SHA-256 de la chaîne d'audit (AWS EC2 IaaS #2)
  const verifyResp = await call('/api/audit/verify');
  assert.equal(verifyResp.status, 200);
  assert.equal(verifyResp.data.overallValid, true);
  assert.ok(verifyResp.data.localEbsLedger.blocksVerified >= 4);
  console.log(
    `✅ [8/8] Intégrité Chaîne d'Audit SHA-256 VALIDÉE (${verifyResp.data.localEbsLedger.blocksVerified} blocs intègres)`
  );

  console.log('\n🎉 TOUS LES TESTS END-TO-END MULTICLOUD ONT RÉUSSI !\n');
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('e2e-test.mjs')) {
  runE2E().catch((err) => {
    console.error('\n❌ ÉCHEC E2E :', err);
    process.exit(1);
  });
}
