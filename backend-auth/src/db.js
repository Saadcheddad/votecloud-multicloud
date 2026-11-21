/**
 * Module de connexion PostgreSQL (PaaS #1 : Supabase PostgreSQL)
 * Supporte le Session/Transaction Pooler IPv4 avec TLS (DATABASE_SSL=true)
 * ainsi que PostgreSQL local (Docker) sans SSL.
 */
const { Pool } = require('pg');

function createPool(customPool) {
  if (customPool) return customPool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL est manquant dans les variables d\'environnement.');
  }

  const useSsl =
    String(process.env.DATABASE_SSL || 'true').toLowerCase() === 'true' &&
    !connectionString.includes('localhost') &&
    !connectionString.includes('127.0.0.1') &&
    !connectionString.includes('@postgres:');

  return new Pool({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 8000,
  });
}

module.exports = { createPool };
