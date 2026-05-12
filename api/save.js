const { getPool, sql } = require('./_db');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { studentId, studentName, course, courseCode, trainer, campus,
          dates, status, reason, markedBy, note } = req.body;

  if (!studentId || !Array.isArray(dates) || !dates.length || !status) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const pool = await getPool();
    const results = [];

    for (const date of dates) {
      const existing = await pool.request()
        .input('sid', sql.VarChar(20), studentId)
        .input('date', sql.Date, date)
        .query('SELECT id FROM attendance WHERE studentId = @sid AND attendanceDate = @date');

      if (status === 'absent') {
        if (existing.recordset.length > 0) {
          await pool.request()
            .input('sid', sql.VarChar(20), studentId)
            .input('date', sql.Date, date)
            .query('DELETE FROM attendance WHERE studentId = @sid AND attendanceDate = @date');
          results.push({ date, action: 'deleted' });
        } else {
          results.push({ date, action: 'no-record' });
        }
      } else if (status === 'present') {
        const noteText = ['Manually marked present',
          markedBy ? `by ${markedBy}` : '',
          note ? `— ${note}` : ''
        ].filter(Boolean).join(' ');

        if (existing.recordset.length > 0) {
          await pool.request()
            .input('sid', sql.VarChar(20), studentId)
            .input('date', sql.Date, date)
            .input('notes', sql.NVarChar(500), noteText)
            .query('UPDATE attendance SET notes = @notes WHERE studentId = @sid AND attendanceDate = @date');
          results.push({ date, action: 'updated' });
        } else {
          // Use noon AEST (UTC+10) on the given date as a neutral manual timestamp
          const checkinTime = new Date(date + 'T02:00:00.000Z');
          await pool.request()
            .input('sid',        sql.VarChar(20),   studentId)
            .input('sname',      sql.NVarChar(200),  studentName || '')
            .input('course',     sql.NVarChar(300),  course      || '')
            .input('courseCode', sql.VarChar(20),    courseCode  || '')
            .input('trainer',    sql.NVarChar(200),  trainer     || '')
            .input('campus',     sql.NVarChar(100),  campus      || '')
            .input('checkinTime', sql.DateTime2,     checkinTime)
            .input('date',        sql.Date,           date)
            .input('notes',       sql.NVarChar(500),  noteText)
            .query(`
              INSERT INTO attendance
                (studentId, studentName, course, courseCode, trainer, campus,
                 checkinTime, attendanceDate, notes)
              VALUES
                (@sid, @sname, @course, @courseCode, @trainer, @campus,
                 @checkinTime, @date, @notes)
            `);
          results.push({ date, action: 'inserted' });
        }
      }
    }

    res.status(200).json({ ok: true, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
