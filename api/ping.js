const { getPool } = require('./_db');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    await getPool();
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(503).json({ ok: false });
  }
};
