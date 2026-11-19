require('dotenv').config();
const { getPool } = require('./config/db');

(async () => {
  try {
    const pool = await getPool();
    const res = await pool.request().query(`
      SELECT sm.definition
      FROM sys.sql_modules sm
      WHERE sm.object_id = OBJECT_ID('sp_PostSalesInvoice')
         OR sm.object_id = OBJECT_ID('sp_insert_AccountsReceivable')
    `);
    res.recordset.forEach(r => console.log(r.definition, '\n-------------------\n'));
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
})();

