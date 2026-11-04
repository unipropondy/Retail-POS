// ==============================================================================
// Project: Supermarket Retail POS
// Module: Price Change Feature (Exact VB.NET btn_PriceChange_Click & subPriceChange)
// File: backend/routes/priceChangeRoutes.js
// ==============================================================================

const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../config/db');

// ------------------------------------------------------------------------------
// GET /api/price-change/check-permission
// Mirrors fncGetCashierPermission(gsConn, gsCashierGroup, "F11")
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

    // 2. Query tblPOSPermission for F11
    const cashierGroup = (user.CashierGroupCode || user.UserGroupCode || '').trim();
    const permReq = pool.request();
    permReq.input('grp', sql.VarChar(50), cashierGroup);
    const permRes = await permReq.query(`
      SELECT Status
      FROM tblPOSPermission
      WHERE UPPER(RTRIM(LTRIM(CashierGroupCode))) = UPPER(@grp)
        AND UPPER(RTRIM(LTRIM(FunctionCode))) = 'F11'
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
    console.error('❌ [PRICE CHANGE PERMISSION ERROR]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// POST /api/price-change/verify-admin
// Mirrors frmAdminPassword.ShowDialog()
// ------------------------------------------------------------------------------
router.post('/verify-admin', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required' });
    }

    const reqAuth = pool.request();
    reqAuth.input('user', sql.VarChar(50), String(username).trim());
    reqAuth.input('pwd', sql.VarChar(50), String(password).trim());

    const result = await reqAuth.query(`
      SELECT UserName, UserGroupCode, IsAdmin
      FROM tblMausermaster
      WHERE UPPER(RTRIM(LTRIM(UserName))) = UPPER(@user)
        AND (Password = @pwd OR LTRIM(RTRIM(Password)) = @pwd)
        AND (IsAdmin = 1 OR UPPER(RTRIM(LTRIM(UserGroupCode))) = 'ADMIN')
    `);

    if (result.recordset.length > 0) {
      return res.status(200).json({
        success: true,
        authorized: true,
        adminUser: result.recordset[0].UserName.trim(),
      });
    } else {
      return res.status(401).json({
        success: false,
        authorized: false,
        message: 'Invalid Admin credentials or insufficient privileges',
      });
    }
  } catch (err) {
    console.error('❌ [PRICE CHANGE ADMIN VERIFY ERROR]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// GET /api/price-change/limits
// Returns MaxPriceChangeAllowed from tblMaCompany
// ------------------------------------------------------------------------------
router.get('/limits', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const result = await pool.request().query(`
      SELECT TOP 1 
        ISNULL(MaxPriceChangeAllowed, 100) AS MaxPriceChangeAllowed,
        ISNULL(MaxDiscountAllowed, 100) AS MaxDiscountAllowed
      FROM tblMaCompany
    `);

    return res.status(200).json({
      success: true,
      maxPriceChangeAllowed: Number(result.recordset[0]?.MaxPriceChangeAllowed || 100),
      maxDiscountAllowed: Number(result.recordset[0]?.MaxDiscountAllowed || 100),
    });
  } catch (err) {
    console.error('❌ [PRICE CHANGE LIMITS ERROR]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

