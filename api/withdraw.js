const { getPool, sql } = require('./_db');
const { validateToken, isAdminUser, ensureAdminCache } = require('./_auth');

// reason: 'not-started' | 'completed' | 'not-my-student' | 'withdrawn'
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await validateToken(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const email = (user.mail || user.userPrincipalName || '').toLowerCase();

  const statusMap = {
    'not-started':    'not-started',
    'completed':      'completed',
    'not-my-student': 'inactive',
    'withdrawn':      'inactive',
  };

  const { studentId, course, reason } = req.body;
  if (!studentId || !reason) {
    return res.status(400).json({ error: 'Missing studentId or reason' });
  }
  const newStatus = statusMap[reason] || 'inactive';

  try {
    const pool = await getPool();
    await ensureAdminCache(pool);
    if (!isAdminUser(email)) return res.status(403).json({ error: 'Admin only' });

    const req2 = pool.request()
      .input('studentId', sql.VarChar(20), studentId)
      .input('status',    sql.VarChar(50), newStatus);

    if (course) {
      req2.input('course', sql.NVarChar(300), course);
      await req2.query('UPDATE enrollments SET status=@status WHERE studentId=@studentId AND course=@course');
    } else {
      // No specific course — update all enrollments and mark student withdrawn
      await req2.query('UPDATE enrollments SET status=@status WHERE studentId=@studentId');
      if (reason === 'withdrawn') {
        await pool.request()
          .input('studentId', sql.VarChar(20), studentId)
          .query('UPDATE students SET withdrawn=1 WHERE id=@studentId');
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
};
