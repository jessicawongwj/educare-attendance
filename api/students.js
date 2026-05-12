const { getPool, sql } = require('./_db');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`
        SELECT id, name, course, courseCode, trainer, campus, commenced, expectedEnd, status, withdrawn
        FROM students
        WHERE withdrawn = 0
        ORDER BY name
      `);

    res.status(200).json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
