/**
 * Script d'initialisation de la base PaaS #1 (Supabase PostgreSQL / Postgres local)
 * Exécute infra/sql/schema.sql puis infra/sql/seed.sql de façon idempotente.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { createPool } = require('./db');

async function run() {
  const pool = createPool();
  const schemaPath = path.resolve(__dirname, '../../infra/sql/schema.sql');
  const seedPath = path.resolve(__dirname, '../../infra/sql/seed.sql');

  try {
    console.log('[DB-INIT] Connexion à PostgreSQL PaaS...');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(schemaSql);
    console.log('[DB-INIT] Schéma appliqué avec succès.');

    const seedSql = fs.readFileSync(seedPath, 'utf8');
    await pool.query(seedSql);
    console.log('[DB-INIT] Données de démonstration (comptes & 3 scrutins) insérées avec succès.');
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error('[DB-INIT] Erreur :', err.message);
  process.exit(1);
});
