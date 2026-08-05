// TEMPORARY — schema diagnostic/migration logic, invoked only via the secret-gated
// branch in settings.js. Deleted along with that branch once the Aug 2026 migration
// is applied and verified.
const { getPool, sql } = require('./_db');

module.exports = async (req, res) => {
  const pool = await getPool();
  const step = req.query.mstep || 'inspect';

  try {
    if (step === 'inspect') {
      const out = {};
      for (const table of ['students', 'attendance', 'enrollments']) {
        const cols = await pool.request().input('t', sql.VarChar(100), table).query(`
          SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT
          FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @t ORDER BY ORDINAL_POSITION
        `);
        const idx = await pool.request().input('t', sql.VarChar(100), table).query(`
          SELECT i.name AS index_name, i.is_unique, i.is_primary_key, i.type_desc,
                 STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS cols
          FROM sys.indexes i
          JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
          JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
          WHERE i.object_id = OBJECT_ID(@t) AND i.name IS NOT NULL
          GROUP BY i.name, i.is_unique, i.is_primary_key, i.type_desc
        `);
        const fk = await pool.request().input('t', sql.VarChar(100), table).query(`
          SELECT fk.name, OBJECT_NAME(fk.referenced_object_id) AS ref_tbl, fk.delete_referential_action_desc
          FROM sys.foreign_keys fk WHERE fk.parent_object_id = OBJECT_ID(@t)
        `);
        out[table] = { columns: cols.recordset, indexes: idx.recordset, foreignKeys: fk.recordset };
      }

      const counts = await pool.request().query(`
        SELECT (SELECT COUNT(*) FROM students) AS students,
               (SELECT COUNT(*) FROM attendance) AS attendance,
               (SELECT COUNT(*) FROM enrollments) AS enrollments
      `);
      out.rowCounts = counts.recordset[0];

      const dupes = await pool.request().query(`
        SELECT studentId, course, COUNT(*) AS cnt
        FROM enrollments GROUP BY studentId, course HAVING COUNT(*) > 1
      `);
      out.duplicateEnrollments = dupes.recordset;

      return res.status(200).json(out);
    }

    return res.status(400).json({ error: 'Unknown step: ' + step });
  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
};
