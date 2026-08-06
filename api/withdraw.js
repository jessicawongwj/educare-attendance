const { getPool, sql } = require('./_db');
const { validateToken, isAdminUser, ensureAdminCache } = require('./_auth');
const { ensureAuditTable, writeAudit } = require('./_audit');

// reason: 'not-started' | 'completed' | 'not-my-student' | 'withdrawn'
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await validateToken(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const email = (user.mail || user.userPrincipalName || '').toLowerCase();

  const statusMap = {
    'not-started':    'not-started',
    'completed':      'completed',
    'not-my-student': 'inactive',
    'withdrawn':      'inactive',
  };

  const { studentId, course, reason } = req.body;
  if (!studentId || !reason) {
    return res.status(400).json({ error: 'Missing studentId or reason' });
  }
  const newStatus = statusMap[reason] || 'inactive';

  try {
    const pool = await getPool();
    await ensureAdminCache(pool);
    await ensureAuditTable(pool);
    if (!isAdminUser(email)) return res.status(403).json({ error: 'Admin only' });

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      if (course) {
        const before = await tx.request()
          .input('studentId', sql.VarChar(20), studentId)
          .input('course', sql.NVarChar(300), course)
          .query('SELECT * FROM enrollments WHERE studentId=@studentId AND course=@course');
        const upd = await tx.request()
          .input('studentId', sql.VarChar(20), studentId)
          .input('status',    sql.VarChar(50), newStatus)
          .input('course',    sql.NVarChar(300), course)
          .query('UPDATE enrollments SET status=@status OUTPUT INSERTED.* WHERE studentId=@studentId AND course=@course');
        for (let i = 0; i < before.recordset.length; i++) {
          await writeAudit(tx, {
            entityType: 'enrollment', entityId: before.recordset[i].id, action: 'update',
            changedBy: email, before: before.recordset[i], after: upd.recordset[i],
          });
        }
      } else {
        // No specific course — update all enrollments and mark student withdrawn
        const before = await tx.request()
          .input('studentId', sql.VarChar(20), studentId)
          .query('SELECT * FROM enrollments WHERE studentId=@studentId');
        const upd = await tx.request()
          .input('studentId', sql.VarChar(20), studentId)
          .input('status',    sql.VarChar(50), newStatus)
          .query('UPDATE enrollments SET status=@status OUTPUT INSERTED.* WHERE studentId=@studentId');
        for (let i = 0; i < before.recordset.length; i++) {
          await writeAudit(tx, {
            entityType: 'enrollment', entityId: before.recordset[i].id, action: 'update',
            changedBy: email, before: before.recordset[i], after: upd.recordset[i],
          });
        }
        if (reason === 'withdrawn') {
          const beforeStudent = await tx.request()
            .input('studentId', sql.VarChar(20), studentId)
            .query('SELECT * FROM students WHERE id=@studentId');
          const updStudent = await tx.request()
            .input('studentId', sql.VarChar(20), studentId)
            .query('UPDATE students SET withdrawn=1 OUTPUT INSERTED.* WHERE id=@studentId');
          if (beforeStudent.recordset[0]) {
            await writeAudit(tx, {
              entityType: 'student', entityId: studentId, action: 'update',
              changedBy: email, before: beforeStudent.recordset[0], after: updStudent.recordset[0],
            });
          }
        }
      }
      await tx.commit();
    } catch (txErr) {
      try { await tx.rollback(); } catch (_) {}
      throw txErr;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
};
