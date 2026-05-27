const { getPool, sql } = require('./_db');
const { validateToken, isAdminUser, ensureAdminCache } = require('./_auth');
const { sendMail } = require('./_graph');

const { workingDaysInRange } = require('./_calendar');

function todayAEST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' });
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

function pct(n, d) { return d > 0 ? Math.round(n / d * 100) : 0; }

const TABLE_STYLE = 'border-collapse:collapse;font-family:Segoe UI,Arial,sans-serif;font-size:14px;width:100%;';
const TH_STYLE    = 'padding:9px 14px;text-align:left;background:#0a3352;color:#fff;font-weight:600;';
const TD_STYLE    = 'padding:8px 14px;border-bottom:1px solid #e5e7eb;';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { type } = req.body || {};
  if (!type) return res.status(400).json({ error: 'Missing type' });

  try {
    const pool = await getPool();

    // Allow cron-secret OR authenticated admin
    const cronSecret = req.headers['x-cron-secret'];
    if (cronSecret !== process.env.CRON_SECRET) {
      const user = await validateToken(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      const email = (user.mail || user.userPrincipalName || '').toLowerCase();
      await ensureAdminCache(pool);
      if (!isAdminUser(email)) return res.status(403).json({ error: 'Admin only' });
    }
    const today = todayAEST();

    // Load recipients from app_settings, fall back to hardcoded
    let recipients = ['jessica.wong@niet.edu.au'];
    try {
      const s = await pool.request().query(
        "SELECT value FROM app_settings WHERE [key]='email_config'"
      );
      if (s.recordset.length) {
        const cfg = JSON.parse(s.recordset[0].value);
        if (Array.isArray(cfg.recipients) && cfg.recipients.length) recipients = cfg.recipients;
      }
    } catch { /* table may not exist yet */ }

    /* ── Fortnightly / Monthly ── */
    if (type === 'fortnightly' || type === 'monthly') {
      const isMonthly = type === 'monthly';
      let startDate;
      if (isMonthly) {
        startDate = today.slice(0, 7) + '-01';
      } else {
        const d = new Date(today + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() - 14);
        startDate = d.toISOString().slice(0, 10);
      }
      const workDays = workingDaysInRange(startDate, today);
      const label = isMonthly ? 'Monthly' : 'Fortnightly';

      const result = await pool.request()
        .input('startDate', sql.Date, startDate)
        .input('today',     sql.Date, today)
        .query(`
          SELECT
            e.trainer, e.course,
            COUNT(DISTINCT e.studentId)             AS enrolled,
            COUNT(DISTINCT a.studentId)             AS present
          FROM enrollments e
          LEFT JOIN attendance a
            ON  a.studentId = e.studentId
            AND a.course    = e.course
            AND a.attendanceDate >= @startDate
            AND a.attendanceDate <= @today
          WHERE e.status = 'active'
          GROUP BY e.trainer, e.course
          ORDER BY e.trainer, e.course
        `);

      const rows = result.recordset;
      let html = `
        <div style="font-family:Segoe UI,Arial,sans-serif;max-width:800px;">
        <h2 style="color:#0a3352;margin-bottom:4px;">Educare — ${label} Attendance Report</h2>
        <p style="color:#6b7280;margin:0 0 20px;">
          Period: <strong>${fmtDate(startDate)}</strong> to <strong>${fmtDate(today)}</strong>
          &nbsp;·&nbsp; ${workDays} working day${workDays !== 1 ? 's' : ''}
        </p>
        <table style="${TABLE_STYLE}">
          <thead><tr>
            <th style="${TH_STYLE}">Trainer</th>
            <th style="${TH_STYLE}">Course</th>
            <th style="${TH_STYLE};text-align:center;">Enrolled</th>
            <th style="${TH_STYLE};text-align:center;">Attended ≥1 day</th>
            <th style="${TH_STYLE};text-align:center;">Rate</th>
          </tr></thead><tbody>`;
      rows.forEach((r, i) => {
        const rate = pct(r.present, r.enrolled);
        const rateColor = rate < 80 ? '#dc2626' : rate < 90 ? '#d97706' : '#16a34a';
        const bg = i % 2 ? '#fff' : '#f9fafb';
        html += `<tr style="background:${bg};">
          <td style="${TD_STYLE}">${r.trainer || '—'}</td>
          <td style="${TD_STYLE}">${r.course || '—'}</td>
          <td style="${TD_STYLE};text-align:center;">${r.enrolled}</td>
          <td style="${TD_STYLE};text-align:center;">${r.present}</td>
          <td style="${TD_STYLE};text-align:center;font-weight:700;color:${rateColor};">${rate}%</td>
        </tr>`;
      });
      html += `</tbody></table>
        <p style="color:#9ca3af;font-size:12px;margin-top:16px;">
          Generated ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })} AEST
        </p></div>`;

      await sendMail({
        to: recipients,
        subject: `Educare ${label} Attendance — ${fmtDate(today)}`,
        htmlBody: html,
      });
      return res.status(200).json({ ok: true, type, recipients, rows: rows.length });
    }

    /* ── Absence alert ── */
    if (type === 'absence') {
      const cutoff = new Date(today + 'T00:00:00Z');
      cutoff.setUTCDate(cutoff.getUTCDate() - 14);
      const cutoffStr = cutoff.toISOString().slice(0, 10);

      const result = await pool.request()
        .input('cutoff', sql.Date, cutoffStr)
        .query(`
          SELECT
            s.id, s.name, e.trainer, e.course, e.campus,
            MAX(a.attendanceDate) AS lastAttendance
          FROM students s
          JOIN enrollments e ON e.studentId = s.id AND e.status = 'active'
          LEFT JOIN attendance a ON a.studentId = s.id AND a.course = e.course
          WHERE s.withdrawn = 0
          GROUP BY s.id, s.name, e.trainer, e.course, e.campus
          HAVING MAX(a.attendanceDate) < @cutoff OR MAX(a.attendanceDate) IS NULL
          ORDER BY e.trainer, s.name
        `);

      const rows = result.recordset;
      let html = `
        <div style="font-family:Segoe UI,Arial,sans-serif;max-width:800px;">
        <h2 style="color:#dc2626;margin-bottom:4px;">⚠ Educare — Absence Alert</h2>
        <p style="color:#6b7280;margin:0 0 20px;">
          Students with no attendance recorded since <strong>${fmtDate(cutoffStr)}</strong>
          &nbsp;·&nbsp; ${rows.length} student${rows.length !== 1 ? 's' : ''}
        </p>
        <table style="${TABLE_STYLE}">
          <thead><tr>
            <th style="${TH_STYLE}">Student</th>
            <th style="${TH_STYLE}">ID</th>
            <th style="${TH_STYLE}">Trainer</th>
            <th style="${TH_STYLE}">Course</th>
            <th style="${TH_STYLE};text-align:center;">Last Attendance</th>
          </tr></thead><tbody>`;
      rows.forEach((r, i) => {
        const last = r.lastAttendance
          ? fmtDate(new Date(r.lastAttendance).toISOString().slice(0, 10))
          : '<span style="color:#dc2626;font-weight:700;">Never</span>';
        const bg = i % 2 ? '#fff' : '#fff5f5';
        html += `<tr style="background:${bg};">
          <td style="${TD_STYLE}">${r.name}</td>
          <td style="${TD_STYLE};color:#6b7280;">${r.id}</td>
          <td style="${TD_STYLE}">${r.trainer || '—'}</td>
          <td style="${TD_STYLE}">${r.course || '—'}</td>
          <td style="${TD_STYLE};text-align:center;">${last}</td>
        </tr>`;
      });
      html += `</tbody></table>
        <p style="color:#9ca3af;font-size:12px;margin-top:16px;">
          Generated ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })} AEST
        </p></div>`;

      await sendMail({
        to: recipients,
        subject: `Educare Absence Alert — ${rows.length} student${rows.length !== 1 ? 's' : ''} — ${fmtDate(today)}`,
        htmlBody: html,
      });
      return res.status(200).json({ ok: true, type, count: rows.length, recipients });
    }

    return res.status(400).json({ error: `Unknown type: ${type}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
