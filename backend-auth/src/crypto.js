/**
 * Primitives cryptographiques du service d'authentification (GCP IaaS #1)
 * - Hachage de mot de passe : scrypt (natif Node.js, résistant au GPU/ASIC, 0 dépendance C++)
 * - Nullifier d'électeur : HMAC-SHA256(VOTE_HMAC_SECRET, electionId:voterId)
 *   -> Déterministe (garantit l'unicité du vote) mais non réversible sans secret serveur (anonymat)
 * - Jetons signés : JWT HS256 (session + jeton de vote courte durée)
 * - Signature Webhook inter-cloud : HMAC-SHA256 vers AWS EC2 (IaaS #2)
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string') return false;
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expectedHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function computeVoterHash(hmacSecret, electionId, voterId) {
  return crypto
    .createHmac('sha256', hmacSecret)
    .update(`${electionId}:${voterId}`)
    .digest('hex');
}

function hashIdentifier(hmacSecret, value) {
  return crypto
    .createHmac('sha256', hmacSecret)
    .update(`actor:${value}`)
    .digest('hex')
    .slice(0, 32);
}

function signAccessToken(payload, jwtSecret) {
  return jwt.sign(payload, jwtSecret, {
    expiresIn: '2h',
    issuer: 'votecloud-gcp-iaas-auth',
  });
}

function signVoteToken({ voterHash, electionId }, jwtSecret) {
  return jwt.sign(
    {
      typ: 'vote_credential',
      voterHash,
      electionId,
      nonce: crypto.randomBytes(12).toString('hex'),
      issuedBy: process.env.CLOUD_SERVICE || 'GCP Compute Engine (IaaS #1)',
    },
    jwtSecret,
    {
      expiresIn: '5m',
      issuer: 'votecloud-gcp-iaas-auth',
      audience: 'votecloud-aws-lambda-faas',
    }
  );
}

function verifyAccessToken(token, jwtSecret) {
  return jwt.verify(token, jwtSecret, {
    issuer: 'votecloud-gcp-iaas-auth',
  });
}

function signWebhookBody(secret, rawBody) {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

module.exports = {
  hashPassword,
  verifyPassword,
  computeVoterHash,
  hashIdentifier,
  signAccessToken,
  signVoteToken,
  verifyAccessToken,
  signWebhookBody,
};
