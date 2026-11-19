require('dotenv').config();
const { getPool } = require('./config/db');

(async () => {
  try {
    const pool = await getPool();
    const res = await pool.request().query(`
      SELECT o.name AS table_name, c.name AS column_name, t.name AS type_name, c.max_length
      FROM sys.columns c
      JOIN sys.objects o ON c.object_id = o.object_id
      JOIN sys.types t ON c.user_type_id = t.user_type_id
      WHERE o.name IN ('tblPOSPayModeDetailCur', 'tblPOSPayModeDetail')
      ORDER BY o.name, c.column_id
    `);
    console.log(JSON.stringify(res.recordset, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
})();

