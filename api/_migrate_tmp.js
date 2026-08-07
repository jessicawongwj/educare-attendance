const { getPool, sql } = require('./_db');
module.exports = async (req, res) => {
  const pool = await getPool();
  try {
    const enrollments = await pool.request().query(`
      SELECT * FROM enrollments WHERE studentId IN ('15804793','15982780') ORDER BY studentId
    `);
    return res.status(200).json({ enrollments: enrollments.recordset });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
