const { getPool, sql } = require('./_db');
const { validateToken, isAdminUser, ensureAdminCache } = require('./_auth');
const { trainersFromEmail } = require('./_trainers');

async function ensureNotesTable(pool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'student_notes')
    CREATE TABLE student_notes (
      id        INT IDENTITY(1,1) PRIMARY KEY,
      studentId VARCHAR(20)       NOT NULL,
      note      NVARCHAR(1000)    NOT NULL,
      createdBy NVARCHAR(200),
      createdAt DATETIME2         DEFAULT GETDATE()
    )
  `);
}

module.exports = async (req, res) => {
  const user = await validateToken(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const isNotes = req.query.type === 'notes';

  // ── Student Notes ─────────────────────────────────────────────────────────
  if (isNotes) {
    try {
      const pool = await getPool();
      await ensureNotesTable(pool);

      if (req.method === 'GET') {
        const studentId = req.query.student;
        if (!studentId) return res.status(400).json({ error: 'Missing student' });
        const result = await pool.request()
          .input('sid', sql.VarChar(20), studentId)
          .query('SELECT id, studentId, note, createdBy, createdAt FROM student_notes WHERE studentId = @sid ORDER BY createdAt DESC');
        return res.status(200).json(result.recordset);
      }

      if (req.method === 'POST') {
        const { studentId, note, createdBy } = req.body || {};
        if (!studentId || !(note || '').trim()) return res.status(400).json({ error: 'Missing fields' });
        await pool.request()
          .input('sid',  sql.VarChar(20),    studentId)
          .input('note', sql.NVarChar(1000), note.trim())
          .input('by',   sql.NVarChar(200),  createdBy || '')
          .query('INSERT INTO student_notes (studentId, note, createdBy) VALUES (@sid, @note, @by)');
        return res.status(200).json({ ok: true });
      }

      if (req.method === 'DELETE') {
        const { id, studentId } = req.body || {};
        if (!id || !studentId) return res.status(400).json({ error: 'Missing fields' });
        await pool.request()
          .input('id',  sql.Int,         id)
          .input('sid', sql.VarChar(20), studentId)
          .query('DELETE FROM student_notes WHERE id = @id AND studentId = @sid');
        return res.status(200).json({ ok: true });
      }

      return res.status(405).end();
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  // ── Attendance Records ─────────────────────────────────────────────────────
  if (req.method !== 'GET') return res.status(405).end();

  const email = (user.mail || user.userPrincipalName || '').toLowerCase();

  try {
    const pool = await getPool();
    await ensureAdminCache(pool);
    const adminUser = isAdminUser(email);
    const trainerNames = adminUser ? [] : trainersFromEmail(email);
    const request = pool.request();
    const studentId = req.query.student || req.query.studentId;

    // When fetching a single student, return full history (no date cap)
    let where = studentId
      ? 'WHERE 1=1'
      : 'WHERE attendanceDate >= DATEADD(day, -90, CAST(GETDATE() AS DATE))';

    // Non-admin trainers: scope to own records only
    if (!adminUser && trainerNames.length > 0) {
      const placeholders = trainerNames.map((_, i) => `@t${i}`).join(',');
      trainerNames.forEach((n, i) => request.input(`t${i}`, sql.NVarChar(200), n));
      where += ` AND trainer IN (${placeholders})`;
    } else if (!adminUser && trainerNames.length === 0) {
      return res.status(200).json([]);
    }

    if (studentId) {
      request.input('sid', sql.NVarChar(50), studentId);
      where += ' AND studentId = @sid';
    }

    const result = await request.query(`
      SELECT id, studentId, studentName, course, courseCode, trainer, campus,
             checkinTime, checkoutTime, attendanceDate, notes
      FROM attendance
      ${where}
      ORDER BY attendanceDate DESC, checkinTime DESC
    `);
    res.status(200).json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
