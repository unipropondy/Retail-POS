require('dotenv').config();
const { getPool } = require('./config/db');

(async () => {
  try {
    const pool = await getPool();
    const res = await pool.request().query(`
      SELECT c.name, t.name AS type_name, c.max_length 
      FROM sys.columns c 
      JOIN sys.types t ON c.user_type_id = t.user_type_id 
      WHERE c.object_id = OBJECT_ID('tblPOSSalesDetailCur')
      ORDER BY c.column_id
    `);
    console.log(JSON.stringify(res.recordset, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
})();

