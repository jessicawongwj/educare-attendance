const { getPool, sql } = require('./_db');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { StudentID, Name, Trainer, Course, Campus, CheckInTime, Lat, Lng } = req.body;
  if (!StudentID || !Name || !Trainer || !Course || !Campus) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const pool = await getPool();
    const attendanceDate = new Date(CheckInTime || Date.now())
      .toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' }); // YYYY-MM-DD

    // Check for duplicate check-in today
    const existing = await pool.request()
      .input('studentId',     sql.VarChar(20), StudentID)
      .input('attendanceDate', sql.Date,        attendanceDate)
      .query(`SELECT id FROM attendance WHERE studentId = @studentId AND attendanceDate = @attendanceDate`);

    if (existing.recordset.length > 0) {
      return res.status(409).json({ message: 'Already checked in today' });
    }

    await pool.request()
      .input('studentId',     sql.VarChar(20),   StudentID)
      .input('studentName',   sql.NVarChar(200),  Name)
      .input('course',        sql.NVarChar(300),  Course)
      .input('trainer',       sql.NVarChar(200),  Trainer)
      .input('campus',        sql.NVarChar(100),  Campus)
      .input('checkinTime',   sql.DateTime2,      new Date(CheckInTime || Date.now()))
      .input('checkinLat',    sql.Float,          Lat || null)
      .input('checkinLng',    sql.Float,          Lng || null)
      .input('attendanceDate', sql.Date,          attendanceDate)
      .query(`
        INSERT INTO attendance
          (studentId, studentName, course, trainer, campus, checkinTime, checkinLat, checkinLng, attendanceDate)
        VALUES
          (@studentId, @studentName, @course, @trainer, @campus, @checkinTime, @checkinLat, @checkinLng, @attendanceDate)
      `);

    res.status(200).json({ message: 'Check-in recorded' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
