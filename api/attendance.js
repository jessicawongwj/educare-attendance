const { getPool, sql } = require('./_db');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();

  const date = req.query.date ||
    new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' });

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('date', sql.Date, date)
      .query(`
        SELECT
          a.id, a.studentId, a.studentName, a.course, a.trainer, a.campus,
          a.checkinTime, a.checkoutTime, a.attendanceDate
        FROM attendance a
        WHERE a.attendanceDate = @date
        ORDER BY a.checkinTime DESC
      `);

    res.status(200).json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
