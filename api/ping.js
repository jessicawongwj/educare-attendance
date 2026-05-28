// Lightweight keep-warm endpoint — called by Vercel cron every 10 min
const { getPool } = require('./_db');

module.exports = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().query('SELECT 1');
    res.status(200).json({ ok: true, ts: Date.now() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
