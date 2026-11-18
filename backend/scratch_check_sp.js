require('dotenv').config();
const { getPool } = require('./config/db');

(async () => {
  try {
    const pool = await getPool();
    const res = await pool.request().query(`
      SELECT sm.definition
      FROM sys.sql_modules sm
      WHERE sm.object_id = OBJECT_ID('sp_POS_SalesHeader')
    `);
    console.log(res.recordset[0]?.definition);
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
})();
