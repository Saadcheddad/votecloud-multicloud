/**
 * Endpoint /api/health pour Vercel Serverless Function (FaaS #1)
 */
import { handler } from '../index.mjs';

export default async function vercelHealthHandler(req, res) {
  const event = {
    rawPath: '/health',
    headers: req.headers || {},
    requestContext: {
      http: { method: 'GET', path: '/health' },
      requestId: req.headers['x-vercel-id'] || `vercel-faas-${Date.now().toString(36)}`,
    },
  };

  const context = {
    awsRequestId: req.headers['x-vercel-id'] || `vercel-faas-${Date.now().toString(36)}`,
    functionName: 'votecloud-faas-vote (Vercel Serverless)',
  };

  const result = await handler(event, context);
  const parsed = JSON.parse(result.body || '{}');
  parsed.provider = 'Vercel';
  parsed.cloudService = 'Vercel Serverless Function (FaaS #1)';
  parsed.region = process.env.VERCEL_REGION || 'cdg1';

  for (const [k, v] of Object.entries(result.headers || {})) {
    res.setHeader(k, v);
  }
  res.setHeader('X-Cloud-Provider', 'Vercel');
  res.setHeader('X-Cloud-Service', 'Vercel Serverless Function (FaaS #1)');
  res.status(result.statusCode || 200).json(parsed);
}
