/**
 * Client Webhook sécurisé (HMAC-SHA256) vers IaaS #2 (AWS EC2 - backend-audit)
 * Envoie les événements critiques d'authentification et d'administration des scrutins
 * pour scellement dans la chaîne d'audit SHA-256 hébergée sur AWS EC2.
 */
const { signWebhookBody } = require('./crypto');

async function emitAuditEvent({
  auditServiceUrl,
  webhookSecret,
  eventType,
  electionId = null,
  actorHash = null,
  details = {},
}) {
  if (!auditServiceUrl) return null;

  const endpoint = `${auditServiceUrl.replace(/\/$/, '')}/api/audit/events`;
  const payload = {
    eventType,
    sourceCloud: 'OCI-IaaS',
    electionId,
    actorHash,
    details,
    timestamp: new Date().toISOString(),
  };

  const rawBody = JSON.stringify(payload);
  const signature = signWebhookBody(webhookSecret, rawBody);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Audit-Signature': signature,
        'X-Source-Cloud': 'OCI-Compute-IaaS',
      },
      body: rawBody,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) {
      console.warn(`[AUDIT-CLIENT] AWS EC2 a répondu HTTP ${response.status}`);
      return null;
    }
    return await response.json();
  } catch (err) {
    // Non-bloquant : ne pas paralyser l'authentification si le nœud d'audit redémarre
    console.warn(`[AUDIT-CLIENT] Impossible de joindre AWS EC2 (${endpoint}): ${err.message}`);
    return null;
  }
}

module.exports = { emitAuditEvent };
