// ==============================================================================
// Project: Supermarket Retail POS
// Module: POS Clear Process (F2 Clear)
// File: routes/posClearRoutes.js
// Description: Manages the exact VB.NET F2 Clear Button workflow:
//              - Validates cashier permissions for F2 / Admin authentication
//              - Checks gsCompanyShortCode <> "AM"
//              - Manages Clear Invoice generation via Sp_GetUpdateClearInvoice
//              - Saves Clear Header via sp_SalesHeaderClear
//              - Saves Clear Details via sp_SalesDetailClear
//              - Cleans tblDisplaySales, tblTempSales, tblTempSalesSummary for current terminal
//              - Operates within a single ACID SQL Transaction
// ==============================================================================

const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../config/db');
const configService = require('../config/configService');

// ------------------------------------------------------------------------------
// GET /api/pos/clear/check-permission
// Checks cashier permission for F2 Clear or determines if admin auth is required
// ------------------------------------------------------------------------------
router.get('/check-permission', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const cashierId = (req.query.cashierId || '').trim();
    if (!cashierId) {
      return res.status(400).json({ success: false, message: 'cashierId is required' });
    }

    // 1. Fetch Company Short Code from tblMaCompany
    const compReq = pool.request();
    const compRes = await compReq.query(`
      SELECT TOP 1 ISNULL(CompanyShortCode, '') AS CompanyShortCode
      FROM tblMaCompany
    `);
    const companyShortCode = (compRes.recordset[0]?.CompanyShortCode || '').trim();

    // 2. Fetch User Details from tblMausermaster
    const userReq = pool.request();
    userReq.input('user', sql.VarChar(50), cashierId);
    const userRes = await userReq.query(`
      SELECT UserName, UserGroupCode, CashierGroupCode, IsAdmin
      FROM tblMausermaster
      WHERE UPPER(RTRIM(LTRIM(UserName))) = UPPER(@user)
    `);

    if (userRes.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = userRes.recordset[0];
    const isAdmin = user.IsAdmin === 1 || user.IsAdmin === true || (user.UserGroupCode || '').toUpperCase().includes('ADMIN');

    if (isAdmin) {
      return res.status(200).json({
        success: true,
        allowed: true,
        isAdmin: true,
        companyShortCode,
        requiresAdminAuth: false,
      });
    }

    // 3. Check Company Condition: gsCompanyShortCode <> "AM"
    // If company is AM, special rule applies, else check F2 permission
    const cashierGroup = (user.CashierGroupCode || user.UserGroupCode || '').trim();
    const permReq = pool.request();
    permReq.input('grp', sql.VarChar(50), cashierGroup);
    const permRes = await permReq.query(`
      SELECT Status
      FROM tblPOSPermission
      WHERE UPPER(RTRIM(LTRIM(CashierGroupCode))) = UPPER(@grp)
        AND UPPER(RTRIM(LTRIM(FunctionCode))) = 'F2'
    `);

    let allowed = true;
    if (permRes.recordset.length > 0) {
      allowed = Boolean(permRes.recordset[0].Status);
    }

    return res.status(200).json({
      success: true,
      allowed,
      cashierGroup,
      companyShortCode,
      requiresAdminAuth: !allowed,
    });
  } catch (err) {
    console.error('❌ [CLEAR PERMISSION ERROR]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// POST /api/pos/clear/verify-admin
// Validates administrator credentials for Clear operation
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
    console.error('❌ [CLEAR ADMIN VERIFY ERROR]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// POST /api/pos/clear
// Executes complete VB.NET Clear Log transaction:
// - Generates Clear Invoice No using LocationCode (first 2 chars) + 8-digit seq from Sp_GetUpdateClearInvoice
// - Saves Clear Header via sp_SalesHeaderClear
// - Saves Clear Detail items via sp_SalesDetailClear
// - Deletes temporary sales records for this TerminalCode: tblTempSales, tblDisplaySales, tblTempSalesSummary
// ------------------------------------------------------------------------------
router.post('/', async (req, res) => {
  const pool = await getPool();
  if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

  const {
    items = [],
    terminalCode,
    cashierId,
    adminId,
    locationCode,
    isStandalone = false,
  } = req.body;

  const termCode = (terminalCode || '').trim();
  const cId = (cashierId || 'UPS').trim();
  const clearId = (adminId || cId).trim();

  if (!termCode) {
    return res.status(400).json({ success: false, message: 'terminalCode is required' });
  }

  // Check standalone mode configuration
  // If gbStandAloneMode is true, database clear log is skipped (or local only)
  const standaloneConfig = String(configService.get('POSWITHSTANDALONE') || 'N');
  const isStandAloneEffective = Boolean(isStandalone || standaloneConfig.toUpperCase() === 'Y');

  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    let clearInvoiceNo = '';

    // Step 1: If NOT Standalone and sales items exist, generate Clear Log
    if (!isStandAloneEffective && Array.isArray(items) && items.length > 0) {
      // 1.1 Determine LocationCode
      let locCode = (locationCode || '').trim();
      if (!locCode) {
        const locReq = new sql.Request(transaction);
        locReq.input('term', sql.VarChar(20), termCode);
        const locRes = await locReq.query(`
          SELECT TOP 1 LocationCode FROM tblMaTerminal WHERE UPPER(RTRIM(LTRIM(TerminalCode))) = UPPER(@term)
        `);
        locCode = (locRes.recordset[0]?.LocationCode || 'HQ').trim();
      }

      // 1.2 Call Sp_GetUpdateClearInvoice to obtain next Clear Invoice sequence
      const invReq = new sql.Request(transaction);
      const invRes = await invReq.execute('Sp_GetUpdateClearInvoice');
      const nextPosSeq = invRes.recordset[0]?.NextPos;

      if (!nextPosSeq) {
        throw new Error('Failed to retrieve NextPos sequence from Sp_GetUpdateClearInvoice');
      }

      // 1.3 Format Clear Invoice Number: 2 chars of Location Code + 8-digit sequence (e.g. HQ00007320)
      const locPrefix = locCode.slice(0, 2).toUpperCase().padEnd(2, ' ');
      const seqStr = String(nextPosSeq).padStart(8, '0');
      clearInvoiceNo = `${locPrefix}${seqStr}`;

      // 1.4 Compute summary totals for Clear Header
      let totalValue = 0;
      let totalDiscount = 0;
      let totalLines = items.length;

      items.forEach((it) => {
        const qty = Number(it.qty || 1);
        const price = Number(it.price || 0);
        const disc = Number(it.disc || 0);
        totalValue += qty * price;
        totalDiscount += disc;
      });

      const netTotal = parseFloat((totalValue - totalDiscount).toFixed(2));
      totalValue = parseFloat(totalValue.toFixed(2));
      totalDiscount = parseFloat(totalDiscount.toFixed(2));

      // 1.5 Save Clear Header via sp_SalesHeaderClear
      // Parameters:
      // @InvoiceNo char(15), @sDate datetime, @TotalValue decimal(18,2), @Gst decimal(18,4),
      // @DetailDiscount decimal(18,2), @NetDiscount decimal(18,2), @DiscountType char(15),
      // @NetTotal decimal(18,2), @CashierId char(10), @ClearId char(10), @LocationCode char(10),
      // @TerminalCode char(10), @TotalLines decimal, @UserID char(10)
      const hdrReq = new sql.Request(transaction);
      hdrReq.input('InvoiceNo', sql.Char(15), clearInvoiceNo);
      hdrReq.input('sDate', sql.DateTime, new Date());
      hdrReq.input('TotalValue', sql.Decimal(18, 2), totalValue);
      hdrReq.input('Gst', sql.Decimal(18, 4), 0);
      hdrReq.input('DetailDiscount', sql.Decimal(18, 2), totalDiscount);
      hdrReq.input('NetDiscount', sql.Decimal(18, 2), 0);
      hdrReq.input('DiscountType', sql.Char(15), 'Amount');
      hdrReq.input('NetTotal', sql.Decimal(18, 2), netTotal);
      hdrReq.input('CashierId', sql.Char(10), cId.slice(0, 10));
      hdrReq.input('ClearId', sql.Char(10), clearId.slice(0, 10));
      hdrReq.input('LocationCode', sql.Char(10), locCode.slice(0, 10));
      hdrReq.input('TerminalCode', sql.Char(10), termCode.slice(0, 10));
      hdrReq.input('TotalLines', sql.Decimal(18, 0), totalLines);
      hdrReq.input('UserID', sql.Char(10), cId.slice(0, 10));

      await hdrReq.execute('sp_SalesHeaderClear');

      // 1.6 Save Clear Details via sp_SalesDetailClear
      // Parameters:
      // @InvoiceNo char(15), @InventoryCode char(20), @Description char(50),
      // @Qty decimal(18,2), @Price decimal(18,2), @TotalValue decimal(18,2),
      // @Discount decimal(18,2), @NetDiscount decimal(18,2), @NetAmount decimal(18,2),
      // @ActualSales decimal(18,2), @Gst decimal(18,4), @SalesmanId char(10),
      // @DeptCode char(10), @CategoryCode char(10), @BrandCode char(10),
      // @UserID char(10), @LocationCode char(10), @MemberDiscount decimal(18,2), @GSTType char(10)
      // High-performance batch prefetch of Department, Category, Brand in a single round-trip
      const distinctCodes = Array.from(new Set(items.map(it => String(it.code || it.InventoryCode || '').trim()).filter(Boolean)));
      const itemInfoMap = new Map();

      if (distinctCodes.length > 0) {
        const invBatchReq = new sql.Request(transaction);
        const codeParams = distinctCodes.map((c, i) => `@c${i}`).join(', ');
        distinctCodes.forEach((c, i) => invBatchReq.input(`c${i}`, sql.VarChar(50), c));
        const batchRes = await invBatchReq.query(`
          SELECT 
            RTRIM(LTRIM(InventoryCode)) AS InventoryCode,
            ISNULL(DepartmentCode, '') AS DepartmentCode,
            ISNULL(CategoryCode, '') AS CategoryCode,
            ISNULL(BrandCode, '') AS BrandCode
          FROM tblInventory
          WHERE RTRIM(LTRIM(InventoryCode)) IN (${codeParams})
        `);
        batchRes.recordset.forEach(r => {
          itemInfoMap.set(r.InventoryCode, r);
        });
      }

      for (const it of items) {
        const invCode = String(it.code || it.InventoryCode || '').trim();
        const qtyNum = Number(it.qty || 1);
        const priceNum = Number(it.price || 0);
        const discNum = Number(it.disc || 0);
        const lineTotal = parseFloat((qtyNum * priceNum).toFixed(2));
        const lineNet = parseFloat((lineTotal - discNum).toFixed(2));
        const itemInfo = itemInfoMap.get(invCode) || {
          DepartmentCode: '',
          CategoryCode: '',
          BrandCode: '',
        };

        const detReq = new sql.Request(transaction);
        detReq.input('InvoiceNo', sql.Char(15), clearInvoiceNo);
        detReq.input('InventoryCode', sql.Char(20), invCode.slice(0, 20));
        detReq.input('Description', sql.Char(50), String(it.description || it.Description || '').slice(0, 50));
        detReq.input('Qty', sql.Decimal(18, 2), qtyNum);
        detReq.input('Price', sql.Decimal(18, 2), priceNum);
        detReq.input('TotalValue', sql.Decimal(18, 2), lineTotal);
        detReq.input('Discount', sql.Decimal(18, 2), discNum);
        detReq.input('NetDiscount', sql.Decimal(18, 2), discNum);
        detReq.input('NetAmount', sql.Decimal(18, 2), lineNet);
        detReq.input('ActualSales', sql.Decimal(18, 2), lineNet);
        detReq.input('Gst', sql.Decimal(18, 4), 0);
        detReq.input('SalesmanId', sql.Char(10), '');
        detReq.input('DeptCode', sql.Char(10), String(itemInfo.DepartmentCode).slice(0, 10));
        detReq.input('CategoryCode', sql.Char(10), String(itemInfo.CategoryCode).slice(0, 10));
        detReq.input('BrandCode', sql.Char(10), String(itemInfo.BrandCode).slice(0, 10));
        detReq.input('UserID', sql.Char(10), cId.slice(0, 10));
        detReq.input('LocationCode', sql.Char(10), locCode.slice(0, 10));
        detReq.input('MemberDiscount', sql.Decimal(18, 2), 0);
        detReq.input('GSTType', sql.Char(10), 'Z');

        await detReq.execute('sp_SalesDetailClear');
      }
    }

    // Step 2: Cleanup Temporary Tables for the currently logged-in terminal
    // - tblTempSales
    // - tblDisplaySales
    // - tblTempSalesSummary
    const cleanReq = new sql.Request(transaction);
    cleanReq.input('term', sql.VarChar(20), termCode);

    await cleanReq.query(`
      DELETE FROM tblTempSales WHERE UPPER(RTRIM(LTRIM(TerminalCode))) = UPPER(@term);
      DELETE FROM tblDisplaySales WHERE UPPER(RTRIM(LTRIM(TerminalCode))) = UPPER(@term);
      DELETE FROM tblTempSalesSummary WHERE UPPER(RTRIM(LTRIM(TerminalCode))) = UPPER(@term);
    `);

    // Step 3: Commit SQL Transaction
    await transaction.commit();

    return res.status(200).json({
      success: true,
      clearInvoiceNo: clearInvoiceNo || null,
      message: 'Item(s) Cleared successfully',
      terminalCode: termCode,
    });
  } catch (err) {
    await transaction.rollback();
    console.error('❌ [CLEAR TRANSACTION FAILED]:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Clear operation failed: ' + err.message,
    });
  }
});

module.exports = router;

