// TEMPORARY — secret-gated read-only diagnostic, invoked only via the
// secret-gated branch in settings.js. Deleted once this check is done.
const { getPool, sql } = require('./_db');

module.exports = async (req, res) => {
  const pool = await getPool();
  try {
    const result = await pool.request().query(`
      SELECT id, name, course, courseCode, trainer, campus, commenced, expectedEnd, status, withdrawn
      FROM students
      WHERE withdrawn = 0
      ORDER BY name
    `);
    return res.status(200).json(result.recordset);
  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
};
