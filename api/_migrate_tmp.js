// TEMPORARY — secret-gated read-only diagnostic, invoked only via the
// secret-gated branch in settings.js. Deleted once this check is done.
const { getPool, sql } = require('./_db');

module.exports = async (req, res) => {
  const pool = await getPool();
  try {
    const students = await pool.request().query(`
      SELECT id, name, trainer, course, courseCode, campus, commenced, expectedEnd, status, withdrawn
      FROM students WHERE trainer = 'Maggie Yu Huang' AND courseCode = 'CHC30121'
    `);
    const ids = students.recordset.map(s => s.id);
    let attendance = [];
    if (ids.length) {
      const attReq = pool.request();
      const placeholders = ids.map((id, i) => { attReq.input('id' + i, sql.VarChar(20), id); return '@id' + i; }).join(',');
      const att = await attReq.query(`
        SELECT studentId, attendanceDate, checkinTime, notes
        FROM attendance WHERE studentId IN (${placeholders})
        ORDER BY studentId, attendanceDate
      `);
      attendance = att.recordset;
    }
    const enrollments = await pool.request().query(`
      SELECT studentId, course, courseCode, trainer, commenced, expectedEnd, status
      FROM enrollments WHERE trainer = 'Maggie Yu Huang' AND courseCode = 'CHC30121'
    `);
    return res.status(200).json({ students: students.recordset, attendance, enrollments: enrollments.recordset });
  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
};
