// TEMPORARY — secret-gated read-only diagnostic, invoked only via the
// secret-gated branch in settings.js. Deleted once this check is done.
const { getPool, sql } = require('./_db');

module.exports = async (req, res) => {
  const pool = await getPool();
  try {
    // Students whose students.trainer likely went stale after a reassignment —
    // course/courseCode combos that don't match that trainer's usual specialty.
    const stale = await pool.request().query(`
      SELECT s.id, s.name, s.trainer AS studentsTrainer, s.course, s.courseCode,
             e.trainer AS enrollmentsTrainer, e.commenced, e.expectedEnd, e.status
      FROM students s
      LEFT JOIN enrollments e ON e.studentId = s.id AND e.course = s.course
      WHERE s.withdrawn = 0 AND (
        (s.trainer = 'Sherwin Thiarhia' AND s.courseCode IN ('CHC52021','CHC52025')) OR
        (s.trainer = 'Toriqul Mozumder' AND s.courseCode = 'CHC43015') OR
        (s.trainer = 'Zeyun Ma' AND s.courseCode = 'CHC52021')
      )
      ORDER BY s.trainer, s.name
    `);
    return res.status(200).json({ stale: stale.recordset });
  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
};
