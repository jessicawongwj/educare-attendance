const { getPool, sql } = require('./_db');
const { validateToken, isAdminUser, ensureAdminCache } = require('./_auth');
const { trainersFromEmail } = require('./_trainers');
const { ensureAuditTable, writeAudit } = require('./_audit');

// notes was NVARCHAR(500) — widened once so appended history doesn't silently truncate.
async function ensureNotesWidened(pool) {
  await pool.request().query(`
    IF EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'attendance' AND COLUMN_NAME = 'notes' AND CHARACTER_MAXIMUM_LENGTH = 500
    )
    ALTER TABLE attendance ALTER COLUMN notes NVARCHAR(MAX) NULL
  `);
}

function appendNote(existing, addition) {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const line = `[${stamp}] ${addition}`;
  return existing && existing.trim() ? `${existing}\n${line}` : line;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await validateToken(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const email = (user.mail || user.userPrincipalName || '').toLowerCase();

  const { studentId, studentName, course, courseCode, trainer, campus,
          dates, status, reason, markedBy, note,
          checkinTime: rawCheckinTime, checkoutTime: rawCheckoutTime } = req.body;

  if (!studentId || !Array.isArray(dates) || !dates.length || !status) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const normStatus = (status || '').toLowerCase(); // normalise: 'Present'/'Absent'/'Voided' → lowercase
  const changedBy = markedBy || email;

  try {
    const pool = await getPool();
    await ensureAdminCache(pool);
    await ensureAuditTable(pool);
    await ensureNotesWidened(pool);
    const adminUser = isAdminUser(email);
    const trainerNames = adminUser ? [] : trainersFromEmail(email);

    if (!adminUser && trainerNames.length === 0) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Trainers can only save records attributed to themselves
    if (!adminUser && trainer && !trainerNames.includes(trainer)) {
      return res.status(403).json({ error: 'Forbidden: cannot save records for another trainer' });
    }

    const results = [];

    for (const date of dates) {
      const tx = new sql.Transaction(pool);
      await tx.begin();
      try {
        const existing = await tx.request()
          .input('sid', sql.VarChar(20), String(studentId))
          .input('date', sql.Date, date)
          .query('SELECT * FROM attendance WHERE studentId = @sid AND attendanceDate = @date');
        const existingRow = existing.recordset[0] || null;

        if (normStatus === 'absent' || normStatus === 'voided') {
          if (existingRow) {
            await tx.request()
              .input('sid', sql.VarChar(20), studentId)
              .input('date', sql.Date, date)
              .query('DELETE FROM attendance WHERE studentId = @sid AND attendanceDate = @date');
            await writeAudit(tx, {
              entityType: 'attendance', entityId: existingRow.id, action: 'delete',
              changedBy, before: existingRow, after: null,
            });
            results.push({ date, action: 'deleted' });
          } else {
            results.push({ date, action: 'no-record' });
          }
        } else if (normStatus === 'present') {
          const noteAddition = [
            reason && reason !== 'Manually marked present' && reason !== 'Manually marked absent' ? reason : 'Manually marked present',
            markedBy ? `by ${markedBy}` : '',
            note ? `— ${note}` : ''
          ].filter(Boolean).join(' ');

          if (existingRow) {
            const updCheckinDT = rawCheckinTime
              ? new Date(date + 'T' + rawCheckinTime + ':00.000+10:00')
              : null;
            const updCheckoutDT = rawCheckoutTime
              ? new Date(date + 'T' + rawCheckoutTime + ':00.000+10:00')
              : null;
            const mergedNotes = appendNote(existingRow.notes, noteAddition);
            const updReq = tx.request()
              .input('sid',   sql.VarChar(20),  studentId)
              .input('date',  sql.Date,          date)
              .input('notes', sql.NVarChar(sql.MAX), mergedNotes);
            let updSet = 'notes = @notes';
            if (updCheckinDT) { updReq.input('cin', sql.DateTime2, updCheckinDT); updSet += ', checkinTime = @cin'; }
            if (updCheckoutDT) { updReq.input('cout', sql.DateTime2, updCheckoutDT); updSet += ', checkoutTime = @cout'; }
            await updReq.query(`UPDATE attendance SET ${updSet} WHERE studentId = @sid AND attendanceDate = @date`);

            const after = await tx.request()
              .input('sid', sql.VarChar(20), studentId).input('date', sql.Date, date)
              .query('SELECT * FROM attendance WHERE studentId = @sid AND attendanceDate = @date');
            await writeAudit(tx, {
              entityType: 'attendance', entityId: existingRow.id, action: 'update',
              changedBy, before: existingRow, after: after.recordset[0],
            });
            results.push({ date, action: 'updated' });
          } else {
            const checkinDT = rawCheckinTime
              ? new Date(date + 'T' + rawCheckinTime + ':00.000+10:00')
              : new Date(); // no time supplied (shouldn't normally happen) — use the actual moment of saving
            const checkoutDT = rawCheckoutTime
              ? new Date(date + 'T' + rawCheckoutTime + ':00.000+10:00')
              : null;
            const insReq = tx.request()
              .input('sid',         sql.VarChar(20),   studentId)
              .input('sname',       sql.NVarChar(200),  studentName || '')
              .input('course',      sql.NVarChar(300),  course      || '')
              .input('courseCode',  sql.VarChar(20),    courseCode  || '')
              .input('trainer',     sql.NVarChar(200),  trainer     || '')
              .input('campus',      sql.NVarChar(100),  campus      || '')
              .input('checkinTime', sql.DateTime2,      checkinDT)
              .input('checkoutTime',sql.DateTime2,      checkoutDT)
              .input('date',        sql.Date,           date)
              .input('notes',       sql.NVarChar(sql.MAX), appendNote(null, noteAddition));
            const ins = await insReq.query(`
              INSERT INTO attendance
                (studentId, studentName, course, courseCode, trainer, campus,
                 checkinTime, checkoutTime, attendanceDate, notes)
              OUTPUT INSERTED.*
              VALUES
                (@sid, @sname, @course, @courseCode, @trainer, @campus,
                 @checkinTime, @checkoutTime, @date, @notes)
            `);
            await writeAudit(tx, {
              entityType: 'attendance', entityId: ins.recordset[0].id, action: 'insert',
              changedBy, before: null, after: ins.recordset[0],
            });
            results.push({ date, action: 'inserted' });
          }
        }

        await tx.commit();
      } catch (dateErr) {
        try { await tx.rollback(); } catch (_) {}
        throw dateErr;
      }
    }

    res.status(200).json({ ok: true, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
