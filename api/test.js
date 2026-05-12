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

    // Test 3: insert a dummy check-in then delete it
    await pool.request()
      .input('studentId',     sql.VarChar(20),  'TEST00001')
      .input('studentName',   sql.NVarChar(200), 'Test Student')
      .input('course',        sql.NVarChar(300), 'Test Course')
      .input('trainer',       sql.NVarChar(200), 'Test Trainer')
      .input('campus',        sql.NVarChar(100), 'Test Campus')
      .input('checkinTime',   sql.DateTime2,     new Date())
      .input('attendanceDate', sql.Date,         new Date())
      .query(`
        INSERT INTO attendance (studentId,studentName,course,trainer,campus,checkinTime,attendanceDate)
        VALUES (@studentId,@studentName,@course,@trainer,@campus,@checkinTime,@attendanceDate)
      `);

    await pool.request()
      .input('studentId', sql.VarChar(20), 'TEST00001')
      .query(`DELETE FROM attendance WHERE studentId = @studentId`);

    res.status(200).json({
      status: 'ok',
      message: 'Database connection successful',
      tables: tables.recordset.map(r => r.TABLE_NAME),
      writeTest: 'insert + delete passed'
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};
