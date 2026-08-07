// TEMPORARY — secret-gated read-only diagnostic, invoked only via the
// secret-gated branch in settings.js. Deleted once this check is done.
const { getPool } = require('./_db');

module.exports = async (req, res) => {
  const pool = await getPool();
  try {
    const students = await pool.request().query(`
      SELECT trainer, course, courseCode, COUNT(*) AS cnt
      FROM students WHERE withdrawn = 0
      GROUP BY trainer, course, courseCode
      ORDER BY trainer, course, courseCode
    `);
    const enrollments = await pool.request().query(`
      SELECT trainer, course, courseCode, COUNT(*) AS cnt
      FROM enrollments WHERE status = 'active'
      GROUP BY trainer, course, courseCode
      ORDER BY trainer, course, courseCode
    `);
    return res.status(200).json({ students: students.recordset, enrollments: enrollments.recordset });
  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
};
