// TEMPORARY — secret-gated one-off fix, invoked only via the secret-gated
// branch in settings.js. Deleted once this task is done.
const { getPool, sql } = require('./_db');
const { ensureAuditTable, writeAudit } = require('./_audit');

// Confirmed by admin: both are the same enrollment under an updated training
// package code, with corrected start/end dates from the fresh export.
const FIXES = [
  {
    sid: '15263857', name: 'David Lausi',
    courseCode: 'CHC52025', commenced: '2026-07-20', expectedEnd: '2027-10-24',
    flipStatusActive: true, // students.status was 'not-started'; commenced date is now in the past
  },
  {
    sid: '14896733', name: 'Maria Fernanda Usaquen Chalar',
    courseCode: 'CHC50125', commenced: '2026-07-20', expectedEnd: '2026-08-17',
    flipStatusActive: false, // students.status already 'active'
  },
];

module.exports = async (req, res) => {
  const pool = await getPool();
  const step = req.query.mstep || 'inspect';

  try {
    if (step === 'apply') {
      await ensureAuditTable(pool);
      const changedBy = 'admin-confirmed-warehoused-1433-2026-08-06';
      const results = [];

      for (const f of FIXES) {
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
          const beforeEnr = await tx.request()
            .input('sid', sql.VarChar(20), f.sid)
            .query(`SELECT * FROM enrollments WHERE studentId=@sid`);
          const targetEnr = beforeEnr.recordset[0];

          const afterEnr = await tx.request()
            .input('id', sql.Int, targetEnr.id)
            .input('courseCode', sql.VarChar(20), f.courseCode)
            .input('commenced', sql.Date, f.commenced)
            .input('expectedEnd', sql.Date, f.expectedEnd)
            .query(`UPDATE enrollments SET courseCode=@courseCode, commenced=@commenced, expectedEnd=@expectedEnd
                    OUTPUT INSERTED.* WHERE id=@id`);
          await writeAudit(tx, { entityType: 'enrollment', entityId: targetEnr.id, action: 'update', changedBy, before: targetEnr, after: afterEnr.recordset[0] });

          const beforeStu = await tx.request().input('id', sql.VarChar(20), f.sid).query('SELECT * FROM students WHERE id=@id');
          const statusSet = f.flipStatusActive ? `, status='active'` : '';
          const afterStu = await tx.request()
            .input('id', sql.VarChar(20), f.sid)
            .input('courseCode', sql.VarChar(20), f.courseCode)
            .input('commenced', sql.Date, f.commenced)
            .input('expectedEnd', sql.Date, f.expectedEnd)
            .query(`UPDATE students SET courseCode=@courseCode, commenced=@commenced, expectedEnd=@expectedEnd${statusSet}
                    OUTPUT INSERTED.* WHERE id=@id`);
          await writeAudit(tx, { entityType: 'student', entityId: f.sid, action: 'update', changedBy, before: beforeStu.recordset[0], after: afterStu.recordset[0] });

          await tx.commit();
          results.push({ id: f.sid, name: f.name, action: 'enrollment + student updated', ok: true });
        } catch (txErr) {
          try { await tx.rollback(); } catch (_) {}
          results.push({ id: f.sid, name: f.name, action: 'FAILED: ' + txErr.message, ok: false });
        }
      }

      return res.status(200).json({ ok: true, results });
    }

    if (step === 'verify') {
      const ids = ['15263857', '14896733'];
      const students = await pool.request().query(`SELECT * FROM students WHERE id IN ('${ids.join("','")}')`);
      const enrollments = await pool.request().query(`SELECT * FROM enrollments WHERE studentId IN ('${ids.join("','")}')`);
      return res.status(200).json({ students: students.recordset, enrollments: enrollments.recordset });
    }

    return res.status(400).json({ error: 'Unknown step: ' + step });
  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
};
