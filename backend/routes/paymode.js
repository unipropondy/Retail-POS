// ==============================================================================
// Author: JAVITH 28-10-2026
// Project: Supermarket Retail POS
// Module: Payment Modes & Tender Configuration (tblInvPaymode)
// File: routes/paymode.js
//
// Change History:
//   - 28-10-2026 | JAVITH | Dedicated payment mode module separating financial/tender
//                          configuration from inventory management.
// ==============================================================================

const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../config/db');

// ------------------------------------------------------------------------------
// GET /api/paymode
// [JAVITH - 28-10-2026]: Fetches payment modes configured in [dbo].[tblInvPaymode]
// Query Parameters:
//   - activeOnly (optional, default: true): Filter only active payment methods
// ------------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) {
      return res.status(503).json({
        success: false,
        message: 'Database is currently unreachable. Please check network/VPN.',
      });
    }

    const activeOnly = req.query.activeOnly !== 'false';

    let query = `
      SELECT 
        CAST(Position AS INT) AS Position,
        RTRIM(LTRIM(PayMode)) AS PayMode,
        RTRIM(LTRIM(Description)) AS Description,
        Active,
        ISNULL(Commission, 0) AS Commission,
        ISNULL(isVoucher, 0) AS isVoucher,
        ISNULL(isMember, 0) AS isMember
      FROM [dbo].[tblInvPaymode]
    `;

    if (activeOnly) {
      query += ` WHERE Active = 1`;
    }

    query += ` ORDER BY Position ASC, PayMode ASC`;

    const result = await pool.request().query(query);

    return res.status(200).json({
      success: true,
      count: result.recordset.length,
      paymodes: result.recordset,
    });
  } catch (error) {
    console.error('❌ [PAYMODE ERROR] Failed to fetch paymodes:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch payment modes: ' + error.message,
    });
  }
});

module.exports = router;
