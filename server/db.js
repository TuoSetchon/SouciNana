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
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
      max: 5,
    });
    impl = { query: (sql, params) => pool.query(sql, params), exec: (sql) => pool.query(sql) };
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
