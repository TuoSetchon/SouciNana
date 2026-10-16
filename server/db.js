// Accès base de données : PostgreSQL en production (DATABASE_URL),
// PGlite (PostgreSQL embarqué) en local pour le développement et les tests.
const fs = require('fs');
const path = require('path');

let impl;

async function init() {
  if (process.env.DATABASE_URL) {
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // adresse interne Render (sans point) : pas de SSL ; adresse externe : SSL
      ssl: process.env.DATABASE_SSL === 'false' || !new URL(process.env.DATABASE_URL).hostname.includes('.') ? false : { rejectUnauthorized: false },
      max: 5,
    });
    impl = { query: (sql, params) => pool.query(sql, params), exec: (sql) => pool.query(sql) };
  } else if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL manquante : ajoutez l’« Internal Database URL » de la base bonpro-db dans les variables d’environnement du service.');
  } else {
    const { PGlite } = require('@electric-sql/pglite');
    const dir = process.env.PGLITE_DIR || path.join(__dirname, '..', 'data', 'pglite');
    if (dir !== 'memory://') fs.mkdirSync(dir, { recursive: true });
    const db = new PGlite(dir);
    await db.waitReady;
    impl = { query: (sql, params) => db.query(sql, params), exec: (sql) => db.exec(sql) };
    console.log('Base locale PGlite :', dir);
  }
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await impl.exec(schema);
}

async function q(sql, params = []) {
  const r = await impl.query(sql, params);
  return r.rows;
}
async function one(sql, params = []) {
  const rows = await q(sql, params);
  return rows[0] || null;
}

module.exports = { init, q, one };
