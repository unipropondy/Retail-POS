// ==============================================================================
// Author: JAVITH, BAVANI 13-11-2026
// Project: Supermarket Retail POS
// Module: Bill-Level Discount & Discount Reasons
// File: backend/routes/discountRoutes.js
// Description: Implements exact VB.NET logic from frmPos1.subDiscount() and frmDiscount.vb:
//              - Check Cashier permission for function code 'F5' in tblPosPermission
//              - Admin Password authorization fallback
//              - Load active discount reasons (tblMaDiscountReason WHERE isActive = 1)
//              - Fetch company discount limits & GST config (tblMaCompany)
//              - Sync discount into tblTempSalesSummary & tblDisplaySales
// ==============================================================================

const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../config/db');

// ------------------------------------------------------------------------------
// 1. POST /api/discounts/permission-check
// Validates whether the cashier group has 'F5' permission or checks admin password.
// ------------------------------------------------------------------------------
router.post('/permission-check', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) {
      return res.status(503).json({ success: false, message: 'Database unreachable.' });
    }

    const { cashierGroupCode, adminPassword } = req.body;

    // Check if Cashier has permission directly
    if (cashierGroupCode) {
      const permReq = pool.request();
      permReq.input('CashierGroupCode', sql.VarChar(50), String(cashierGroupCode).trim());
      permReq.input('FunctionCode', sql.VarChar(50), 'F5');
      
      const permRes = await permReq.query(`
        SELECT Status 
        FROM tblPosPermission 
        WHERE UPPER(RTRIM(LTRIM(CashierGroupCode))) = UPPER(RTRIM(LTRIM(@CashierGroupCode))) 
          AND UPPER(RTRIM(LTRIM(FunctionCode))) = 'F5'
      `);

      if (permRes.recordset.length > 0 && (permRes.recordset[0].Status === true || permRes.recordset[0].Status === 1)) {
        return res.json({
          success: true,
          authorized: true,
          source: 'cashier_permission',
          message: 'Permission granted for F5 Discount'
        });
      }
    }

    // If cashier does not have permission, check admin password
    if (adminPassword !== undefined && adminPassword !== null && String(adminPassword).trim() !== '') {
      const adminReq = pool.request();
      adminReq.input('Password', sql.VarChar(50), String(adminPassword).trim());
      const adminRes = await adminReq.query(`
        SELECT UserCode, UserName, IsAdmin, IsActive 
        FROM tblMaUserMaster 
        WHERE Password = @Password AND (IsAdmin = 1 OR IsAdmin = '1') AND (IsActive = 1 OR IsActive = '1')
      `);

      if (adminRes.recordset.length > 0) {
        return res.json({
          success: true,
          authorized: true,
          source: 'admin_override',
          adminUser: adminRes.recordset[0].UserCode,
          message: 'Admin authorization successful'
        });
      } else {
        return res.status(401).json({
          success: false,
          authorized: false,
          message: 'Invalid Admin Password. Access Denied.'
        });
      }
    }

    return res.json({
      success: true,
      authorized: false,
      needsAdminPassword: true,
      message: 'Cashier does not have Discount permission (F5). Admin authorization required.'
    });

  } catch (error) {
    console.error('❌ [DISCOUNT PERMISSION ERROR]:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ------------------------------------------------------------------------------
// 2. GET /api/discounts/config
// Fetches MaxDiscountAllowed, GSTType, and GSTPercentage from tblMaCompany
// along with active reasons from tblMaDiscountReason (WHERE isActive = 1)
// ------------------------------------------------------------------------------
router.get('/config', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) {
      return res.status(503).json({ success: false, message: 'Database unreachable.' });
    }

    // Company config
    const compRes = await pool.request().query(`
      SELECT TOP 1 
        ISNULL(MaxDiscountAllowed, 100) AS MaxDiscountAllowed,
        ISNULL(SalesTaxType, 'I') AS GSTType,
        ISNULL(TaxPerc, 9) AS GSTPercentage
      FROM tblMaCompany 
      WHERE CompanyCode = '1'
    `);
    const compConfig = compRes.recordset?.[0] || { MaxDiscountAllowed: 100, GSTType: 'I', GSTPercentage: 9 };

    // Discount reasons (SELECT * from tblMaDiscountReason where isActive = 1)
    const reasonsRes = await pool.request().query(`
      SELECT 
        RTRIM(LTRIM(DiscountCode)) AS DiscountCode,
        RTRIM(LTRIM(Description)) AS Description,
        isActive
      FROM tblMaDiscountReason
      WHERE isActive = 1
      ORDER BY Description ASC
    `);

    return res.json({
      success: true,
      maxDiscountAllowed: parseFloat(compConfig.MaxDiscountAllowed) || 100,
      gstType: String(compConfig.GSTType || 'I').trim(),
      gstPercentage: parseFloat(compConfig.GSTPercentage) || 0,
      reasons: reasonsRes.recordset || []
    });

  } catch (error) {
    console.error('❌ [DISCOUNT CONFIG ERROR]:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ------------------------------------------------------------------------------
// 3. POST /api/discounts/sync-temp-summary
// Implements VB.NET Savesummarytemp():
//   DELETE FROM tblTempSalesSummary WHERE TerminalCode = @TerminalCode
//   INSERT INTO tblTempSalesSummary VALUES (...)
// ------------------------------------------------------------------------------
router.post('/sync-temp-summary', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) {
      return res.status(503).json({ success: false, message: 'Database unreachable.' });
    }

    const {
      terminalCode,
      totalItems = 0,
      totalQty = 0,
      subTotal = 0,
      discount = 0,
      tax = 0,
      roundOff = 0,
      netTotal = 0
    } = req.body;

    const cleanTerminalCode = String(terminalCode || '1').trim();

    const request = pool.request();
    request.input('TerminalCode', sql.VarChar(50), cleanTerminalCode);
    request.input('TotalItems', sql.Decimal(18, 2), Number(totalItems));
    request.input('TotalQty', sql.Decimal(18, 2), Number(totalQty));
    request.input('SubTotal', sql.Decimal(18, 2), Number(subTotal));
    request.input('Discount', sql.Decimal(18, 2), Number(discount));
    request.input('Tax', sql.Decimal(18, 4), Number(tax));
    request.input('RoundOff', sql.Decimal(18, 2), Number(roundOff));
    request.input('Deposit', sql.Decimal(18, 2), 0.00);
    request.input('NetTotal', sql.Decimal(18, 2), Number(netTotal));

    await request.query(`
      DELETE FROM tblTempSalesSummary WHERE RTRIM(LTRIM(TerminalCode)) = @TerminalCode;

      INSERT INTO tblTempSalesSummary (TerminalCode, TotalItems, TotalQty, SubTotal, Discount, Tax, RoundOff, Deposit, NetTotal)
      VALUES (@TerminalCode, @TotalItems, @TotalQty, @SubTotal, @Discount, @Tax, @RoundOff, @Deposit, @NetTotal);
    `);

    return res.json({
      success: true,
      message: 'Temporary sales summary synchronized'
    });
  } catch (error) {
    console.error('❌ [SYNC SUMMARY ERROR]:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

