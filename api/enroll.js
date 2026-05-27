const { getPool, sql } = require('./_db');
const { validateToken, isAdminUser, ensureAdminCache } = require('./_auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await validateToken(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const email = (user.mail || user.userPrincipalName || '').toLowerCase();
  const pool = await getPool();
  await ensureAdminCache(pool);
  if (!isAdminUser(email)) return res.status(403).json({ error: 'Admin only' });

  const { studentId, name, course, courseCode, trainer, campus, commenced, expectedEnd } = req.body;
  if (!studentId || !name || !course || !trainer) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Upsert student record
    const studentCheck = await pool.request()
      .input('id', sql.VarChar(20), studentId)
      .query('SELECT id FROM students WHERE id = @id');

    if (studentCheck.recordset.length === 0) {
      await pool.request()
        .input('id',      sql.VarChar(20),   studentId)
        .input('name',    sql.NVarChar(200),  name)
        .input('campus',  sql.NVarChar(100),  campus || '')
        .query(`INSERT INTO students (id, name, campus, withdrawn) VALUES (@id, @name, @campus, 0)`);
    }

    // Check if this enrollment already exists
    const enrollCheck = await pool.request()
      .input('studentId', sql.VarChar(20),   studentId)
      .input('course',    sql.NVarChar(300),  course)
      .query('SELECT id FROM enrollments WHERE studentId = @studentId AND course = @course');

    if (enrollCheck.recordset.length > 0) {
      await pool.request()
        .input('studentId',   sql.VarChar(20),   studentId)
        .input('course',      sql.NVarChar(300),  course)
        .input('trainer',     sql.NVarChar(200),  trainer)
        .input('commenced',   sql.Date,            commenced || new Date())
        .input('expectedEnd', sql.Date,            expectedEnd || null)
        .query(`UPDATE enrollments SET trainer=@trainer, commenced=@commenced, expectedEnd=@expectedEnd, status='active'
                WHERE studentId=@studentId AND course=@course`);
    } else {
      await pool.request()
        .input('studentId',   sql.VarChar(20),   studentId)
        .input('name',        sql.NVarChar(200),  name)
        .input('course',      sql.NVarChar(300),  course)
        .input('courseCode',  sql.VarChar(20),    courseCode || '')
        .input('trainer',     sql.NVarChar(200),  trainer)
        .input('commenced',   sql.Date,            commenced || new Date())
        .input('expectedEnd', sql.Date,            expectedEnd || null)
        .query(`INSERT INTO enrollments (studentId,studentName,course,courseCode,trainer,commenced,expectedEnd,status,isPrimary)
                VALUES (@studentId,@name,@course,@courseCode,@trainer,@commenced,@expectedEnd,'active',1)`);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
};
