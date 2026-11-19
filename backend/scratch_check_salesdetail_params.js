require('dotenv').config();
const { getPool } = require('./config/db');

(async () => {
  try {
    const pool = await getPool();
    const res = await pool.request().query(`
      SELECT p.name AS param_name, t.name AS type_name, p.max_length, p.is_output
      FROM sys.parameters p
      JOIN sys.types t ON p.user_type_id = t.user_type_id
      WHERE p.object_id = OBJECT_ID('sp_SalesDetail')
      ORDER BY p.parameter_id
    `);
    console.log(JSON.stringify(res.recordset, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
})();

