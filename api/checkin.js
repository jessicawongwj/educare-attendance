const { getPool, sql } = require('./_db');

// "CHC33021 Certificate III in Individual Support" → { code: "CHC33021", name: "Certificate III in Individual Support" }
function parseCourse(raw) {
  const m = (raw || '').trim().match(/^([A-Z]{3}\d+)\s+(.+)$/);
  return m ? { code: m[1], name: m[2] } : { code: '', name: (raw || '').trim() };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { StudentID, Name, Trainer, Course, Campus, CheckInTime, Lat, Lng } = req.body;
  if (!StudentID || !Name || !Trainer || !Course || !Campus) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const { code: courseCode, name: courseName } = parseCourse(Course);

  try {
    const pool = await getPool();
    const attendanceDate = new Date(CheckInTime || Date.now())
      .toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' });

    // Ensure student exists in students table (FK protection for new/unlisted students)
    const studentCheck = await pool.request()
      .input('studentId', sql.VarChar(20), StudentID)
      .query('SELECT id FROM students WHERE id = @studentId');

    if (studentCheck.recordset.length === 0) {
      await pool.request()
        .input('studentId',   sql.VarChar(20),   StudentID)
        .input('name',        sql.NVarChar(200),  Name)
        .input('course',      sql.NVarChar(300),  courseName)
        .input('courseCode',  sql.VarChar(20),    courseCode)
        .input('trainer',     sql.NVarChar(200),  Trainer)
        .input('campus',      sql.NVarChar(100),  Campus)
        .query(`
          INSERT INTO students (id, name, course, courseCode, trainer, campus, status, withdrawn)
          VALUES (@studentId, @name, @course, @courseCode, @trainer, @campus, 'active', 0)
        `);
    }

    // Check for duplicate check-in today
    const existing = await pool.request()
      .input('studentId',      sql.VarChar(20), StudentID)
      .input('attendanceDate', sql.Date,        attendanceDate)
      .query('SELECT id FROM attendance WHERE studentId = @studentId AND attendanceDate = @attendanceDate');

    if (existing.recordset.length > 0) {
      return res.status(409).json({ message: 'Already checked in today' });
    }

    await pool.request()
      .input('studentId',      sql.VarChar(20),   StudentID)
      .input('studentName',    sql.NVarChar(200),  Name)
      .input('course',         sql.NVarChar(300),  courseName)
      .input('courseCode',     sql.VarChar(20),    courseCode)
      .input('trainer',        sql.NVarChar(200),  Trainer)
      .input('campus',         sql.NVarChar(100),  Campus)
      .input('checkinTime',    sql.DateTime2,      new Date(CheckInTime || Date.now()))
      .input('checkinLat',     sql.Float,          Lat || null)
      .input('checkinLng',     sql.Float,          Lng || null)
      .input('attendanceDate', sql.Date,           attendanceDate)
      .query(`
        INSERT INTO attendance
          (studentId, studentName, course, courseCode, trainer, campus, checkinTime, checkinLat, checkinLng, attendanceDate)
        VALUES
          (@studentId, @studentName, @course, @courseCode, @trainer, @campus, @checkinTime, @checkinLat, @checkinLng, @attendanceDate)
      `);

    res.status(200).json({ message: 'Check-in recorded' });
  } catch (err) {
    // Unique constraint violation — student already checked in (race condition)
    if (err.number === 2627 || err.number === 2601) {
      return res.status(409).json({ message: 'Already checked in today' });
    }
    console.error(err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
};
