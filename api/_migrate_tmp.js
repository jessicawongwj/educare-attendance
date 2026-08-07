const { getPool, sql } = require('./_db');
const { ensureAuditTable, writeAudit } = require('./_audit');

const FIXES = [
  { sid: '15804793', course: 'Certificate III in Early Childhood Education and Care', courseCode: 'CHC30121', commenced: '2026-05-18', expectedEnd: '2026-08-23' },
  { sid: '15982780', course: 'Certificate III in Early Childhood Education and Care', courseCode: 'CHC30121', commenced: '2026-05-11', expectedEnd: '2026-12-06' },
];

module.exports = async (req, res) => {
  const pool = await getPool();
  const step = req.query.mstep || 'apply';
  try {
    if (step === 'apply') {
      await ensureAuditTable(pool);
      const changedBy = 'admin-confirmed-myclass-pill-audit-2026-08-07';
      const results = [];
      for (const f of FIXES) {
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
            .query(`UPDATE students SET course=@course, courseCode=@courseCode, commenced=@commenced, expectedEnd=@expectedEnd OUTPUT INSERTED.* WHERE id=@id`);
          await writeAudit(tx, { entityType: 'student', entityId: f.sid, action: 'update', changedBy, before: before.recordset[0], after: after.recordset[0] });
          await tx.commit();
          results.push({ id: f.sid, ok: true });
        } catch (e) {
          try { await tx.rollback(); } catch(_) {}
          results.push({ id: f.sid, ok: false, error: e.message });
        }
      }
      return res.status(200).json({ ok: true, results });
    }
    if (step === 'verify') {
      const s = await pool.request().query(`SELECT id, name, course, courseCode, commenced, expectedEnd FROM students WHERE id IN ('15804793','15982780')`);
      return res.status(200).json({ students: s.recordset });
    }
    return res.status(400).json({ error: 'unknown step' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
