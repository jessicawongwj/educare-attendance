const { getPool, sql } = require('./_db');
const { validateToken, isAdminUser, ensureAdminCache } = require('./_auth');
const { trainersFromEmail } = require('./_trainers');
const { workingDaysInRange } = require('./_calendar');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();
  const user = await validateToken(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const email = (user.mail || user.userPrincipalName || '').toLowerCase();

  try {
    const pool = await getPool();
    await ensureAdminCache(pool);
    const adminUser = isAdminUser(email);
    const trainerNames = adminUser ? [] : trainersFromEmail(email);

    const request = pool.request();

    let trainerWhere = '';
    if (!adminUser && trainerNames.length > 0) {
      const placeholders = trainerNames.map((_, i) => `@t${i}`).join(',');
      trainerNames.forEach((n, i) => request.input(`t${i}`, sql.NVarChar(200), n));
      // COALESCE so imported students (trainer in students table) and
      // web-enrolled students (trainer in enrollments table) are both matched
      trainerWhere = `AND COALESCE(e.trainer, s.trainer) IN (${placeholders})`;
    } else if (!adminUser && trainerNames.length === 0) {
      return res.status(200).json([]);
    }


    const result = await request.query(`
      SELECT
        s.id,
        s.name,
        COALESCE(e.course,      s.course)      AS course,
        COALESCE(e.courseCode,  s.courseCode)  AS courseCode,
        COALESCE(e.trainer,     s.trainer)     AS trainer,
        s.campus,
        COALESCE(e.status,      s.status)      AS status,
        COALESCE(e.commenced,   s.commenced)   AS commenced,
        COALESCE(e.expectedEnd, s.expectedEnd) AS expectedEnd,
        COALESCE(e.isPrimary, 1)               AS isPrimary,
        MAX(ISNULL(ec.enrollmentCount, 0))     AS enrollmentCount,
        COUNT(a.attendanceDate)                AS attendedDays,
        SUM(CASE WHEN a.attendanceDate >= CAST(DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1) AS DATE) THEN 1 ELSE 0 END) AS monthlyAttendedDays,
        MAX(a.checkinTime)                     AS lastCheckin,
        MIN(a.attendanceDate)                  AS firstAttendanceDate
      FROM students s
      LEFT JOIN enrollments e ON e.studentId = s.id
      LEFT JOIN (
        SELECT studentId, COUNT(*) AS enrollmentCount FROM enrollments GROUP BY studentId
      ) ec ON ec.studentId = s.id
      LEFT JOIN attendance a
        ON  a.studentId      = s.id
        AND a.course         = COALESCE(e.course, s.course)
        AND a.attendanceDate >= ISNULL(CAST(COALESCE(e.commenced, s.commenced) AS DATE), DATEADD(day, -365, CAST(GETDATE() AS DATE)))
      WHERE s.withdrawn = 0 ${trainerWhere}
      GROUP BY
        s.id, s.name,
        COALESCE(e.course,      s.course),
        COALESCE(e.courseCode,  s.courseCode),
        COALESCE(e.trainer,     s.trainer),
        s.campus,
        COALESCE(e.status,      s.status),
        COALESCE(e.commenced,   s.commenced),
        COALESCE(e.expectedEnd, s.expectedEnd),
        COALESCE(e.isPrimary, 1)
      ORDER BY s.name, COALESCE(e.isPrimary, 1) DESC
    `);

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' });
    const [yr, mo] = today.split('-');
    const monthStart = `${yr}-${mo}-01`;

    const fallbackDate = new Date(today + 'T00:00:00Z');
    fallbackDate.setUTCDate(fallbackDate.getUTCDate() - 365);
    const fallback = fallbackDate.toISOString().slice(0, 10);

    // Memoize workingDaysInRange — many students share the same commenced date
    const wdCache = {};
    function wd(start, end) {
      const k = start + '|' + end;
      if (wdCache[k] === undefined) wdCache[k] = workingDaysInRange(start, end);
      return wdCache[k];
    }

    const rows = result.recordset.map(r => {
      const commencedStr = r.commenced
        ? new Date(r.commenced).toISOString().slice(0, 10)
        : null;
      // Use first actual check-in as period start (so pre-attendance days don't penalise rate)
      const firstAttendanceStr = r.firstAttendanceDate
        ? new Date(r.firstAttendanceDate).toISOString().slice(0, 10)
        : null;
      // If student has never checked in, expectedDays = 0 → rate shows as Pending
      const periodStart = firstAttendanceStr || null;
      const expectedDays = periodStart ? Math.round(wd(periodStart, today) * 2 / 5) : 0;
      // Monthly: use firstAttendanceDate or monthStart (whichever is later) if student has attended
      const monthlyPeriodStart = firstAttendanceStr
        ? (firstAttendanceStr > monthStart ? firstAttendanceStr : monthStart)
        : monthStart;
      const monthlyWorkingDays = (firstAttendanceStr && monthlyPeriodStart <= today) ? wd(monthlyPeriodStart, today) : 0;
      const monthlyExpectedDays = Math.round(monthlyWorkingDays * 2 / 5);
      return { ...r, expectedDays, monthlyExpectedDays, firstAttendanceDate: firstAttendanceStr };
    });

    res.status(200).json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
