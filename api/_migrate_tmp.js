// TEMPORARY — secret-gated one-off diagnostic/fix, invoked only via the
// secret-gated branch in settings.js. Deleted once this task is done.
const { getPool, sql } = require('./_db');
const { ensureAuditTable, writeAudit } = require('./_audit');

const TARGETS = ['14542405', '16054536']; // Wenlin huang, Buddhini...Kankanamalage

module.exports = async (req, res) => {
  const pool = await getPool();
  const step = req.query.mstep || 'inspect';

  try {
    if (step === 'inspect') {
      const students = await pool.request().query(`SELECT * FROM students WHERE id IN ('14542405','16054536')`);
      const enrollments = await pool.request().query(`SELECT * FROM enrollments WHERE studentId IN ('14542405','16054536')`);
      return res.status(200).json({ students: students.recordset, enrollments: enrollments.recordset });
    }

    if (step === 'withdraw') {
      await ensureAuditTable(pool);
      const changedBy = 'admin-confirmed-withdraw-2026-08-06';
      const results = [];

      for (const studentId of TARGETS) {
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
          const beforeEnr = await tx.request().input('sid', sql.VarChar(20), studentId)
            .query('SELECT * FROM enrollments WHERE studentId=@sid');
          const afterEnr = await tx.request().input('sid', sql.VarChar(20), studentId)
            .input('status', sql.VarChar(50), 'inactive')
            .query('UPDATE enrollments SET status=@status OUTPUT INSERTED.* WHERE studentId=@sid');
          for (let i = 0; i < beforeEnr.recordset.length; i++) {
            await writeAudit(tx, { entityType: 'enrollment', entityId: beforeEnr.recordset[i].id, action: 'update', changedBy, before: beforeEnr.recordset[i], after: afterEnr.recordset[i] });
          }

          const beforeStu = await tx.request().input('id', sql.VarChar(20), studentId).query('SELECT * FROM students WHERE id=@id');
          const afterStu = await tx.request().input('id', sql.VarChar(20), studentId)
            .query('UPDATE students SET withdrawn=1 OUTPUT INSERTED.* WHERE id=@id');
          await writeAudit(tx, { entityType: 'student', entityId: studentId, action: 'update', changedBy, before: beforeStu.recordset[0], after: afterStu.recordset[0] });

          await tx.commit();
          results.push({ id: studentId, name: beforeStu.recordset[0]?.name, action: 'withdrawn (students.withdrawn=1, enrollments.status=inactive)', enrollmentsUpdated: beforeEnr.recordset.length });
        } catch (txErr) {
          try { await tx.rollback(); } catch (_) {}
          throw txErr;
        }
      }

      return res.status(200).json({ ok: true, results });
    }

    if (step === 'verify') {
      const students = await pool.request().query(`SELECT * FROM students WHERE id IN ('14542405','16054536')`);
      const enrollments = await pool.request().query(`SELECT * FROM enrollments WHERE studentId IN ('14542405','16054536')`);
      const audit = await pool.request().query(`SELECT TOP 10 * FROM audit_log WHERE changedBy = 'admin-confirmed-withdraw-2026-08-06' ORDER BY id DESC`);
      return res.status(200).json({ students: students.recordset, enrollments: enrollments.recordset, audit: audit.recordset });
    }

    return res.status(400).json({ error: 'Unknown step: ' + step });
  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
};
