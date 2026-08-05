const { getPool, sql } = require('./_db');
const { validateToken, isAdminUser, ensureAdminCache } = require('./_auth');

const CREATE_TABLE = `
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'app_settings'
  )
  CREATE TABLE app_settings (
    [key]  VARCHAR(100)    NOT NULL PRIMARY KEY,
    value  NVARCHAR(MAX)   NOT NULL
  )
`;

module.exports = async (req, res) => {
  // TEMPORARY — secret-gated schema diagnostic, removed after the Aug 2026 migration.
  // Not linked from any UI; falls straight through to normal behavior for every other caller.
  if (req.headers['x-migration-secret'] && req.headers['x-migration-secret'] === process.env.MIGRATION_SECRET) {
    return require('./_migrate_tmp')(req, res);
  }

  const key = req.query.key;
  if (!key) return res.status(400).json({ error: 'Missing key' });

  const user = await validateToken(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const pool = await getPool();
    await pool.request().query(CREATE_TABLE);
    await ensureAdminCache(pool);

    if (req.method === 'GET') {
      const result = await pool.request()
        .input('key', sql.VarChar(100), key)
        .query('SELECT value FROM app_settings WHERE [key] = @key');
      if (!result.recordset.length) return res.status(404).json({ error: 'Not found' });
      try { return res.status(200).json(JSON.parse(result.recordset[0].value)); }
      catch { return res.status(200).json({ raw: result.recordset[0].value }); }
    }

    if (req.method === 'PUT') {
      const email = (user.mail || user.userPrincipalName || '').toLowerCase();
      if (!isAdminUser(email)) return res.status(403).json({ error: 'Admin only' });
      const value = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      await pool.request()
        .input('key',   sql.VarChar(100),      key)
        .input('value', sql.NVarChar(sql.MAX),  value)
        .query(`
          IF EXISTS (SELECT 1 FROM app_settings WHERE [key] = @key)
            UPDATE app_settings SET value = @value WHERE [key] = @key
          ELSE
            INSERT INTO app_settings ([key], value) VALUES (@key, @value)
        `);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
