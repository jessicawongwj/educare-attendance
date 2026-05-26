const { getPool, sql } = require('./_db');
const { validateToken, isAdminUser } = require('./_auth');
const { trainersFromEmail } = require('./_trainers');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await validateToken(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const email = (user.mail || user.userPrincipalName || '').toLowerCase();
  const adminUser = isAdminUser(email);
  const trainerNames = adminUser ? [] : trainersFromEmail(email);

  // Must be admin or a known trainer
  if (!adminUser && trainerNames.length === 0) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { studentId, studentName, course, courseCode, trainer, campus,
          dates, status, reason, markedBy, note,
          checkinTime: rawCheckinTime, checkoutTime: rawCheckoutTime } = req.body;

  if (!studentId || !Array.isArray(dates) || !dates.length || !status) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Trainers can only save records attributed to themselves
  if (!adminUser && trainer && !trainerNames.includes(trainer)) {
    return res.status(403).json({ error: 'Forbidden: cannot save records for another trainer' });
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
          const updCheckinDT = rawCheckinTime
            ? new Date(date + 'T' + rawCheckinTime + ':00.000+10:00')
            : null;
          const updCheckoutDT = rawCheckoutTime
            ? new Date(date + 'T' + rawCheckoutTime + ':00.000+10:00')
            : null;
          const updReq = pool.request()
            .input('sid',   sql.VarChar(20),  studentId)
            .input('date',  sql.Date,          date)
            .input('notes', sql.NVarChar(500), noteText);
          let updSet = 'notes = @notes';
          if (updCheckinDT) { updReq.input('cin', sql.DateTime2, updCheckinDT); updSet += ', checkinTime = @cin'; }
          if (updCheckoutDT) { updReq.input('cout', sql.DateTime2, updCheckoutDT); updSet += ', checkoutTime = @cout'; }
          await updReq.query(`UPDATE attendance SET ${updSet} WHERE studentId = @sid AND attendanceDate = @date`);
          results.push({ date, action: 'updated' });
        } else {
          // Use provided time (AEST) or default to noon AEST (02:00 UTC)
          const checkinDT = rawCheckinTime
            ? new Date(date + 'T' + rawCheckinTime + ':00.000+10:00')
            : new Date(date + 'T02:00:00.000Z');
          const checkoutDT = rawCheckoutTime
            ? new Date(date + 'T' + rawCheckoutTime + ':00.000+10:00')
            : null;
          await pool.request()
            .input('sid',         sql.VarChar(20),   studentId)
            .input('sname',       sql.NVarChar(200),  studentName || '')
            .input('course',      sql.NVarChar(300),  course      || '')
            .input('courseCode',  sql.VarChar(20),    courseCode  || '')
            .input('trainer',     sql.NVarChar(200),  trainer     || '')
            .input('campus',      sql.NVarChar(100),  campus      || '')
            .input('checkinTime', sql.DateTime2,      checkinDT)
            .input('checkoutTime',sql.DateTime2,      checkoutDT)
            .input('date',        sql.Date,           date)
            .input('notes',       sql.NVarChar(500),  noteText)
            .query(`
              INSERT INTO attendance
                (studentId, studentName, course, courseCode, trainer, campus,
                 checkinTime, checkoutTime, attendanceDate, notes)
              VALUES
                (@sid, @sname, @course, @courseCode, @trainer, @campus,
                 @checkinTime, @checkoutTime, @date, @notes)
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
