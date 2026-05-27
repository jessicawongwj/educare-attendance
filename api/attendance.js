const { getPool, sql } = require('./_db');
const { validateToken, isAdminUser, ensureAdminCache } = require('./_auth');
const { trainersFromEmail } = require('./_trainers');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();
  const user = await validateToken(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const email = (user.mail || user.userPrincipalName || '').toLowerCase();
  const date = req.query.date ||
    new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' });

  try {
    const pool = await getPool();
    await ensureAdminCache(pool);
    const adminUser = isAdminUser(email);
    const trainerNames = adminUser ? [] : trainersFromEmail(email);

    if (!adminUser && trainerNames.length === 0) {
      return res.status(200).json([]);
    }
    const request = pool.request().input('date', sql.Date, date);

    let trainerWhere = '';
    if (!adminUser) {
      const placeholders = trainerNames.map((_, i) => `@t${i}`).join(',');
      trainerNames.forEach((n, i) => request.input(`t${i}`, sql.NVarChar(200), n));
      trainerWhere = `AND a.trainer IN (${placeholders})`;
    }

    const result = await request.query(`
      SELECT
        a.id, a.studentId, a.studentName, a.course, a.courseCode, a.trainer, a.campus,
        a.checkinTime, a.checkoutTime, a.attendanceDate
      FROM attendance a
      WHERE a.attendanceDate = @date ${trainerWhere}
      ORDER BY a.checkinTime DESC
    `);

    res.status(200).json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
