const { getPool, sql } = require('./_db');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { StudentID } = req.body;
  if (!StudentID) return res.status(400).json({ error: 'Missing StudentID' });

  try {
    const pool = await getPool();
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' });

    const result = await pool.request()
      .input('studentId',     sql.VarChar(20), StudentID)
      .input('attendanceDate', sql.Date,        today)
      .input('checkoutTime',  sql.DateTime2,   new Date())
      .query(`
        UPDATE attendance
        SET checkoutTime = @checkoutTime
        WHERE studentId = @studentId
          AND attendanceDate = @attendanceDate
          AND checkoutTime IS NULL
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'No open check-in found for today' });
    }

    res.status(200).json({ message: 'Checked out successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
