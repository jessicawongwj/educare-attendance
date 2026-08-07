const { getPool, sql } = require('./_db');
module.exports = async (req, res) => {
  const pool = await getPool();
  try {
    const students = await pool.request().query(`
      SELECT id, name, trainer, course, courseCode, commenced, expectedEnd, status
      FROM students WHERE id IN ('15982780','15804793')
    `);
    return res.status(200).json({ students: students.recordset });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
