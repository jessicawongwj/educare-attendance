// TEMPORARY — secret-gated one-off fix, invoked only via the secret-gated
// branch in settings.js. Deleted once this task is done.
const { getPool, sql } = require('./_db');
const { ensureAuditTable, writeAudit } = require('./_audit');

// students.course/courseCode was wrong (all pointing at "Diploma of Community
// Services") even though the matching enrollments row already has the right
// course. trainer is untouched — it was already correct.
const COURSE_FIXES = [
  { sid: '14646430', course: 'Certificate IV in Ageing Support', courseCode: 'CHC43015', commenced: '2026-02-02', expectedEnd: '2026-09-14' },
  { sid: '14878653', course: 'Certificate IV in Ageing Support', courseCode: 'CHC43015', commenced: '2024-10-08', expectedEnd: '2026-05-24' },
  { sid: '14910544', course: 'Certificate III in Individual Support', courseCode: 'CHC33021', commenced: '2025-08-11', expectedEnd: '2026-03-22' },
  { sid: '14990463', course: 'Certificate IV in Ageing Support', courseCode: 'CHC43015', commenced: '2026-05-11', expectedEnd: '2026-12-20' },
  { sid: '15028888', course: 'Certificate IV in Ageing Support', courseCode: 'CHC43015', commenced: '2024-10-08', expectedEnd: '2026-08-23' },
  { sid: '15254784', course: 'Certificate IV in Ageing Support', courseCode: 'CHC43015', commenced: '2024-10-08', expectedEnd: '2026-09-20' },
  { sid: '15335091', course: 'Certificate IV in Ageing Support', courseCode: 'CHC43015', commenced: '2024-10-08', expectedEnd: '2026-11-29' },
  { sid: '15388406', course: 'Certificate IV in Ageing Support', courseCode: 'CHC43015', commenced: '2026-01-12', expectedEnd: '2026-08-23' },
  { sid: '15719841', course: 'Certificate III in Individual Support', courseCode: 'CHC33021', commenced: '2025-06-16', expectedEnd: '2026-01-25' },
  { sid: '15830449', course: 'Certificate III in Individual Support', courseCode: 'CHC33021', commenced: '2025-09-01', expectedEnd: '2026-04-12' },
  { sid: '15917624', course: 'Certificate IV in Ageing Support', courseCode: 'CHC43015', commenced: '2024-10-08', expectedEnd: '2026-12-13' },
];

// students.trainer was stale from an earlier fix (enrollments created under
// Vijeta, but students.trainer still said Toriqul).
const TRAINER_SYNC_FIXES = [
  { sid: '15077280', trainer: 'Vijeta Srivastava' },
  { sid: '15728873', trainer: 'Vijeta Srivastava' },
];

module.exports = async (req, res) => {
  const pool = await getPool();
  const step = req.query.mstep || 'inspect';

  try {
    if (step === 'apply') {
      await ensureAuditTable(pool);
      const changedBy = 'admin-confirmed-coursecode-audit-2026-08-07';
      const results = [];

      for (const f of COURSE_FIXES) {
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
          const before = await tx.request().input('id', sql.VarChar(20), f.sid).query('SELECT * FROM students WHERE id=@id');
          const after = await tx.request()
            .input('id', sql.VarChar(20), f.sid)
            .input('course', sql.NVarChar(300), f.course)
            .input('courseCode', sql.VarChar(20), f.courseCode)
            .input('commenced', sql.Date, f.commenced)
            .input('expectedEnd', sql.Date, f.expectedEnd)
            .query(`UPDATE students SET course=@course, courseCode=@courseCode, commenced=@commenced, expectedEnd=@expectedEnd
                    OUTPUT INSERTED.* WHERE id=@id`);
          await writeAudit(tx, { entityType: 'student', entityId: f.sid, action: 'update', changedBy, before: before.recordset[0], after: after.recordset[0] });
          await tx.commit();
          results.push({ id: f.sid, action: 'course corrected', ok: true });
        } catch (txErr) {
          try { await tx.rollback(); } catch (_) {}
          results.push({ id: f.sid, action: 'FAILED: ' + txErr.message, ok: false });
        }
      }

      for (const f of TRAINER_SYNC_FIXES) {
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
          const before = await tx.request().input('id', sql.VarChar(20), f.sid).query('SELECT * FROM students WHERE id=@id');
          const after = await tx.request()
            .input('id', sql.VarChar(20), f.sid)
            .input('trainer', sql.NVarChar(200), f.trainer)
            .query(`UPDATE students SET trainer=@trainer OUTPUT INSERTED.* WHERE id=@id`);
          await writeAudit(tx, { entityType: 'student', entityId: f.sid, action: 'update', changedBy, before: before.recordset[0], after: after.recordset[0] });
          await tx.commit();
          results.push({ id: f.sid, action: 'trainer synced', ok: true });
        } catch (txErr) {
          try { await tx.rollback(); } catch (_) {}
          results.push({ id: f.sid, action: 'FAILED: ' + txErr.message, ok: false });
        }
      }

      return res.status(200).json({ ok: true, results });
    }

    if (step === 'verify') {
      const ids = [...COURSE_FIXES.map(f => f.sid), ...TRAINER_SYNC_FIXES.map(f => f.sid)];
      const students = await pool.request().query(`SELECT id, name, trainer, course, courseCode, commenced, expectedEnd FROM students WHERE id IN ('${ids.join("','")}') ORDER BY name`);
      return res.status(200).json({ students: students.recordset });
    }

    return res.status(400).json({ error: 'Unknown step: ' + step });
  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
};
