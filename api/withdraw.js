const { getPool, sql } = require('./_db');

// reason: 'not-started' | 'completed' | 'not-my-student'
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { studentId, course, reason } = req.body;
  if (!studentId || !reason) {
    return res.status(400).json({ error: 'Missing studentId or reason' });
  }

  const statusMap = {
    'not-started':    'not-started',
    'completed':      'completed',
    'not-my-student': 'inactive',
  };
  const newStatus = statusMap[reason] || 'inactive';

  try {
    const pool = await getPool();
    const req2 = pool.request()
      .input('studentId', sql.VarChar(20),  studentId)
      .input('status',    sql.VarChar(50),   newStatus);

    if (course) {
      req2.input('course', sql.NVarChar(300), course);
      await req2.query('UPDATE enrollments SET status=@status WHERE studentId=@studentId AND course=@course');
    } else {
      await req2.query('UPDATE enrollments SET status=@status WHERE studentId=@studentId');
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
};
