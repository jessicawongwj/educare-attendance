const { getPool, sql } = require('./_db');
const { validateToken, isAdminUser, ensureAdminCache } = require('./_auth');

module.exports = async (req, res) => {
  const user = await validateToken(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const pool = await getPool();
    await ensureAdminCache(pool);

    if (req.method === 'GET') {
      const result = await pool.request()
        .query(`
          SELECT id, name, course, courseCode, trainer, campus, commenced, expectedEnd, status, withdrawn
          FROM students
          WHERE withdrawn = 0
          ORDER BY name
        `);
      return res.status(200).json(result.recordset);
    }

    // PATCH — mark student active (admin only)
    if (req.method === 'PATCH') {
      const email = (user.mail || user.userPrincipalName || '').toLowerCase();
      if (!isAdminUser(email)) return res.status(403).json({ error: 'Admin only' });
      const { id, status } = req.body || {};
      if (!id || !status) return res.status(400).json({ error: 'Missing id or status' });
      await pool.request()
        .input('id',     sql.VarChar(20), id)
        .input('status', sql.VarChar(20), status)
        .query(`
          UPDATE students SET status = @status WHERE id = @id;
          UPDATE enrollments SET status = @status WHERE studentId = @id AND status = 'not-started';
        `);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
