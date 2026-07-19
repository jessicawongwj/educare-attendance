const { getPool, sql } = require('./_db');
const { validateToken, isAdminUser, ensureAdminCache } = require('./_auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await validateToken(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const email = (user.mail || user.userPrincipalName || '').toLowerCase();
  const pool = await getPool();
  await ensureAdminCache(pool);
  if (!isAdminUser(email)) return res.status(403).json({ error: 'Admin only' });

  try {

    // ── Migrate trainer across enrollments + attendance ────────────────────────
    if (req.query.type === 'migrate') {
      const { from, to, courseCode } = req.body || {};
      if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });
      const hasCode = !!courseCode;
      const enrReq = pool.request()
        .input('from', sql.NVarChar(200), from)
        .input('to',   sql.NVarChar(200), to);
      if (hasCode) enrReq.input('code', sql.VarChar(20), courseCode);
      const r = await enrReq.query(
        `UPDATE enrollments SET trainer=@to WHERE trainer=@from${hasCode ? ' AND courseCode=@code' : ''};
         SELECT @@ROWCOUNT AS cnt`
      );
      const attReq = pool.request()
        .input('from', sql.NVarChar(200), from)
        .input('to',   sql.NVarChar(200), to);
      if (hasCode) attReq.input('code', sql.VarChar(20), courseCode);
      await attReq.query(
        `UPDATE attendance SET trainer=@to WHERE trainer=@from${hasCode ? ' AND courseCode=@code' : ''}`
      );
      return res.status(200).json({ ok: true, count: r.recordset[0]?.cnt || 0 });
    }

    // ── Bulk roster upsert ─────────────────────────────────────────────────────
    if (req.query.type === 'bulk') {
      const { roster } = req.body || {};
      if (!Array.isArray(roster) || !roster.length) return res.status(400).json({ error: 'Missing roster' });
      let updated = 0;
      for (const s of roster) {
        if (!s.id || !s.course) continue;
        const exists = await pool.request()
          .input('id', sql.VarChar(20), String(s.id))
          .query('SELECT id FROM students WHERE id=@id');
        if (!exists.recordset.length) {
          await pool.request()
            .input('id',     sql.VarChar(20),  String(s.id))
            .input('name',   sql.NVarChar(200), s.name || '')
            .input('campus', sql.NVarChar(100), s.campus || '')
            .query(`INSERT INTO students (id, name, campus, withdrawn) VALUES (@id, @name, @campus, 0)`);
        }
        const enr = await pool.request()
          .input('sid',    sql.VarChar(20),  String(s.id))
          .input('course', sql.NVarChar(300), s.course)
          .query('SELECT id FROM enrollments WHERE studentId=@sid AND course=@course');
        if (enr.recordset.length) {
          await pool.request()
            .input('sid',         sql.VarChar(20),  String(s.id))
            .input('course',      sql.NVarChar(300), s.course)
            .input('trainer',     sql.NVarChar(200), s.trainer || '')
            .input('campus',      sql.NVarChar(100), s.campus || '')
            .input('status',      sql.VarChar(20),   s.status || 'active')
            .input('commenced',   sql.Date,           s.commenced ? new Date(s.commenced) : new Date())
            .input('expectedEnd', sql.Date,           s.expectedEnd ? new Date(s.expectedEnd) : null)
            .query(`UPDATE enrollments SET trainer=@trainer, status=@status, commenced=@commenced, expectedEnd=@expectedEnd
                    WHERE studentId=@sid AND course=@course`);
        } else {
          await pool.request()
            .input('sid',         sql.VarChar(20),  String(s.id))
            .input('name',        sql.NVarChar(200), s.name || '')
            .input('course',      sql.NVarChar(300), s.course)
            .input('courseCode',  sql.VarChar(20),   s.courseCode || '')
            .input('trainer',     sql.NVarChar(200), s.trainer || '')
            .input('campus',      sql.NVarChar(100), s.campus || '')
            .input('status',      sql.VarChar(20),   s.status || 'active')
            .input('commenced',   sql.Date,           s.commenced ? new Date(s.commenced) : new Date())
            .input('expectedEnd', sql.Date,           s.expectedEnd ? new Date(s.expectedEnd) : null)
            .query(`INSERT INTO enrollments (studentId,studentName,course,courseCode,trainer,commenced,expectedEnd,status,isPrimary)
                    VALUES (@sid,@name,@course,@courseCode,@trainer,@commenced,@expectedEnd,@status,1)`);
        }
        updated++;
      }
      return res.status(200).json({ ok: true, updated });
    }

    // ── Single student upsert (default) ────────────────────────────────────────
    const { studentId, name, course, courseCode, trainer, campus, commenced, expectedEnd, status } = req.body;
    if (!studentId || !name || !course) return res.status(400).json({ error: 'Missing required fields' });

    const studentCheck = await pool.request()
      .input('id', sql.VarChar(20), studentId)
      .query('SELECT id FROM students WHERE id = @id');
    if (studentCheck.recordset.length === 0) {
      await pool.request()
        .input('id',      sql.VarChar(20),  studentId)
        .input('name',    sql.NVarChar(200), name)
        .input('campus',  sql.NVarChar(100), campus || '')
        .query(`INSERT INTO students (id, name, campus, withdrawn) VALUES (@id, @name, @campus, 0)`);
    }

    const enrollCheck = await pool.request()
      .input('studentId', sql.VarChar(20),  studentId)
      .input('course',    sql.NVarChar(300), course)
      .query('SELECT id FROM enrollments WHERE studentId = @studentId AND course = @course');
    if (enrollCheck.recordset.length > 0) {
      await pool.request()
        .input('studentId',   sql.VarChar(20),  studentId)
        .input('course',      sql.NVarChar(300), course)
        .input('trainer',     sql.NVarChar(200), trainer || '')
        .input('commenced',   sql.Date,           commenced || new Date())
        .input('expectedEnd', sql.Date,           expectedEnd || null)
        .input('status',      sql.VarChar(20),    status || 'active')
        .query(`UPDATE enrollments SET trainer=@trainer, commenced=@commenced, expectedEnd=@expectedEnd, status=@status
                WHERE studentId=@studentId AND course=@course`);
    } else {
      await pool.request()
        .input('studentId',   sql.VarChar(20),  studentId)
        .input('name',        sql.NVarChar(200), name)
        .input('course',      sql.NVarChar(300), course)
        .input('courseCode',  sql.VarChar(20),   courseCode || '')
        .input('trainer',     sql.NVarChar(200), trainer || '')
        .input('commenced',   sql.Date,           commenced || new Date())
        .input('expectedEnd', sql.Date,           expectedEnd || null)
        .input('status',      sql.VarChar(20),    status || 'active')
        .query(`INSERT INTO enrollments (studentId,studentName,course,courseCode,trainer,commenced,expectedEnd,status,isPrimary)
                VALUES (@studentId,@name,@course,@courseCode,@trainer,@commenced,@expectedEnd,@status,1)`);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
};
