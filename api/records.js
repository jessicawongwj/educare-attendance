const { getPool } = require('./_db');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT id, studentId, studentName, course, courseCode, trainer, campus,
             checkinTime, checkoutTime, attendanceDate, notes
      FROM attendance
      WHERE attendanceDate >= DATEADD(day, -90, CAST(GETDATE() AS DATE))
      ORDER BY attendanceDate DESC, checkinTime DESC
    `);
    res.status(200).json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
