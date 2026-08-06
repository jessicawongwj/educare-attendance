const { sql } = require('./_db');

const ENSURE_TABLE = `
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'audit_log')
  BEGIN
    CREATE TABLE audit_log (
      id          INT IDENTITY(1,1) PRIMARY KEY,
      entityType  VARCHAR(50)    NOT NULL,   -- 'attendance' | 'student' | 'enrollment'
      entityId    VARCHAR(50)    NOT NULL,
      action      VARCHAR(20)    NOT NULL,   -- 'insert' | 'update' | 'delete'
      changedBy   NVARCHAR(200)  NULL,
      changedAt   DATETIME2      NOT NULL DEFAULT GETDATE(),
      beforeData  NVARCHAR(MAX)  NULL,
      afterData   NVARCHAR(MAX)  NULL
    );
    CREATE INDEX ix_audit_entity ON audit_log(entityType, entityId);
  END
`;

let ensured = false;
async function ensureAuditTable(pool) {
  if (ensured) return; // cheap in-process cache — CREATE TABLE check is still IF NOT EXISTS-safe if this races
  await pool.request().query(ENSURE_TABLE);
  ensured = true;
}

// Writes one audit row. `before`/`after` are plain objects (or null) — stored as JSON.
// Pass a `pool` or an open `transaction` (both expose .request()) — pass the transaction
// when a mutation is happening inside one, so the audit entry commits/rolls back with it.
async function writeAudit(poolOrTransaction, { entityType, entityId, action, changedBy, before, after }) {
  const req = poolOrTransaction.request();
  await req
    .input('entityType', sql.VarChar(50), entityType)
    .input('entityId',   sql.VarChar(50), String(entityId))
    .input('action',     sql.VarChar(20), action)
    .input('changedBy',  sql.NVarChar(200), changedBy || '')
    .input('before',     sql.NVarChar(sql.MAX), before ? JSON.stringify(before) : null)
    .input('after',      sql.NVarChar(sql.MAX), after ? JSON.stringify(after) : null)
    .query(`
      INSERT INTO audit_log (entityType, entityId, action, changedBy, beforeData, afterData)
      VALUES (@entityType, @entityId, @action, @changedBy, @before, @after)
    `);
}

module.exports = { ensureAuditTable, writeAudit };
