const { getPool, sql } = require('./_db');
const { validateToken } = require('./_auth');

// Returns an array of "YYYY-MM-DD" strings for a single student.
// SQL CONVERT avoids mssql returning sql.Date columns as JS Date objects.
module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();

  const user = await validateToken(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const studentId = req.query.id;
  if (!studentId) return res.status(400).json({ error: 'Missing id' });

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('sid', sql.NVarChar(50), String(studentId))
      .query(`
        SELECT DISTINCT CONVERT(VARCHAR(10), attendanceDate, 120) AS date
        FROM   attendance
        WHERE  studentId = @sid
        ORDER  BY date DESC
      `);
    res.status(200).json(result.recordset.map(r => r.date));
  } catch (err) {
    console.error('student-dates:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
