require('dotenv').config();
const { getPool } = require('./config/db');

(async () => {
  try {
    const pool = await getPool();
    const res = await pool.request()
      .input('inv', 'TEST1234')
      .input('uid', 'UPS')
      .query(`
        IF EXISTS (SELECT 1 FROM sys.procedures WHERE name = 'sp_PostSalesInvoice')
          EXEC sp_PostSalesInvoice @inv, @uid;
        IF EXISTS (SELECT 1 FROM sys.procedures WHERE name = 'sp_insert_AccountsReceivable')
          EXEC sp_insert_AccountsReceivable @inv, @uid;
      `);
    console.log('Success:', res);
  } catch (err) {
    console.error('Error caught:', err.message);
  } finally {
    process.exit(0);
  }
})();
