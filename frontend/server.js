/**
 * ==============================================================================
 * VoteCloud - frontend (PaaS #2 : Render Web Service Node.js Managé)
 * ==============================================================================
 * Rôle double :
 *   1. Sert l'interface web SPA (vote citoyen, administration, résultats temps réel, audit)
 *   2. Agit comme passerelle BFF HTTPS (Backend-for-Frontend) vers :
 *      - IaaS #1 : GCP Compute Engine (AUTH_SERVICE_URL)
 *      - FaaS #1 : AWS Lambda (FAAS_VOTE_URL)
 *      - IaaS #2 : AWS EC2 Audit Node (AUDIT_SERVICE_URL)
 *      Élimine tout problème de Mixed Content (HTTPS -> HTTP) et de CORS dans le navigateur.
 * ==============================================================================
 */
const os = require('os');
const path = require('path');
const express = require('express');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

function createApp(options = {}) {
  const getAuthUrl = () =>
    (options.authServiceUrl || process.env.AUTH_SERVICE_URL || 'http://localhost:3001').replace(/\/$/, '');
  const getAuditUrl = () =>
    (options.auditServiceUrl || process.env.AUDIT_SERVICE_URL || 'http://localhost:3002').replace(/\/$/, '');
  const getFaasUrl = () =>
    (options.faasVoteUrl || process.env.FAAS_VOTE_URL || 'http://localhost:3003').replace(/\/$/, '');

  const cloudProvider = process.env.CLOUD_PROVIDER || 'Render';
  const cloudService = process.env.CLOUD_SERVICE || 'Render Web Service (PaaS #2)';
  const cloudRegion = process.env.CLOUD_REGION || process.env.RENDER_REGION || 'frankfurt';

  const app = express();
  app.use(express.json({ limit: '512kb' }));

  // --- Santé du service PaaS #2 ---
  app.get('/health', (_req, res) => {
    res.json({
      status: 'UP',
      service: 'frontend-bff',
      model: 'PaaS #2',
      provider: cloudProvider,
      cloudService,
      region: cloudRegion,
      hostname: os.hostname(),
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  // --- Utilitaire de sonde santé vers les clouds distants ---
  async function probeService(url) {
    const started = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      const data = await resp.json().catch(() => ({}));
      return {
        reachable: true,
        httpStatus: resp.status,
        latencyMs: Date.now() - started,
        endpoint: url,
        data,
      };
    } catch (err) {
      return {
        reachable: false,
        httpStatus: 0,
        latencyMs: Date.now() - started,
        endpoint: url,
        error: err.message,
      };
    }
  }

  // --- Sonde globale des 5 services Multicloud en temps réel ---
  app.get('/api/topology', async (_req, res) => {
    const authUrl = getAuthUrl();
    const auditUrl = getAuditUrl();
    const faasUrl = getFaasUrl();

    const [gcpAuth, awsAudit, awsLambda] = await Promise.all([
      probeService(`${authUrl}/health`),
      probeService(`${auditUrl}/health`),
      probeService(`${faasUrl}/health`),
    ]);

    const supabaseInfo = gcpAuth.data?.database || {
      model: 'PaaS #1',
      provider: 'Supabase PostgreSQL',
      status: gcpAuth.reachable ? 'UNKNOWN' : 'UNREACHABLE',
    };

    res.json({
      checkedAt: new Date().toISOString(),
      summary: {
        iaasCount: 2,
        paasCount: 2,
        faasCount: 1,
        azureServices: 0,
      },
      services: {
        iaas1_gcp: {
          model: 'IaaS #1',
          provider: gcpAuth.data?.provider || 'Oracle Cloud Infrastructure (OCI)',
          service: gcpAuth.data?.cloudService || 'OCI Compute Auth Node',
          role: 'Authentification électeurs, gestion scrutins & émission de jetons signés',
          status: gcpAuth.reachable && gcpAuth.data?.status === 'UP' ? 'UP' : 'DOWN',
          region: gcpAuth.data?.region || 'af-casablanca-1',
          hostname: gcpAuth.data?.hostname || '-',
          latencyMs: gcpAuth.latencyMs,
          endpoint: authUrl,
          error: gcpAuth.error || null,
        },
        iaas2_aws: {
          model: 'IaaS #2',
          provider: awsAudit.data?.provider || 'Oracle Cloud Infrastructure (OCI)',
          service: awsAudit.data?.cloudService || 'OCI Compute Audit Node',
          role: 'Registre d\'audit SHA-256 indépendant & réconciliation inter-cloud',
          status: awsAudit.reachable && awsAudit.data?.status === 'UP' ? 'UP' : 'DOWN',
          region: awsAudit.data?.region || 'af-casablanca-1',
          hostname: awsAudit.data?.hostname || '-',
          latencyMs: awsAudit.latencyMs,
          auditChain: awsAudit.data?.auditChain || null,
          endpoint: auditUrl,
          error: awsAudit.error || null,
        },
        paas1_supabase: {
          model: 'PaaS #1',
          provider: 'Supabase (DBaaS)',
          service: 'PostgreSQL 17 Managé',
          role: 'Stockage ACID des scrutins, électeurs et urne (contrainte UNIQUE anti-double vote)',
          status: supabaseInfo.status === 'UP' ? 'UP' : 'DOWN',
          version: supabaseInfo.version || 'PostgreSQL',
          counts: supabaseInfo.counts || {},
          region: process.env.SUPABASE_REGION || 'eu-west-1',
        },
        paas2_render: {
          model: 'PaaS #2',
          provider: cloudProvider,
          service: cloudService,
          role: 'Hébergement managé du portail web HTTPS & passerelle BFF multicloud',
          status: 'UP',
          region: cloudRegion,
          hostname: os.hostname(),
          latencyMs: 1,
        },
        faas1_lambda: {
          model: 'FaaS #1',
          provider: awsLambda.data?.provider || 'Vercel',
          service: awsLambda.data?.cloudService || 'Vercel Serverless Functions (Node.js 20)',
          role: 'Validation serverless du vote, contrôle période & insertion atomique dans l\'urne',
          status: awsLambda.reachable && awsLambda.data?.status === 'UP' ? 'UP' : 'DOWN',
          region: awsLambda.data?.region || 'cdg1',
          functionName: awsLambda.data?.functionName || 'votecloud-faas-vote',
          awsRequestId: awsLambda.data?.awsRequestId || '-',
          coldStart: awsLambda.data?.coldStart ?? null,
          latencyMs: awsLambda.latencyMs,
          endpoint: faasUrl,
          error: awsLambda.error || null,
        },
      },
    });
  });

  // --- Helper Proxy HTTP/HTTPS vers les microservices distants ---
  async function forwardRequest(req, res, targetUrl, upstreamLabel) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (req.headers.authorization) {
        headers.Authorization = req.headers.authorization;
      }

      const fetchOptions = {
        method: req.method,
        headers,
      };
      if (!['GET', 'HEAD'].includes(req.method) && req.body && Object.keys(req.body).length > 0) {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const upstreamResp = await fetch(targetUrl, { ...fetchOptions, signal: controller.signal });
      clearTimeout(timer);

      const text = await upstreamResp.text();
      res.setHeader('X-Proxied-By', `${cloudProvider} (${cloudService})`);
      res.setHeader('X-Upstream-Service', upstreamLabel);
      if (upstreamResp.headers.get('x-cloud-provider')) {
        res.setHeader('X-Upstream-Cloud', upstreamResp.headers.get('x-cloud-provider'));
      }

      res.status(upstreamResp.status);
      try {
        res.json(JSON.parse(text));
      } catch (_err) {
        res.send(text);
      }
    } catch (err) {
      console.error(`[PROXY ERROR -> ${upstreamLabel}]`, err.message);
      res.status(502).json({
        error: 'UPSTREAM_UNREACHABLE',
        upstream: upstreamLabel,
        message: `Service distant (${upstreamLabel}) injoignable : ${err.message}`,
      });
    }
  }

  // Routes proxifiées vers IaaS #1 (GCP Compute Engine)
  app.all('/api/auth/*', (req, res) => {
    forwardRequest(req, res, `${getAuthUrl()}${req.originalUrl}`, 'IaaS #1 - GCP Compute Engine');
  });
  app.all('/api/elections', (req, res) => {
    forwardRequest(req, res, `${getAuthUrl()}${req.originalUrl}`, 'IaaS #1 - GCP Compute Engine');
  });
  app.all('/api/elections/*', (req, res) => {
    forwardRequest(req, res, `${getAuthUrl()}${req.originalUrl}`, 'IaaS #1 - GCP Compute Engine');
  });

  // Route proxifiée vers FaaS #1 (AWS Lambda)
  app.post('/api/vote', (req, res) => {
    forwardRequest(req, res, `${getFaasUrl()}/`, 'FaaS #1 - AWS Lambda');
  });

  // Routes proxifiées vers IaaS #2 (AWS EC2 Audit Node)
  app.all('/api/audit/*', (req, res) => {
    forwardRequest(req, res, `${getAuditUrl()}${req.originalUrl}`, 'IaaS #2 - AWS EC2 Audit Node');
  });

  // Fichiers statiques de l'interface web
  app.use(express.static(path.join(__dirname, 'public')));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  return { app };
}

if (require.main === module) {
  const PORT = Number(process.env.PORT || 3000);
  const { app } = createApp();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[frontend | PaaS #2 Render] Portail VoteCloud démarré sur http://0.0.0.0:${PORT}`);
  });
}

module.exports = { createApp };
