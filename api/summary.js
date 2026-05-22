const { getPool, sql } = require('./_db');
const { validateToken, isAdminUser } = require('./_auth');
const { trainersFromEmail } = require('./_trainers');
const { workingDaysInRange } = require('./_calendar');

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

    let trainerWhere = '';
    if (!adminUser && trainerNames.length > 0) {
      const placeholders = trainerNames.map((_, i) => `@t${i}`).join(',');
      trainerNames.forEach((n, i) => request.input(`t${i}`, sql.NVarChar(200), n));
      trainerWhere = `AND e.trainer IN (${placeholders})`;
    } else if (!adminUser && trainerNames.length === 0) {
      return res.status(200).json([]);
    }

    const result = await request.query(`
      SELECT
        s.id,
        s.name,
        e.course,
        e.courseCode,
        e.trainer,
        s.campus,
        e.status,
        e.commenced,
        e.expectedEnd,
        e.isPrimary,
        (SELECT COUNT(*) FROM enrollments WHERE studentId = s.id) AS enrollmentCount,
        COUNT(a.id) AS attendedDays,
        SUM(CASE WHEN a.attendanceDate >= CAST(DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1) AS DATE) THEN 1 ELSE 0 END) AS monthlyAttendedDays,
        MAX(a.checkinTime) AS lastCheckin
      FROM students s
      JOIN enrollments e ON e.studentId = s.id
      LEFT JOIN attendance a
        ON  a.studentId = s.id
        AND (a.course = e.course OR (a.courseCode = e.courseCode AND a.courseCode != ''))
        AND a.attendanceDate >= DATEADD(day, -90, CAST(GETDATE() AS DATE))
      WHERE s.withdrawn = 0 ${trainerWhere}
      GROUP BY
        s.id, s.name, e.course, e.courseCode, e.trainer, s.campus,
        e.status, e.commenced, e.expectedEnd, e.isPrimary
      ORDER BY s.name, e.isPrimary DESC
    `);

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' });
    const [yr, mo] = today.split('-');
    const monthStart = `${yr}-${mo}-01`;

    const cutoffDate = new Date(today + 'T00:00:00Z');
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - 90);
    const cutoff = cutoffDate.toISOString().slice(0, 10);

    const rows = result.recordset.map(r => {
      const commencedStr = r.commenced
        ? new Date(r.commenced).toISOString().slice(0, 10)
        : null;
      const periodStart = commencedStr && commencedStr > cutoff ? commencedStr : cutoff;
      const expectedDays = workingDaysInRange(periodStart, today);
      const monthlyPeriodStart = commencedStr && commencedStr > monthStart ? commencedStr : monthStart;
      const monthlyExpectedDays = monthlyPeriodStart <= today ? workingDaysInRange(monthlyPeriodStart, today) : 0;
      return { ...r, expectedDays, monthlyExpectedDays };
    });

    res.status(200).json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
