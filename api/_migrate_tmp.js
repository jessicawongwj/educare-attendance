// TEMPORARY — secret-gated one-off fix, invoked only via the secret-gated
// branch in settings.js. Deleted once this task is done.
const { getPool, sql } = require('./_db');
const { ensureAuditTable, writeAudit } = require('./_audit');

// Existing students missing one specific course's enrollments row.
// David Lausi (15263857) and Maria Fernanda Usaquen Chalar (14896733) removed
// from this batch — both already have an enrollments row under the SAME course
// name but an older courseCode (CHC52021 vs CHC52025, CHC50121 vs CHC50125).
// That's a training-package-code question, not a missing enrollment — flagged
// separately rather than inserted (would violate UQ_enrollments_student_course
// on course name anyway).
const MISSING_ENROLLMENTS = [
  { sid: '16069969', course: 'Certificate IV in Ageing Support', courseCode: 'CHC43015', trainer: 'Vijeta Srivastava', commenced: '2026-07-13', expectedEnd: '2027-01-17' },
  { sid: '15728873', course: 'Certificate IV in Ageing Support', courseCode: 'CHC43015', trainer: 'Vijeta Srivastava', commenced: '2026-03-02', expectedEnd: '2026-10-11' },
  { sid: '15077280', course: 'Certificate IV in Ageing Support', courseCode: 'CHC43015', trainer: 'Vijeta Srivastava', commenced: '2026-04-13', expectedEnd: '2026-11-22' },
  { sid: '16074389', course: 'Certificate IV in Ageing Support', courseCode: 'CHC43015', trainer: 'Sherwin Thiarhia', commenced: '2024-10-08', expectedEnd: '2027-01-03' },
  { sid: '16002062', course: 'Certificate IV in Ageing Support', courseCode: 'CHC43015', trainer: 'Sherwin Thiarhia', commenced: '2026-08-03', expectedEnd: '2027-03-14' },
];

module.exports = async (req, res) => {
  const pool = await getPool();
  const step = req.query.mstep || 'inspect';

  try {
    if (step === 'apply-remaining') {
      // Wen-Lin Huang (new student) and Paran Kafle already succeeded in the
      // first pass — this step only handles the remaining 4 clean enrollments.
      await ensureAuditTable(pool);
      const changedBy = 'admin-confirmed-warehoused-1433-2026-08-06';
      const results = [];

      for (const m of MISSING_ENROLLMENTS) {
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
          const insE = await tx.request()
            .input('sid', sql.VarChar(20), m.sid)
            .input('course', sql.NVarChar(300), m.course)
            .input('courseCode', sql.VarChar(20), m.courseCode)
            .input('trainer', sql.NVarChar(200), m.trainer)
            .input('commenced', sql.Date, m.commenced)
            .input('expectedEnd', sql.Date, m.expectedEnd)
            .query(`INSERT INTO enrollments (studentId,course,courseCode,trainer,commenced,expectedEnd,status,isPrimary)
                    OUTPUT INSERTED.* VALUES (@sid,@course,@courseCode,@trainer,@commenced,@expectedEnd,'active',1)`);
          await writeAudit(tx, { entityType: 'enrollment', entityId: insE.recordset[0].id, action: 'insert', changedBy, before: null, after: insE.recordset[0] });
          await tx.commit();
          results.push({ id: m.sid, course: m.courseCode, action: 'enrollment row added', ok: true });
        } catch (txErr) {
          try { await tx.rollback(); } catch (_) {}
          results.push({ id: m.sid, course: m.courseCode, action: 'FAILED: ' + txErr.message, ok: false });
          // Don't rethrow — keep going so one bad row doesn't block the rest.
        }
      }

      return res.status(200).json({ ok: true, results });
    }

    if (step === 'verify') {
      const ids = ['15999383','16069969','15263857','15728873','15077280','14896733','16074389','16002062'];
      const students = await pool.request().query(`SELECT * FROM students WHERE id IN ('${ids.join("','")}')`);
      const enrollments = await pool.request().query(`SELECT * FROM enrollments WHERE studentId IN ('${ids.join("','")}')`);
      const audit = await pool.request().query(`SELECT COUNT(*) AS cnt FROM audit_log WHERE changedBy = 'admin-confirmed-warehoused-1433-2026-08-06'`);
      return res.status(200).json({ students: students.recordset, enrollments: enrollments.recordset, auditCount: audit.recordset[0].cnt });
    }

    return res.status(400).json({ error: 'Unknown step: ' + step });
  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
};
