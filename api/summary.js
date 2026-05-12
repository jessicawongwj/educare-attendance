const { getPool, sql } = require('./_db');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const pool = await getPool();

    // One row per enrollment. Attendance rate is matched by studentId + course
    // so dual-enrolled students get independent rates per course.
    const result = await pool.request().query(`
      SELECT
        s.id,
        s.name,
        e.course,
        e.courseCode,
        e.trainer,
        s.campus,
        e.status,
        e.commenced,
        e.expectedEnd,
        e.isPrimary,
        (SELECT COUNT(*) FROM enrollments WHERE studentId = s.id) AS enrollmentCount,
        COUNT(a.id)        AS attendedDays,
        MAX(a.checkinTime) AS lastCheckin
      FROM students s
      JOIN enrollments e ON e.studentId = s.id
      LEFT JOIN attendance a
        ON  a.studentId = s.id
        AND a.course    = e.course
        AND a.attendanceDate >= DATEADD(day, -30, CAST(GETDATE() AS DATE))
      WHERE s.withdrawn = 0
      GROUP BY
        s.id, s.name, e.course, e.courseCode, e.trainer, s.campus,
        e.status, e.commenced, e.expectedEnd, e.isPrimary
      ORDER BY s.name, e.isPrimary DESC
    `);

    res.status(200).json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
