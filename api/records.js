const { getPool, sql } = require('./_db');
const { validateToken, isAdminUser } = require('./_auth');
const { trainersFromEmail } = require('./_trainers');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();
  const user = await validateToken(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const email = (user.mail || user.userPrincipalName || '').toLowerCase();
  const adminUser = isAdminUser(email);
  const trainerNames = adminUser ? [] : trainersFromEmail(email);

  try {
    const pool = await getPool();
    const request = pool.request();
    let where = 'WHERE attendanceDate >= DATEADD(day, -90, CAST(GETDATE() AS DATE))';

    // Non-admin trainers: scope to own records only (IDOR prevention)
    if (!adminUser && trainerNames.length > 0) {
      const placeholders = trainerNames.map((_, i) => `@t${i}`).join(',');
      trainerNames.forEach((n, i) => request.input(`t${i}`, sql.NVarChar(200), n));
      where += ` AND trainer IN (${placeholders})`;
    } else if (!adminUser && trainerNames.length === 0) {
      // Authenticated but not a known trainer or admin — return empty
      return res.status(200).json([]);
    }

    const result = await request.query(`
      SELECT id, studentId, studentName, course, courseCode, trainer, campus,
             checkinTime, checkoutTime, attendanceDate, notes
      FROM attendance
      ${where}
      ORDER BY attendanceDate DESC, checkinTime DESC
    `);
    res.status(200).json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
