require('dotenv').config();

let pool;

if (process.env.USE_PGLITE === '1') {
  // Modo de prueba local en memoria (sin Postgres real). Ver test/api.test.js
  const { PGlite } = require('@electric-sql/pglite');
  const pglite = new PGlite();
  pool = {
    query: (text, params) => pglite.query(text, params),
    // exec() soporta multiples sentencias separadas por ';' (para migrar schema.sql)
    exec: (text) => pglite.exec(text),
    connect: async () => ({
      query: (text, params) => pglite.query(text, params),
      release: () => {},
    }),
  };
} else {
  const { Pool } = require('pg');
  const connectionString = process.env.DATABASE_URL;
  const pgPool = new Pool({
    connectionString,
    ssl: connectionString && !connectionString.includes('localhost')
      ? { rejectUnauthorized: false }
      : false,
  });
  pool = {
    query: (text, params) => pgPool.query(text, params),
    exec: (text) => pgPool.query(text),
    connect: () => pgPool.connect(),
  };
}

module.exports = pool;
