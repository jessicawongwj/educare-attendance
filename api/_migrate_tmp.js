// TEMPORARY — secret-gated one-off diagnostic/fix, invoked only via the
// secret-gated branch in settings.js. Deleted once this task is done.
const { getPool, sql } = require('./_db');
const { ensureAuditTable, writeAudit } = require('./_audit');

module.exports = async (req, res) => {
  const pool = await getPool();
  const step = req.query.mstep || 'inspect';

  try {
    if (step === 'inspect') {
      const students = await pool.request().query(`
        SELECT * FROM students WHERE id IN ('14542405','16054536','16030239','15982780')
      `);
      const enrollments = await pool.request().query(`
        SELECT * FROM enrollments WHERE studentId IN ('14542405','16054536','16030239','15982780')
      `);
      return res.status(200).json({ students: students.recordset, enrollments: enrollments.recordset });
    }

    if (step === 'apply') {
      await ensureAuditTable(pool);
      const changedBy = 'admin-confirmed-classenrolments-xlsx-2026-08-06';
      const results = [];

      const tx = new sql.Transaction(pool);
      await tx.begin();
      try {
        // #1 Wenlin huang — no enrollments row exists; add commenced+trainer to
        // students, and create the missing enrollments row (they were only ever
        // a QR self-check-in, never formally enrolled).
        {
          const before = await tx.request().input('id', sql.VarChar(20), '14542405')
            .query('SELECT * FROM students WHERE id=@id');
          const after = await tx.request()
            .input('id', sql.VarChar(20), '14542405')
            .input('commenced', sql.Date, '2026-08-03')
            .input('trainer', sql.NVarChar(200), 'Zeyun Ma')
            .query(`UPDATE students SET commenced=@commenced, trainer=@trainer OUTPUT INSERTED.* WHERE id=@id`);
          await writeAudit(tx, { entityType: 'student', entityId: '14542405', action: 'update', changedBy, before: before.recordset[0], after: after.recordset[0] });

          const ins = await tx.request()
            .input('sid', sql.VarChar(20), '14542405')
            .input('course', sql.NVarChar(300), 'Certificate III in Individual Support')
            .input('courseCode', sql.VarChar(20), 'CHC33021')
            .input('trainer', sql.NVarChar(200), 'Zeyun Ma')
            .input('commenced', sql.Date, '2026-08-03')
            .input('expectedEnd', sql.Date, '2027-03-14')
            .input('status', sql.VarChar(20), 'active')
            .query(`INSERT INTO enrollments (studentId,course,courseCode,trainer,commenced,expectedEnd,status,isPrimary)
                    OUTPUT INSERTED.* VALUES (@sid,@course,@courseCode,@trainer,@commenced,@expectedEnd,@status,1)`);
          await writeAudit(tx, { entityType: 'enrollment', entityId: ins.recordset[0].id, action: 'insert', changedBy, before: null, after: ins.recordset[0] });
          results.push({ id: '14542405', name: 'Wenlin huang', action: 'commenced+trainer updated, enrollments row created' });
        }

        // #2 Buddhini ... Kankanamalage — has enrollments row id 388
        {
          const beforeS = await tx.request().input('id', sql.VarChar(20), '16054536').query('SELECT * FROM students WHERE id=@id');
          const afterS = await tx.request()
            .input('id', sql.VarChar(20), '16054536')
            .input('commenced', sql.Date, '2024-10-09')
            .input('trainer', sql.NVarChar(200), 'Zeyun Ma')
            .query(`UPDATE students SET commenced=@commenced, trainer=@trainer OUTPUT INSERTED.* WHERE id=@id`);
          await writeAudit(tx, { entityType: 'student', entityId: '16054536', action: 'update', changedBy, before: beforeS.recordset[0], after: afterS.recordset[0] });

          const beforeE = await tx.request().input('id', sql.Int, 388).query('SELECT * FROM enrollments WHERE id=@id');
          const afterE = await tx.request()
            .input('id', sql.Int, 388)
            .input('commenced', sql.Date, '2024-10-09')
            .input('trainer', sql.NVarChar(200), 'Zeyun Ma')
            .query(`UPDATE enrollments SET commenced=@commenced, trainer=@trainer OUTPUT INSERTED.* WHERE id=@id`);
          await writeAudit(tx, { entityType: 'enrollment', entityId: 388, action: 'update', changedBy, before: beforeE.recordset[0], after: afterE.recordset[0] });
          results.push({ id: '16054536', name: 'Buddhini...Kankanamalage', action: 'commenced+trainer updated on students + enrollments' });
        }

        // #4 Sangay Tshoki Pem — enrollments already correct, students.commenced is null
        {
          const before = await tx.request().input('id', sql.VarChar(20), '16030239').query('SELECT * FROM students WHERE id=@id');
          const after = await tx.request()
            .input('id', sql.VarChar(20), '16030239')
            .input('commenced', sql.Date, '2026-06-01')
            .query(`UPDATE students SET commenced=@commenced OUTPUT INSERTED.* WHERE id=@id`);
          await writeAudit(tx, { entityType: 'student', entityId: '16030239', action: 'update', changedBy, before: before.recordset[0], after: after.recordset[0] });
          results.push({ id: '16030239', name: 'Sangay Tshoki Pem', action: 'commenced date added' });
        }

        // #5 Paula Andrea Rodriguez Romero — enrollments already active, students.status stuck
        {
          const before = await tx.request().input('id', sql.VarChar(20), '15982780').query('SELECT * FROM students WHERE id=@id');
          const after = await tx.request()
            .input('id', sql.VarChar(20), '15982780')
            .input('status', sql.VarChar(20), 'active')
            .query(`UPDATE students SET status=@status OUTPUT INSERTED.* WHERE id=@id`);
          await writeAudit(tx, { entityType: 'student', entityId: '15982780', action: 'update', changedBy, before: before.recordset[0], after: after.recordset[0] });
          results.push({ id: '15982780', name: 'Paula Andrea Rodriguez Romero', action: 'status flipped not-started -> active' });
        }

        await tx.commit();
      } catch (txErr) {
        try { await tx.rollback(); } catch (_) {}
        throw txErr;
      }

      return res.status(200).json({ ok: true, results });
    }

    if (step === 'verify') {
      const students = await pool.request().query(`
        SELECT * FROM students WHERE id IN ('14542405','16054536','16030239','15982780')
      `);
      const enrollments = await pool.request().query(`
        SELECT * FROM enrollments WHERE studentId IN ('14542405','16054536','16030239','15982780')
      `);
      const audit = await pool.request().query(`
        SELECT TOP 10 * FROM audit_log WHERE changedBy = 'admin-confirmed-classenrolments-xlsx-2026-08-06' ORDER BY id DESC
      `);
      return res.status(200).json({ students: students.recordset, enrollments: enrollments.recordset, auditCount: audit.recordset.length, audit: audit.recordset });
    }

    return res.status(400).json({ error: 'Unknown step: ' + step });
  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
};
