const sql = require('mssql');

const config = {
  server:   process.env.DB_SERVER,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options:  { encrypt: true, trustServerCertificate: false },
  pool:     { max: 10, min: 0, idleTimeoutMillis: 30000 },
  connectionTimeout: 30000,
  requestTimeout:    30000,
};

let pool;
async function getPool() {
  if (pool && pool.connected) return pool;
  if (pool) { try { await pool.close(); } catch(_) {} pool = null; }
  pool = await new sql.ConnectionPool(config).connect();
  return pool;
}

module.exports = { getPool, sql };
