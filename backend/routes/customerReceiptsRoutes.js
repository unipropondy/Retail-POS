const express = require('express');
const router = express.Router();
const sql = require('mssql');
const { getPool } = require('../config/db');

// GET /api/customer-receipts/list?search=
// Fetches both Uncleared (pending receivable balances) and Cleared (settled receipts)
router.get('/list', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const search = (req.query.search || '').trim();
    let result;

    if (search) {
      const request = pool.request();
      request.input('searchtext', sql.VarChar(20), search);
      result = await request.execute('sp_search_CustomerReceipt');
    } else {
      result = await pool.request().execute('sp_load_CustomerReceiptHeader');
    }

    const uncleared = (result.recordsets && result.recordsets[0]) ? result.recordsets[0] : [];
    const cleared = (result.recordsets && result.recordsets[1]) ? result.recordsets[1] : [];

    return res.json({
      success: true,
      uncleared,
      cleared,
    });
  } catch (err) {
    console.error('❌ [CUSTOMER RECEIPTS LIST ERROR]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

