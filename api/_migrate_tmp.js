// TEMPORARY — secret-gated read-only diagnostic, invoked only via the
// secret-gated branch in settings.js. Deleted once this check is done.
const { getPool } = require('./_db');

module.exports = async (req, res) => {
  const pool = await getPool();
  try {
    const students = await pool.request().query(`
      SELECT id, name, course, courseCode, trainer, campus, commenced, expectedEnd, status, withdrawn
      FROM students
      ORDER BY name
    `);
    const enrollments = await pool.request().query(`
      SELECT id, studentId, course, courseCode, trainer, commenced, expectedEnd, status, isPrimary
      FROM enrollments
      ORDER BY studentId
    `);
    return res.status(200).json({ students: students.recordset, enrollments: enrollments.recordset });
  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
};
