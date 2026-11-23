import { handler } from '../index.mjs';

export default async function vercelVoteHandler(req, res) {
  const event = {
    rawPath: '/api/vote',
    headers: req.headers || {},
    requestContext: {
      http: { method: req.method || 'POST', path: '/api/vote' },
      requestId: req.headers['x-vercel-id'] || `vercel-faas-${Date.now().toString(36)}`,
    },
    body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}),
    isBase64Encoded: false,
  };

  const context = {
    awsRequestId: req.headers['x-vercel-id'] || `vercel-faas-${Date.now().toString(36)}`,
    functionName: 'votecloud-faas-vote (Vercel Serverless Function)',
  };

  const result = await handler(event, context);
  for (const [k, v] of Object.entries(result.headers || {})) {
    res.setHeader(k, v);
  }
  res.setHeader('X-Cloud-Provider', 'Vercel');
  res.setHeader('X-Cloud-Service', 'Vercel Serverless Function (FaaS #1)');
  res.status(result.statusCode || 200).send(result.body || '');
}
