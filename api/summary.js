const { getPool, sql } = require('./_db');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        s.id, s.name, s.course, s.courseCode, s.trainer, s.campus,
        s.status, s.commenced, s.expectedEnd,
        COUNT(a.id)        AS attendedDays,
        MAX(a.checkinTime) AS lastCheckin
      FROM students s
      LEFT JOIN attendance a
        ON a.studentId = s.id
        AND a.attendanceDate >= DATEADD(day, -30, CAST(GETDATE() AS DATE))
      WHERE s.withdrawn = 0
      GROUP BY s.id, s.name, s.course, s.courseCode, s.trainer, s.campus,
               s.status, s.commenced, s.expectedEnd
      ORDER BY s.name
    `);
    res.status(200).json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
