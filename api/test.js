const { getPool, sql } = require('./_db');

module.exports = async (req, res) => {
  try {
    const pool = await getPool();

    // Test 1: connection
    await pool.request().query('SELECT 1 AS ok');

    // Test 2: tables exist
    const tables = await pool.request().query(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME IN ('students','attendance')
    `);

    // Test 3: row counts
    const counts = await pool.request().query(`
      SELECT
        (SELECT COUNT(*) FROM students)   AS studentCount,
        (SELECT COUNT(*) FROM attendance) AS attendanceCount
    `);

    res.status(200).json({
      status: 'ok',
      message: 'Database connection successful',
      tables: tables.recordset.map(r => r.TABLE_NAME),
      studentCount:    counts.recordset[0].studentCount,
      attendanceCount: counts.recordset[0].attendanceCount
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};
