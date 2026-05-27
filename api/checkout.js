const { getPool, sql } = require('./_db');
const { validateToken } = require('./_auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await validateToken(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { StudentID, date: rawDate, checkoutTime: rawCheckoutTime } = req.body;
  if (!StudentID) return res.status(400).json({ error: 'Missing StudentID' });

  try {
    const pool = await getPool();
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' });
    const targetDate = rawDate || today;
    const checkoutTime = rawCheckoutTime
      ? new Date(targetDate + 'T' + rawCheckoutTime + ':00.000+10:00')
      : new Date();

    const result = await pool.request()
      .input('studentId',     sql.VarChar(20), StudentID)
      .input('attendanceDate', sql.Date,        targetDate)
      .input('checkoutTime',  sql.DateTime2,   checkoutTime)
      .query(`
        UPDATE attendance
        SET checkoutTime = @checkoutTime
        WHERE studentId = @studentId
          AND attendanceDate = @attendanceDate
          AND checkoutTime IS NULL
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'No open check-in found for that date' });
    }

    res.status(200).json({ message: 'Checked out successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
