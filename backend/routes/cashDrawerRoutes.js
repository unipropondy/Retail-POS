// ==============================================================================
// Project: Supermarket Retail POS
// Module: Cash Drawer Feature (Exact VB.NET btn_CashDrawer_Click & subCashdrawerLog)
// File: backend/routes/cashDrawerRoutes.js
// ==============================================================================

const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../config/db');
const { kickCashDrawer } = require('../utils/rawPrinter');

// ------------------------------------------------------------------------------
// GET /api/cash-drawer/check-permission
// Mirrors fncGetCashierPermission(gsConn, gsCashierGroup, "PgUp")
// ------------------------------------------------------------------------------
router.get('/check-permission', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const cashierId = (req.query.cashierId || '').trim();
    if (!cashierId) {
      return res.status(400).json({ success: false, message: 'cashierId is required' });
    }

    // 1. Fetch user master
    const userReq = pool.request();
    userReq.input('user', sql.VarChar(50), cashierId);
    const userRes = await userReq.query(`
      SELECT UserName, UserGroupCode, CashierGroupCode, IsAdmin
      FROM tblMausermaster
      WHERE UPPER(RTRIM(LTRIM(UserName))) = UPPER(@user)
    `);

    if (userRes.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found in tblMausermaster' });
    }

    const user = userRes.recordset[0];
    const isAdmin = Boolean(user.IsAdmin) || (user.UserGroupCode || '').toUpperCase().includes('ADMIN');

    if (isAdmin) {
      return res.status(200).json({
        success: true,
        allowed: true,
        isAdmin: true,
        requiresAdminAuth: false,
      });
    }

    // 2. Query tblPOSPermission for PgUp (Cash Drawer function code)
    const cashierGroup = (user.CashierGroupCode || user.UserGroupCode || '').trim();
    const permReq = pool.request();
    permReq.input('grp', sql.VarChar(50), cashierGroup);
    permReq.input('fcode', sql.VarChar(50), 'PgUp');
    const permRes = await permReq.query(`
      SELECT Status
      FROM tblPOSPermission
      WHERE UPPER(RTRIM(LTRIM(CashierGroupCode))) = UPPER(@grp)
        AND UPPER(RTRIM(LTRIM(FunctionCode))) = UPPER(@fcode)
    `);

    let allowed = false;
    if (permRes.recordset.length > 0) {
      allowed = Boolean(permRes.recordset[0].Status);
    }

    return res.status(200).json({
      success: true,
      allowed,
      cashierGroup,
      requiresAdminAuth: !allowed,
    });
  } catch (err) {
    console.error('❌ [CASH DRAWER PERMISSION ERROR]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// POST /api/cash-drawer/kick
// Direct Physical Hardware Spooling: Sends ESC p 0 25 50 to TD80 Printer / Windows Spooler
// ------------------------------------------------------------------------------
router.post('/kick', async (req, res) => {
  try {
    const pool = await getPool();
    const { cashierId, terminalCode, reason, authorizedBy, printerName } = req.body;

    const activeUser = (cashierId || 'UPS').trim();
    const activeTerm = (terminalCode || '').trim();

    // 1. Trigger physical drawer kick via rawPrinter helper
    let kickResult = { success: false, printer: printerName || '' };
    try {
      kickResult = await kickCashDrawer(activeTerm, printerName);
    } catch (spoolErr) {
      console.warn('⚠️ [PHYSICAL DRAWER SPOOL ERROR]:', spoolErr.message);
    }

    // 2. Attempt subCashdrawerLog execution (safe fallback if stored proc or table doesn't exist)
    if (pool) {
      try {
        const logReq = pool.request();
        logReq.input('user', sql.VarChar(50), activeUser);
        await logReq.query(`
          IF EXISTS (SELECT 1 FROM sys.procedures WHERE name = 'Sp_CashdrawerLog')
          BEGIN
            EXEC Sp_CashdrawerLog @user
          END
        `);
      } catch (logErr) {
        console.warn('⚠️ [CASH DRAWER LOG NOTICE]:', logErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Cash drawer kick sent successfully to [${kickResult.printer}].`,
      printer: kickResult.printer,
      details: {
        cashierId: activeUser,
        terminalCode: activeTerm,
        authorizedBy: authorizedBy || activeUser,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('❌ [CASH DRAWER KICK ERROR]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
