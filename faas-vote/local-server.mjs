/**
 * Adaptateur HTTP local pour tester la fonction AWS Lambda (faas-vote) en local ou via Docker
 * Exécute exactement le même `handler(event, context)` qu'en production sur AWS Lambda !
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { handler } from './index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const PORT = Number(process.env.PORT || 3003);

export function createLocalLambdaServer() {
  return http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', async () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

      // Simule fidèlement un événement AWS Lambda Function URL v2
      const lambdaEvent = {
        version: '2.0',
        rawPath: urlObj.pathname,
        rawQueryString: urlObj.search.replace(/^\?/, ''),
        headers: req.headers,
        requestContext: {
          http: {
            method: req.method,
            path: urlObj.pathname,
          },
          requestId: `local-req-${Date.now().toString(36)}`,
        },
        body: rawBody || undefined,
        isBase64Encoded: false,
      };

      const lambdaContext = {
        awsRequestId: `local-lambda-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`,
        functionName: 'votecloud-faas-vote-local',
      };

      try {
        const result = await handler(lambdaEvent, lambdaContext);
        res.writeHead(result.statusCode || 200, result.headers || { 'Content-Type': 'application/json' });
        res.end(result.body || '');
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'LOCAL_ADAPTER_ERROR', message: err.message }));
      }
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createLocalLambdaServer();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[faas-vote | FaaS #1 AWS Lambda Local] Démarré sur http://0.0.0.0:${PORT}`);
  });
}
