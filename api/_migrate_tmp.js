// TEMPORARY — secret-gated one-off diagnostic/fix, invoked only via the
// secret-gated branch in settings.js. Deleted once this task is done.
const { getPool, sql } = require('./_db');

const IDS = ['14542405', '16054536', '16030239', '15982780'];

module.exports = async (req, res) => {
  const pool = await getPool();
  const step = req.query.mstep || 'inspect';

  try {
    if (step === 'inspect') {
      const students = await pool.request().query(`
        SELECT * FROM students WHERE id IN ('14542405','16054536','16030239','15982780')
      `);
      const enrollments = await pool.request().query(`
        SELECT * FROM enrollments WHERE studentId IN ('14542405','16054536','16030239','15982780')
      `);
      return res.status(200).json({ students: students.recordset, enrollments: enrollments.recordset });
    }

    return res.status(400).json({ error: 'Unknown step: ' + step });
  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
};
