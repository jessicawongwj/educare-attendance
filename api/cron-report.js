const BASE = 'https://edc-attendance.com';

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();

  // Vercel sends cron auth as Bearer in Authorization header
  const auth = req.headers.authorization?.replace('Bearer ', '') || req.query.secret;
  if (auth !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const headers = {
    'Content-Type': 'application/json',
    'x-cron-secret': process.env.CRON_SECRET,
  };

  const results = {};

  // Always: fortnightly attendance summary
  try {
    const r = await fetch(`${BASE}/api/send-email`, {
      method: 'POST', headers, body: JSON.stringify({ type: 'fortnightly' }),
    });
    results.fortnightly = await r.json();
  } catch (e) { results.fortnightly = { error: e.message }; }

  // Always: absence alert
  try {
    const r = await fetch(`${BASE}/api/send-email`, {
      method: 'POST', headers, body: JSON.stringify({ type: 'absence' }),
    });
    results.absence = await r.json();
  } catch (e) { results.absence = { error: e.message }; }

  // On the 1st of each month: also send monthly report
  const dayAEST = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' }).slice(-2);
  if (dayAEST === '01') {
    try {
      const r = await fetch(`${BASE}/api/send-email`, {
        method: 'POST', headers, body: JSON.stringify({ type: 'monthly' }),
      });
      results.monthly = await r.json();
    } catch (e) { results.monthly = { error: e.message }; }
  }

  res.status(200).json({ ok: true, results });
};
