// TEMPORARY — secret-gated read-only diagnostic, invoked only via the
// secret-gated branch in settings.js. Deleted once this check is done.
const { getPool } = require('./_db');

const IDS = ['14646430','14878653','14910544','14990463','15028888','15254784','15335091','15388406','15719841','15830449','15917624'];

module.exports = async (req, res) => {
  const pool = await getPool();
  try {
    const enrollments = await pool.request().query(
      `SELECT * FROM enrollments WHERE studentId IN ('${IDS.join("','")}') ORDER BY studentId`
    );
    return res.status(200).json({ enrollments: enrollments.recordset });
  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
};
