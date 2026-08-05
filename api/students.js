const { getPool, sql } = require('./_db');
const { validateToken, isAdminUser, ensureAdminCache } = require('./_auth');

module.exports = async (req, res) => {
  const user = await validateToken(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const pool = await getPool();
    await ensureAdminCache(pool);

    if (req.method === 'GET') {
      const request = pool.request();
      let where = 'WHERE withdrawn = 0';

      // Optional server-side filters (additive — omitting them reproduces the
      // previous full-roster response exactly)
      if (req.query.trainer) {
        request.input('fTrainer', sql.NVarChar(200), req.query.trainer);
        where += ' AND trainer = @fTrainer';
      }
      if (req.query.campus) {
        request.input('fCampus', sql.NVarChar(100), req.query.campus);
        where += ' AND campus = @fCampus';
      }
      if (req.query.course) {
        request.input('fCourse', sql.NVarChar(300), req.query.course);
        where += ' AND course = @fCourse';
      }
      if (req.query.status) {
        request.input('fStatus', sql.VarChar(20), req.query.status);
        where += ' AND status = @fStatus';
      }
      if (req.query.q) {
        request.input('fq', sql.NVarChar(200), `%${req.query.q}%`);
        where += ' AND name LIKE @fq';
      }

      // Optional pagination — strictly opt-in, same contract as records.js
      let pageClause = '';
      if (req.query.page || req.query.pageSize) {
        const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize, 10) || 100));
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        request.input('offset', sql.Int, (page - 1) * pageSize);
        request.input('pageSize', sql.Int, pageSize);
        pageClause = 'OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY';
      }

      const result = await request.query(`
        SELECT id, name, course, courseCode, trainer, campus, commenced, expectedEnd, status, withdrawn
               ${pageClause ? ', COUNT(*) OVER() AS totalCount' : ''}
        FROM students
        ${where}
        ORDER BY name
        ${pageClause}
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
